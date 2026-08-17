import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AssetKind, JobStatus } from "../../src/generated/prisma/client";
import { MockImageGenerationProvider } from "../../src/providers/mock-image-generation-provider";
import { GenerationService } from "../../src/services/generation-service";
import { JobService } from "../../src/services/job-service";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "../../src/storage/object-storage";
import { GenerationWorker } from "../../worker/generation-worker";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const ownerId = `t04-owner-${crypto.randomUUID()}`;
const otherOwnerId = `${ownerId}-other`;
let database: DatabaseClient;
let storage: MemoryObjectStorage;
let generationService: GenerationService;
let jobService: JobService;
let projectId: string;
let styleSpecRevisionId: string;
let productAssetId: string;

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  storage = new MemoryObjectStorage();
  generationService = new GenerationService(database, storage);
  jobService = new JobService(database);

  const project = await database.project.create({
    data: {
      ownerId,
      name: "T-04 project",
      productName: "Coffee cup",
      category: "Drinkware",
      sellingPoints: ["Lightweight"],
    },
  });
  projectId = project.id;
  const productAsset = await database.asset.create({
    data: {
      ownerId,
      projectId,
      kind: AssetKind.PRODUCT,
      objectKey: `tests/${projectId}/product.png`,
      mimeType: "image/png",
      byteSize: BigInt(3),
      width: 1,
      height: 1,
      sha256: "t04-product",
    },
  });
  productAssetId = productAsset.id;
  const revision = await database.styleSpecRevision.create({
    data: {
      ownerId,
      projectId,
      revisionNumber: 1,
      schemaVersion: "1.0",
      specJson: validStyleSpec(),
    },
  });
  styleSpecRevisionId = revision.id;
});

afterAll(async () => {
  await database.project.deleteMany({ where: { ownerId } });
  await database.$disconnect();
});

describe("T-04 image generation workflow", () => {
  it("is idempotent, atomically claimed and saves one background result", async () => {
    const request = {
      idempotencyKey: "t04-success-0001",
      styleSpecRevisionId,
    };
    const requestId = crypto.randomUUID();
    const created = await generationService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId,
      request,
    });
    const duplicate = await generationService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request,
    });

    expect(duplicate.id).toBe(created.id);
    expect(created.styleSpecRevisionId).toBe(styleSpecRevisionId);
    await expect(jobService.getJob(otherOwnerId, created.id)).rejects.toMatchObject(
      { code: "JOB_NOT_FOUND" },
    );
    await expect(
      generationService.createJob({
        ownerId,
        projectId,
        providerName: "mock",
        requestId: crypto.randomUUID(),
        request: {
          idempotencyKey: "t04-conflict-0002",
          styleSpecRevisionId,
        },
      }),
    ).rejects.toMatchObject({ code: "JOB_CONFLICT" });

    const workerA = new GenerationWorker(
      database,
      storage,
      new DelayedMockProvider(),
      5 * 60 * 1000,
      0,
    );
    const workerB = new GenerationWorker(
      database,
      storage,
      new DelayedMockProvider(),
      5 * 60 * 1000,
      0,
    );
    const claims = await Promise.all([workerA.runOnce(), workerB.runOnce()]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(jobService.getJob(ownerId, created.id)).resolves.toMatchObject({
      type: "IMAGE_GENERATION",
      status: JobStatus.SUCCEEDED,
      attemptCount: 1,
      providerName: "mock",
      providerRequestId: expect.any(String),
    });

    const generations = await generationService.listGenerations(
      ownerId,
      projectId,
    );
    expect(generations).toHaveLength(1);
    expect(generations[0]).toMatchObject({
      jobId: created.id,
      styleSpecRevisionId,
      status: "SUCCEEDED",
      resultUrl: `/api/projects/${projectId}/generations/${generations[0]!.id}/preview`,
      providerName: "mock",
      providerRequestId: expect.any(String),
      requestId,
      durationMs: expect.any(Number),
      usage: {
        generatedImages: 1,
        outputPixels: 800 * 800,
      },
      costMetadata: {
        status: "UNKNOWN",
        amount: null,
        currency: null,
        estimated: false,
        reason: "PRICING_NOT_VERIFIED",
      },
      asset: {
        mimeType: "image/png",
        width: 800,
        height: 800,
        previewUrl: `/api/projects/${projectId}/generations/${generations[0]!.id}/preview`,
      },
    });
    expect(storage.objects.size).toBe(1);

    const generatedAsset = await database.asset.findUnique({
      where: { id: generations[0]!.asset.id },
    });
    expect(generatedAsset).toMatchObject({
      kind: AssetKind.GENERATED_BACKGROUND,
      sourceAssetId: null,
    });
    await expect(
      database.asset.findUnique({ where: { id: productAssetId } }),
    ).resolves.toMatchObject({
      id: productAssetId,
      kind: AssetKind.PRODUCT,
      sha256: "t04-product",
    });

    await expect(
      generationService.getPreview({
        ownerId,
        projectId,
        generationId: generations[0]!.id,
      }),
    ).resolves.toMatchObject({ mimeType: "image/png" });
    await expect(
      generationService.getPreview({
        ownerId: otherOwnerId,
        projectId,
        generationId: generations[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "GENERATION_NOT_FOUND" });
  });

  it("rejects an inaccessible revision before creating a job", async () => {
    await expect(
      generationService.createJob({
        ownerId,
        projectId,
        providerName: "mock",
        requestId: crypto.randomUUID(),
        request: {
          idempotencyKey: "t04-missing-revision-0003",
          styleSpecRevisionId: "missing-revision",
        },
      }),
    ).rejects.toMatchObject({ code: "STYLE_SPEC_INVALID" });
  });

  it("fails invalid provider responses without creating assets or results", async () => {
    const job = await generationService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request: {
        idempotencyKey: "t04-invalid-0004",
        styleSpecRevisionId,
      },
    });
    const beforeAssets = await database.asset.count({
      where: { ownerId, projectId },
    });
    const worker = new GenerationWorker(
      database,
      storage,
      new MockImageGenerationProvider("invalid-response"),
      5 * 60 * 1000,
      0,
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(jobService.getJob(ownerId, job.id)).resolves.toMatchObject({
      status: JobStatus.FAILED,
      errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
    });
    await expect(
      database.generationResult.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(1);
    await expect(
      database.asset.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(beforeAssets);
    expect(storage.objects.size).toBe(1);
  });

  it("compensates the stored object when the result transaction fails", async () => {
    const job = await generationService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request: {
        idempotencyKey: "t04-compensation-0005",
        styleSpecRevisionId,
      },
    });
    const fixtureAsset = await database.asset.create({
      data: {
        ownerId,
        projectId,
        kind: AssetKind.GENERATED_BACKGROUND,
        objectKey: `tests/${projectId}/forced-conflict.png`,
        mimeType: "image/png",
        byteSize: BigInt(1),
        width: 1,
        height: 1,
        sha256: "forced-conflict",
      },
    });
    const conflictingResult = await database.generationResult.create({
      data: {
        ownerId,
        projectId,
        jobId: job.id,
        assetId: fixtureAsset.id,
        styleSpecRevisionId,
        providerName: "fixture",
        providerRequestId: "fixture-provider-request",
        requestId: "fixture-request",
        durationMs: 0,
        usageJson: {
          generatedImages: 1,
          inputUnits: null,
          outputPixels: 1,
        },
        costMetadataJson: {
          amount: "0.0000",
          currency: "USD",
          estimated: true,
        },
      },
    });
    const assetsBefore = await database.asset.count({
      where: { ownerId, projectId },
    });
    const objectsBefore = storage.objects.size;
    const deletesBefore = storage.deletes;
    const worker = new GenerationWorker(
      database,
      storage,
      new MockImageGenerationProvider("success"),
      5 * 60 * 1000,
      0,
    );

    await worker.runOnce();
    await expect(jobService.getJob(ownerId, job.id)).resolves.toMatchObject({
      status: JobStatus.FAILED,
      errorCode: "DATABASE_FAILED",
    });
    await expect(
      database.asset.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(assetsBefore);
    expect(storage.objects.size).toBe(objectsBefore);
    expect(storage.deletes).toBe(deletesBefore + 1);

    await database.generationResult.delete({
      where: { id: conflictingResult.id },
    });
    await database.asset.delete({ where: { id: fixtureAsset.id } });
  });

  it("retries rate limits only up to maxAttempts", async () => {
    const job = await generationService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request: {
        idempotencyKey: "t04-rate-limit-0006",
        styleSpecRevisionId,
      },
    });
    const worker = new GenerationWorker(
      database,
      storage,
      new MockImageGenerationProvider("rate-limited"),
      5 * 60 * 1000,
      0,
    );

    await worker.runOnce();
    await expect(jobService.getJob(ownerId, job.id)).resolves.toMatchObject({
      status: JobStatus.QUEUED,
      attemptCount: 1,
      errorCode: "PROVIDER_RATE_LIMITED",
    });
    await worker.runOnce();
    await expect(jobService.getJob(ownerId, job.id)).resolves.toMatchObject({
      status: JobStatus.FAILED,
      attemptCount: 2,
      errorCode: "PROVIDER_RATE_LIMITED",
    });
    await expect(
      database.generationResult.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(1);
  });
});

class DelayedMockProvider extends MockImageGenerationProvider {
  override async getJobStatus(
    input: Parameters<MockImageGenerationProvider["getJobStatus"]>[0],
  ) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return super.getJobStatus(input);
  }
}

class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, RetrievedObject>();
  deletes = 0;

  async putObject(object: StoredObject): Promise<void> {
    this.objects.set(object.key, {
      body: Uint8Array.from(object.body),
      contentType: object.contentType,
    });
  }

  async getObject(key: string): Promise<RetrievedObject> {
    const object = this.objects.get(key);
    if (!object) throw new Error("Object not found");
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    this.deletes += 1;
    this.objects.delete(key);
  }

  async checkConnection(): Promise<void> {}
}

function validStyleSpec() {
  return {
    schemaVersion: "1.0",
    summary: "Clean studio commerce style",
    moodKeywords: ["clean", "trusted"],
    palette: [{ hex: "#AABBCC", role: "Background" }],
    background: {
      scene: "Studio sweep",
      texture: "Matte",
      lighting: "Soft key light",
    },
    composition: {
      productPlacement: "Centered",
      cameraAngle: "Eye level",
      negativeSpace: "Above product",
    },
    typography: {
      tone: "Modern",
      recommendedStyles: ["Sans serif"],
    },
    decorations: [],
    negativeConstraints: ["Do not alter the product"],
  };
}
