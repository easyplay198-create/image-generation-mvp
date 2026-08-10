import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AssetKind, JobStatus, JobType } from "../../src/generated/prisma/client";
import { MockStyleAnalyzerProvider } from "../../src/providers/mock-style-analyzer-provider";
import { StyleAnalysisJobService } from "../../src/services/style-analysis-job-service";
import { StyleSpecService } from "../../src/services/style-spec-service";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "../../src/storage/object-storage";
import { StyleAnalysisWorker } from "../../worker/style-analysis-worker";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const ownerId = `t03-owner-${crypto.randomUUID()}`;
const otherOwnerId = `${ownerId}-other`;
let database: DatabaseClient;
let storage: MemoryObjectStorage;
let jobService: StyleAnalysisJobService;
let styleSpecService: StyleSpecService;
let projectId: string;

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  storage = new MemoryObjectStorage();
  jobService = new StyleAnalysisJobService(database);
  styleSpecService = new StyleSpecService(database);

  const project = await database.project.create({
    data: {
      ownerId,
      name: "T-03 project",
      productName: "Coffee cup",
      category: "Drinkware",
      sellingPoints: ["Lightweight"],
    },
  });
  projectId = project.id;

  const objectKey = `tests/${project.id}/reference.png`;
  storage.objects.set(objectKey, {
    body: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
  });
  await database.asset.create({
    data: {
      ownerId,
      projectId,
      kind: AssetKind.REFERENCE,
      objectKey,
      mimeType: "image/png",
      byteSize: BigInt(3),
      width: 1,
      height: 1,
      sha256: "t03-reference",
    },
  });
});

afterAll(async () => {
  await database.project.deleteMany({ where: { ownerId } });
  await database.$disconnect();
});

describe("T-03 StyleSpec analysis workflow", () => {
  it("is idempotent, owner-scoped, atomically claimed and saves revisions", async () => {
    const request = { idempotencyKey: "t03-success-0001" };
    const created = await jobService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request,
    });
    const duplicate = await jobService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request,
    });

    expect(duplicate.id).toBe(created.id);
    await expect(jobService.getJob(otherOwnerId, created.id)).rejects.toMatchObject(
      { code: "JOB_NOT_FOUND" },
    );
    await expect(
      jobService.createJob({
        ownerId,
        projectId,
        providerName: "mock",
        requestId: crypto.randomUUID(),
        request: { idempotencyKey: "t03-conflict-0002" },
      }),
    ).rejects.toMatchObject({ code: "JOB_CONFLICT" });

    const workerA = new StyleAnalysisWorker(
      database,
      storage,
      new DelayedMockProvider(),
    );
    const workerB = new StyleAnalysisWorker(
      database,
      storage,
      new DelayedMockProvider(),
    );
    const claims = await Promise.all([workerA.runOnce(), workerB.runOnce()]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(jobService.getJob(ownerId, created.id)).resolves.toMatchObject({
      status: JobStatus.SUCCEEDED,
      attemptCount: 1,
      styleSpecRevisionId: expect.any(String),
    });

    const analyzed = await styleSpecService.getState(ownerId, projectId);
    expect(analyzed.latestRevision).toMatchObject({
      revisionNumber: 1,
      schemaVersion: "1.0",
    });
    await expect(
      styleSpecService.getState(otherOwnerId, projectId),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });

    const editedSpec = {
      ...analyzed.latestRevision!.spec,
      summary: "User edited summary",
    };
    const edited = await styleSpecService.saveUserRevision({
      ownerId,
      projectId,
      spec: editedSpec,
    });
    expect(edited).toMatchObject({
      revisionNumber: 2,
      spec: { summary: "User edited summary" },
    });

    await expect(
      styleSpecService.saveUserRevision({
        ownerId,
        projectId,
        spec: { schemaVersion: "1.0", summary: "incomplete" },
      }),
    ).rejects.toMatchObject({ code: "STYLE_SPEC_INVALID" });
    await expect(
      database.styleSpecRevision.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(2);
  });

  it("fails invalid provider JSON without writing a revision", async () => {
    const job = await jobService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request: { idempotencyKey: "t03-invalid-0003" },
    });
    const worker = new StyleAnalysisWorker(
      database,
      storage,
      new MockStyleAnalyzerProvider("invalid-response"),
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(jobService.getJob(ownerId, job.id)).resolves.toMatchObject({
      status: JobStatus.FAILED,
      errorCode: "PROVIDER_INVALID_RESPONSE",
      styleSpecRevisionId: null,
    });
    await expect(
      database.styleSpecRevision.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(2);
  });

  it("retries only retryable failures up to maxAttempts", async () => {
    const job = await jobService.createJob({
      ownerId,
      projectId,
      providerName: "mock",
      requestId: crypto.randomUUID(),
      request: { idempotencyKey: "t03-rate-limit-0004" },
    });
    const worker = new StyleAnalysisWorker(
      database,
      storage,
      new MockStyleAnalyzerProvider("rate-limited"),
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
  });

  it("recovers expired running jobs and fails exhausted leases", async () => {
    const stale = new Date(Date.now() - 60_000);
    const retryable = await database.job.create({
      data: {
        ownerId,
        projectId,
        type: JobType.STYLE_ANALYSIS,
        status: JobStatus.RUNNING,
        inputJson: {},
        providerName: "mock",
        attemptCount: 1,
        maxAttempts: 2,
        lockedAt: stale,
      },
    });
    const exhausted = await database.job.create({
      data: {
        ownerId,
        projectId,
        type: JobType.STYLE_ANALYSIS,
        status: JobStatus.RUNNING,
        inputJson: {},
        providerName: "mock",
        attemptCount: 2,
        maxAttempts: 2,
        lockedAt: stale,
      },
    });
    const worker = new StyleAnalysisWorker(
      database,
      storage,
      new MockStyleAnalyzerProvider(),
      1,
    );

    await expect(worker.recoverExpiredJobs()).resolves.toBe(2);
    await expect(database.job.findUnique({ where: { id: retryable.id } })).resolves.toMatchObject({
      status: JobStatus.QUEUED,
      errorCode: "WORKER_LEASE_EXPIRED",
    });
    await expect(database.job.findUnique({ where: { id: exhausted.id } })).resolves.toMatchObject({
      status: JobStatus.FAILED,
      errorCode: "WORKER_LEASE_EXPIRED",
    });
  });
});

class DelayedMockProvider extends MockStyleAnalyzerProvider {
  override async analyze(
    input: Parameters<MockStyleAnalyzerProvider["analyze"]>[0],
  ) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return super.analyze(input);
  }
}

class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, RetrievedObject>();

  async putObject(object: StoredObject): Promise<void> {
    this.objects.set(object.key, {
      body: object.body,
      contentType: object.contentType,
    });
  }

  async getObject(key: string): Promise<RetrievedObject> {
    const object = this.objects.get(key);
    if (!object) throw new Error("Object not found");
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async checkConnection(): Promise<void> {}
}
