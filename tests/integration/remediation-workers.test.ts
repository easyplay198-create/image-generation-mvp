import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AssetKind,
  BenchmarkJobStatus,
  BenchmarkVariant,
  JobStatus,
  JobType,
  PrismaClient,
  ProviderSubmissionState,
} from "@/src/generated/prisma/client";
import { BenchmarkService } from "@/src/benchmarks/benchmark-service";
import {
  PlainPromptQwenProvider,
  type PlainPromptGenerationResult,
} from "@/src/benchmarks/plain-prompt-qwen-provider";
import { MockImageGenerationProvider } from "@/src/providers/mock-image-generation-provider";
import type { ImageGenerationProvider } from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "@/src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "@/src/storage/object-storage";
import { BenchmarkWorker } from "@/worker/benchmark-worker";
import { GenerationWorker } from "@/worker/generation-worker";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for integration tests.");

const TIMEZONE_TEST_LEASE_TIMEOUT_MS = 5 * 60 * 1_000;

const HISTORICAL_MIGRATIONS = [
  "20260809152000_init",
  "20260809160000_asset_dimensions_required",
  "20260810090000_style_analysis_jobs",
  "20260810094500_generation_provider_metadata",
  "20260810095500_fabric_design_document",
  "20260813183000_benchmark_runs",
] as const;

const ownerId = `p1-owner-${crypto.randomUUID()}`;
let database: DatabaseClient;
let storage: MemoryStorage;
let projectId: string;
let revisionId: string;
let productAssetId: string;
let referenceAssetId: string;
let productPng: Buffer;

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  storage = new MemoryStorage();
  productPng = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#dd7700" },
  })
    .png()
    .toBuffer();
  const referencePng = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#eeeeee" },
  })
    .png()
    .toBuffer();
  const project = await database.project.create({
    data: {
      ownerId,
      name: "P1 remediation project",
      productName: "Generic product",
      category: "Accessories",
      sellingPoints: ["Compact"],
      forbiddenClaims: ["medical cure"],
    },
  });
  projectId = project.id;
  const productKey = `tests/${projectId}/product.png`;
  const referenceKey = `tests/${projectId}/reference.png`;
  const product = await database.asset.create({
    data: {
      ownerId,
      projectId,
      kind: AssetKind.PRODUCT,
      objectKey: productKey,
      mimeType: "image/png",
      byteSize: BigInt(productPng.byteLength),
      width: 800,
      height: 800,
      sha256: sha256(productPng),
    },
  });
  productAssetId = product.id;
  const reference = await database.asset.create({
    data: {
      ownerId,
      projectId,
      kind: AssetKind.REFERENCE,
      objectKey: referenceKey,
      mimeType: "image/png",
      byteSize: BigInt(referencePng.byteLength),
      width: 800,
      height: 800,
      sha256: sha256(referencePng),
    },
  });
  referenceAssetId = reference.id;
  storage.objects.set(productKey, {
    body: productPng,
    contentType: "image/png",
  });
  storage.objects.set(referenceKey, {
    body: referencePng,
    contentType: "image/png",
  });
  const revision = await database.styleSpecRevision.create({
    data: {
      ownerId,
      projectId,
      revisionNumber: 2,
      schemaVersion: "1.0",
      specJson: validStyleSpec(),
    },
  });
  revisionId = revision.id;
});

afterAll(async () => {
  await database.project.deleteMany({ where: { ownerId } });
  await database.$disconnect();
});

describe("PKG-AB P1 worker recovery and deduplication", () => {
  it("fences historical RUNNING rows during a real old-schema upgrade without provider replay", async () => {
    const schema = `pkg_ab_p1_r2_history_${crypto.randomUUID().replaceAll("-", "")}`;
    const administrator = new Client({ connectionString });
    const schemaConnectionString = withConnectionOptions(connectionString, [
      `-c search_path=${schema},public`,
      "-c timezone=Asia/Shanghai",
    ], schema);
    let administratorConnected = false;
    let historicalDatabase: DatabaseClient | undefined;
    try {
      await administrator.connect();
      administratorConnected = true;
      await administrator.query(`CREATE SCHEMA "${schema}"`);
      const historical = new Client({ connectionString: schemaConnectionString });
      await historical.connect();
      try {
        for (const migration of HISTORICAL_MIGRATIONS) {
          await historical.query(
            await readFile(
              join(process.cwd(), "prisma", "migrations", migration, "migration.sql"),
              "utf8",
            ),
          );
        }
        await historical.query(`
          INSERT INTO "Project" (
            "id", "ownerId", "name", "productName", "category",
            "sellingPoints", "forbiddenClaims", "updatedAt"
          ) VALUES (
            'history-project', 'history-owner', 'History', 'History Product',
            'History Category', ARRAY['stable'], ARRAY[]::TEXT[],
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          );
          INSERT INTO "Asset" (
            "id", "ownerId", "projectId", "kind", "objectKey", "mimeType",
            "byteSize", "width", "height", "sha256"
          ) VALUES (
            'history-product', 'history-owner', 'history-project', 'PRODUCT',
            'history/product.png', 'image/png', 1, 800, 800, '${"a".repeat(64)}'
          );
          INSERT INTO "StyleSpecRevision" (
            "id", "ownerId", "projectId", "revisionNumber", "schemaVersion", "specJson"
          ) VALUES (
            'history-revision', 'history-owner', 'history-project', 2, '1.0', '{}'
          );
          INSERT INTO "Job" (
            "id", "ownerId", "projectId", "type", "status", "idempotencyKey",
            "styleSpecRevisionId", "providerName", "providerRequestId", "inputJson",
            "attemptCount", "maxAttempts", "lockedAt", "updatedAt"
          ) VALUES (
            'history-generation', 'history-owner', 'history-project', 'IMAGE_GENERATION',
            'RUNNING', 'history-generation-key', 'history-revision', 'mock',
            'history-provider-request', '{}', 1, 2, NULL,
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          );
          INSERT INTO "BenchmarkRun" (
            "id", "ownerId", "projectId", "idempotencyKey", "sku", "providerName",
            "modelName", "outputWidth", "outputHeight", "productAssetId",
            "referenceAssetIds", "styleSpecRevisionId", "generationContextJson", "updatedAt"
          ) VALUES (
            'history-run', 'history-owner', 'history-project', 'history-run-key',
            'History Product', 'qwen', 'qwen-image-2.0', 800, 800,
            'history-product', ARRAY[]::TEXT[], 'history-revision', '{}',
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          );
          INSERT INTO "BenchmarkJob" (
            "id", "ownerId", "projectId", "benchmarkRunId", "variant", "status",
            "inputJson", "providerName", "providerRequestId", "updatedAt"
          ) VALUES (
            'history-benchmark', 'history-owner', 'history-project', 'history-run',
            'PLAIN_PROMPT', 'RUNNING', '{}', 'qwen', 'history-benchmark-request',
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          );
        `);
        await historical.query(
          await readFile(
            join(
              process.cwd(),
              "prisma",
              "migrations",
              "20260817090000_pkg_ab_p1_remediation",
              "migration.sql",
            ),
            "utf8",
          ),
        );
      } finally {
        await historical.end();
      }

      historicalDatabase = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: schemaConnectionString },
          { schema },
        ),
      });
      const generationProvider = new CountingMockProvider();
      const plainProvider = new SuccessfulPlainProvider(productPng);
      const generationWorker = new GenerationWorker(
        historicalDatabase,
        new MemoryStorage(),
        generationProvider,
        100,
        0,
      );
      const benchmarkWorker = new BenchmarkWorker(
        historicalDatabase,
        new MemoryStorage(),
        qwenStyleProvider,
        plainProvider,
        100,
      );

      await expect(
        historicalDatabase.job.findUnique({ where: { id: "history-generation" } }),
      ).resolves.toMatchObject({
        status: JobStatus.FAILED,
        providerRequestId: "history-provider-request",
        providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
        errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
        lockedAt: null,
      });
      await expect(
        historicalDatabase.benchmarkJob.findUnique({ where: { id: "history-benchmark" } }),
      ).resolves.toMatchObject({
        status: BenchmarkJobStatus.FAILED,
        providerRequestId: "history-benchmark-request",
        providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
        errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
        lockedAt: null,
      });
      await expect(generationWorker.runOnce()).resolves.toBe(false);
      await expect(benchmarkWorker.runOnce()).resolves.toBe(false);
      expect(generationProvider.calls).toBe(0);
      expect(plainProvider.calls).toBe(0);
    } finally {
      if (historicalDatabase) await historicalDatabase.$disconnect();
      if (administratorConnected) {
        await administrator.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await administrator.end();
      }
    }
  });

  it("recovers only pre-submission generation leases and fences ambiguous submissions", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1_000);
    const common = {
      ownerId,
      projectId,
      type: JobType.IMAGE_GENERATION,
      inputJson: legacyGenerationInput(),
      styleSpecRevisionId: revisionId,
      providerName: "mock",
      attemptCount: 1,
      maxAttempts: 2,
      lockedAt: old,
    };
    const safe = await database.job.create({
      data: {
        ...common,
        status: JobStatus.RUNNING,
        idempotencyKey: `safe-recovery-${crypto.randomUUID()}`,
        leaseToken: crypto.randomUUID(),
        providerSubmissionState: ProviderSubmissionState.NOT_STARTED,
      },
    });
    const ambiguous = await database.job.create({
      data: {
        ...common,
        status: JobStatus.RUNNING,
        idempotencyKey: `ambiguous-recovery-${crypto.randomUUID()}`,
        leaseToken: crypto.randomUUID(),
        providerSubmissionState: ProviderSubmissionState.SUBMITTING,
      },
    });
    const worker = new GenerationWorker(
      database,
      storage,
      new MockImageGenerationProvider(),
      100,
      0,
    );

    await expect(worker.recoverExpiredJobs()).resolves.toBe(2);
    await expect(database.job.findUnique({ where: { id: safe.id } })).resolves.toMatchObject({
      status: JobStatus.QUEUED,
      leaseToken: null,
      errorCode: "WORKER_LEASE_EXPIRED",
    });
    await expect(
      database.job.findUnique({ where: { id: ambiguous.id } }),
    ).resolves.toMatchObject({
      status: JobStatus.FAILED,
      leaseToken: null,
      providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
      errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
    });

    await worker.runOnce();
    await expect(database.job.findUnique({ where: { id: safe.id } })).resolves.toMatchObject({
      status: JobStatus.SUCCEEDED,
      providerSubmissionState: ProviderSubmissionState.COMPLETED,
    });
    const result = await database.generationResult.findUnique({ where: { jobId: safe.id } });
    expect(result).toBeTruthy();
    const generated = await database.asset.findUnique({ where: { id: result!.assetId } });
    expect(generated).toMatchObject({ width: 1080, height: 1080 });
  });

  it.each(["UTC", "Asia/Shanghai"])(
    "uses database UTC for null, expired, fresh, and ambiguous leases under %s",
    async (timezone) => {
      const zonedDatabase = createDatabaseClient(
        withConnectionOptions(connectionString, [`-c timezone=${timezone}`]),
      );
      const generationIds: string[] = [];
      const benchmarkRunIds: string[] = [];
      try {
        const generationCommon = {
          ownerId,
          projectId,
          type: JobType.IMAGE_GENERATION,
          status: JobStatus.RUNNING,
          inputJson: legacyGenerationInput(),
          styleSpecRevisionId: revisionId,
          providerName: "mock",
          attemptCount: 1,
          maxAttempts: 2,
          leaseToken: crypto.randomUUID(),
        };
        const expiredGeneration = await zonedDatabase.job.create({
          data: {
            ...generationCommon,
            idempotencyKey: `timezone-expired-${timezone}-${crypto.randomUUID()}`,
          },
        });
        const nullGeneration = await zonedDatabase.job.create({
          data: {
            ...generationCommon,
            idempotencyKey: `timezone-null-${timezone}-${crypto.randomUUID()}`,
          },
        });
        const freshGeneration = await zonedDatabase.job.create({
          data: {
            ...generationCommon,
            idempotencyKey: `timezone-fresh-${timezone}-${crypto.randomUUID()}`,
          },
        });
        const ambiguousGeneration = await zonedDatabase.job.create({
          data: {
            ...generationCommon,
            idempotencyKey: `timezone-ambiguous-${timezone}-${crypto.randomUUID()}`,
            providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
          },
        });
        generationIds.push(
          expiredGeneration.id,
          nullGeneration.id,
          freshGeneration.id,
          ambiguousGeneration.id,
        );
        await zonedDatabase.$executeRaw`
          UPDATE "Job"
          SET "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 hour'
          WHERE "id" = ${expiredGeneration.id}
        `;
        await zonedDatabase.$executeRaw`
          UPDATE "Job"
          SET "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          WHERE "id" = ${freshGeneration.id}
        `;

        const benchmarkRun = await zonedDatabase.benchmarkRun.create({
          data: {
            ownerId,
            projectId,
            idempotencyKey: `timezone-run-${timezone}-${crypto.randomUUID()}`,
            experimentFingerprint: `timezone-fingerprint-${timezone}-${crypto.randomUUID()}`,
            sku: "Generic product",
            providerName: "qwen",
            modelName: "qwen-image-2.0",
            outputWidth: 800,
            outputHeight: 800,
            productAssetId,
            referenceAssetIds: [referenceAssetId],
            styleSpecRevisionId: revisionId,
            generationContextJson: {},
          },
        });
        benchmarkRunIds.push(benchmarkRun.id);
        const benchmarkCommon = {
          ownerId,
          projectId,
          benchmarkRunId: benchmarkRun.id,
          providerName: "qwen",
          status: BenchmarkJobStatus.RUNNING,
          attemptCount: 1,
          maxAttempts: 2,
          leaseToken: crypto.randomUUID(),
          inputJson: {},
        };
        const expiredBenchmark = await zonedDatabase.benchmarkJob.create({
          data: {
            ...benchmarkCommon,
            variant: BenchmarkVariant.PLAIN_PROMPT,
          },
        });
        const nullBenchmark = await zonedDatabase.benchmarkJob.create({
          data: {
            ...benchmarkCommon,
            variant: BenchmarkVariant.STYLE_SPEC,
          },
        });
        const auxiliaryRun = await zonedDatabase.benchmarkRun.create({
          data: {
            ownerId,
            projectId,
            idempotencyKey: `timezone-run-aux-${timezone}-${crypto.randomUUID()}`,
            experimentFingerprint: `timezone-fingerprint-aux-${timezone}-${crypto.randomUUID()}`,
            sku: "Generic product",
            providerName: "qwen",
            modelName: "qwen-image-2.0",
            outputWidth: 800,
            outputHeight: 800,
            productAssetId,
            referenceAssetIds: [referenceAssetId],
            styleSpecRevisionId: revisionId,
            generationContextJson: {},
          },
        });
        benchmarkRunIds.push(auxiliaryRun.id);
        const freshBenchmark = await zonedDatabase.benchmarkJob.create({
          data: {
            ...benchmarkCommon,
            benchmarkRunId: auxiliaryRun.id,
            variant: BenchmarkVariant.PLAIN_PROMPT,
          },
        });
        const ambiguousBenchmark = await zonedDatabase.benchmarkJob.create({
          data: {
            ...benchmarkCommon,
            benchmarkRunId: auxiliaryRun.id,
            variant: BenchmarkVariant.STYLE_SPEC,
            providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
          },
        });
        await zonedDatabase.$executeRaw`
          UPDATE "BenchmarkJob"
          SET "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 hour'
          WHERE "id" = ${expiredBenchmark.id}
        `;
        await zonedDatabase.$executeRaw`
          UPDATE "BenchmarkJob"
          SET "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          WHERE "id" = ${freshBenchmark.id}
        `;

        // This case verifies timezone semantics and must not depend on 100 ms execution timing.
        const generationWorker = new GenerationWorker(
          zonedDatabase,
          storage,
          new MockImageGenerationProvider(),
          TIMEZONE_TEST_LEASE_TIMEOUT_MS,
          0,
        );
        const benchmarkWorker = new BenchmarkWorker(
          zonedDatabase,
          storage,
          qwenStyleProvider,
          new SuccessfulPlainProvider(productPng),
          TIMEZONE_TEST_LEASE_TIMEOUT_MS,
        );
        await expect(generationWorker.recoverExpiredJobs()).resolves.toBe(3);
        await expect(benchmarkWorker.recoverExpiredJobs()).resolves.toBe(3);

        await expect(
          zonedDatabase.job.findUnique({ where: { id: expiredGeneration.id } }),
        ).resolves.toMatchObject({ status: JobStatus.QUEUED });
        await expect(
          zonedDatabase.job.findUnique({ where: { id: nullGeneration.id } }),
        ).resolves.toMatchObject({ status: JobStatus.QUEUED });
        await expect(
          zonedDatabase.job.findUnique({ where: { id: freshGeneration.id } }),
        ).resolves.toMatchObject({ status: JobStatus.RUNNING });
        await expect(
          zonedDatabase.job.findUnique({ where: { id: ambiguousGeneration.id } }),
        ).resolves.toMatchObject({
          status: JobStatus.FAILED,
          providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
        });
        await expect(
          zonedDatabase.benchmarkJob.findUnique({ where: { id: nullBenchmark.id } }),
        ).resolves.toMatchObject({ status: BenchmarkJobStatus.QUEUED });
        await expect(
          zonedDatabase.benchmarkJob.findUnique({ where: { id: freshBenchmark.id } }),
        ).resolves.toMatchObject({ status: BenchmarkJobStatus.RUNNING });
        await expect(
          zonedDatabase.benchmarkJob.findUnique({ where: { id: ambiguousBenchmark.id } }),
        ).resolves.toMatchObject({
          status: BenchmarkJobStatus.FAILED,
          providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
        });
      } finally {
        await zonedDatabase.job.deleteMany({ where: { id: { in: generationIds } } });
        if (benchmarkRunIds.length > 0) {
          await zonedDatabase.benchmarkRun.deleteMany({
            where: { id: { in: benchmarkRunIds } },
          });
        }
        await zonedDatabase.$disconnect();
      }
    },
  );

  it("deduplicates concurrent canonical benchmark creation despite different client keys", async () => {
    const service = new BenchmarkService(database);
    const request = {
      plainPrompt:
        "Generate one clean generic product image while preserving product identity and adding no text or claims.",
      styleSpecRevisionId: revisionId,
    };
    const [first, second] = await Promise.all([
      service.createRun({
        ownerId,
        projectId,
        request: { ...request, idempotencyKey: `canonical-a-${crypto.randomUUID()}` },
        providerName: "qwen",
        modelName: "qwen-image-2.0",
      }),
      service.createRun({
        ownerId,
        projectId,
        request: { ...request, idempotencyKey: `canonical-b-${crypto.randomUUID()}` },
        providerName: "qwen",
        modelName: "qwen-image-2.0",
      }),
    ]);
    expect(first.id).toBe(second.id);
    await expect(
      database.benchmarkRun.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(1);
    await database.benchmarkRun.delete({ where: { id: first.id } });
  });

  it("creates a new persisted experiment for every material product or asset change", async () => {
    const service = new BenchmarkService(database);
    const projectBefore = await database.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const productBefore = await database.asset.findUniqueOrThrow({
      where: { id: productAssetId },
    });
    const runIds: string[] = [];
    const create = async (label: string) => {
      const run = await service.createRun({
        ownerId,
        projectId,
        request: {
          idempotencyKey: `fingerprint-${label}-${crypto.randomUUID()}`,
          plainPrompt: "Generate one stable product sample without text or claims.",
          styleSpecRevisionId: revisionId,
        },
        providerName: "qwen",
        modelName: "qwen-image-2.0",
      });
      runIds.push(run.id);
      return run;
    };

    try {
      await create("baseline");
      await database.project.update({
        where: { id: projectId },
        data: { productName: "Changed product name" },
      });
      const productNameRun = await create("product-name");
      expect(
        productNameRun.jobs.find((job) => job.variant === "STYLE_SPEC")?.input,
      ).toMatchObject({
        variant: "STYLE_SPEC",
        productContext: { productName: "Changed product name" },
      });
      await database.project.update({
        where: { id: projectId },
        data: { category: "Changed category" },
      });
      await create("category");
      await database.project.update({
        where: { id: projectId },
        data: { sellingPoints: ["Changed selling point"] },
      });
      await create("selling-points");
      await database.project.update({
        where: { id: projectId },
        data: { targetAudience: "Changed audience" },
      });
      await create("target-audience");
      await database.project.update({
        where: { id: projectId },
        data: { forbiddenClaims: ["Changed forbidden claim"] },
      });
      await create("forbidden-claims");
      await database.asset.update({
        where: { id: productAssetId },
        data: { sha256: "b".repeat(64) },
      });
      const productHashRun = await create("product-hash");
      expect(
        productHashRun.jobs.find((job) => job.variant === "STYLE_SPEC")?.input,
      ).toMatchObject({
        productReference: { sha256: "b".repeat(64) },
      });

      expect(new Set(runIds).size).toBe(runIds.length);
      expect(runIds).toHaveLength(7);
    } finally {
      await database.benchmarkRun.deleteMany({ where: { id: { in: runIds } } });
      await database.asset.update({
        where: { id: productAssetId },
        data: { sha256: productBefore.sha256 },
      });
      await database.project.update({
        where: { id: projectId },
        data: {
          productName: projectBefore.productName,
          category: projectBefore.category,
          sellingPoints: projectBefore.sellingPoints,
          targetAudience: projectBefore.targetAudience,
          forbiddenClaims: projectBefore.forbiddenClaims,
        },
      });
    }
  });

  it.each(["UTC", "Asia/Shanghai"])(
    "keeps a generation heartbeat alive under %s while a provider call exceeds the lease window",
    async (timezone) => {
    const heartbeatDatabase = createDatabaseClient(
      withConnectionOptions(connectionString, [`-c timezone=${timezone}`]),
    );
    try {
    const job = await heartbeatDatabase.job.create({
      data: {
        ownerId,
        projectId,
        type: JobType.IMAGE_GENERATION,
        status: JobStatus.QUEUED,
        idempotencyKey: `heartbeat-generation-${crypto.randomUUID()}`,
        inputJson: legacyGenerationInput(),
        styleSpecRevisionId: revisionId,
        providerName: "mock",
      },
    });
    const activeWorker = new GenerationWorker(
      heartbeatDatabase,
      storage,
      new SlowMockProvider(),
      30,
      0,
    );
    const recoveryWorker = new GenerationWorker(
      heartbeatDatabase,
      storage,
      new MockImageGenerationProvider(),
      30,
      0,
    );

    const running = activeWorker.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 70));
    await expect(recoveryWorker.recoverExpiredJobs()).resolves.toBe(0);
    await expect(running).resolves.toBe(true);
    await expect(heartbeatDatabase.job.findUnique({ where: { id: job.id } })).resolves.toMatchObject({
      status: JobStatus.SUCCEEDED,
      providerSubmissionState: ProviderSubmissionState.COMPLETED,
    });
    } finally {
      await heartbeatDatabase.$disconnect();
    }
  },
  );

  it("does not resubmit an ambiguous benchmark provider call", async () => {
    const run = await createDirectBenchmarkRun("ambiguous");
    const job = await createPlainBenchmarkJob(run.id);
    const plain = new AmbiguousPlainProvider();
    const worker = new BenchmarkWorker(
      database,
      storage,
      qwenStyleProvider,
      plain,
      100,
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(database.benchmarkJob.findUnique({ where: { id: job.id } })).resolves.toMatchObject({
      status: BenchmarkJobStatus.FAILED,
      attemptCount: 1,
      providerSubmissionState: ProviderSubmissionState.AMBIGUOUS,
      errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
    });
    await expect(worker.runOnce()).resolves.toBe(false);
    expect(plain.calls).toBe(1);
  });

  it.each(["UTC", "Asia/Shanghai"])(
    "keeps a benchmark heartbeat alive under %s during a slow provider call",
    async (timezone) => {
    const heartbeatDatabase = createDatabaseClient(
      withConnectionOptions(connectionString, [`-c timezone=${timezone}`]),
    );
    try {
    const run = await createDirectBenchmarkRun("heartbeat");
    const job = await createPlainBenchmarkJob(run.id);
    const activeWorker = new BenchmarkWorker(
      heartbeatDatabase,
      storage,
      qwenStyleProvider,
      new SuccessfulPlainProvider(productPng, 120),
      30,
    );
    const recoveryWorker = new BenchmarkWorker(
      heartbeatDatabase,
      storage,
      qwenStyleProvider,
      new SuccessfulPlainProvider(productPng),
      30,
    );

    const running = activeWorker.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 70));
    await expect(recoveryWorker.recoverExpiredJobs()).resolves.toBe(0);
    await expect(running).resolves.toBe(true);
    await expect(heartbeatDatabase.benchmarkJob.findUnique({ where: { id: job.id } })).resolves.toMatchObject({
      status: BenchmarkJobStatus.SUCCEEDED,
      providerSubmissionState: ProviderSubmissionState.COMPLETED,
    });
    } finally {
      await heartbeatDatabase.$disconnect();
    }
  },
  );

  it("reports benchmark object compensation failure instead of swallowing it", async () => {
    const run = await createDirectBenchmarkRun("compensation");
    const job = await createPlainBenchmarkJob(run.id);
    const fixture = await database.asset.create({
      data: {
        ownerId,
        projectId,
        kind: AssetKind.GENERATED_BACKGROUND,
        objectKey: `tests/${projectId}/compensation-fixture.png`,
        mimeType: "image/png",
        byteSize: BigInt(1),
        width: 1,
        height: 1,
        sha256: "f".repeat(64),
      },
    });
    await database.benchmarkResult.create({
      data: {
        ownerId,
        projectId,
        benchmarkJobId: job.id,
        assetId: fixture.id,
        providerName: "fixture",
        providerRequestId: "fixture-request",
        requestId: crypto.randomUUID(),
        durationMs: 1,
        usageJson: { generatedImages: 1, inputUnits: null, outputPixels: 1 },
        costMetadataJson: {
          status: "UNKNOWN",
          amount: null,
          currency: null,
          estimated: false,
          reason: "PRICING_NOT_VERIFIED",
        },
      },
    });
    storage.failDeletes = true;
    const worker = new BenchmarkWorker(
      database,
      storage,
      qwenStyleProvider,
      new SuccessfulPlainProvider(productPng),
      5 * 60 * 1_000,
    );

    await worker.runOnce();
    storage.failDeletes = false;
    await expect(database.benchmarkJob.findUnique({ where: { id: job.id } })).resolves.toMatchObject({
      status: BenchmarkJobStatus.FAILED,
      errorCode: "STORAGE_COMPENSATION_FAILED",
    });
    const publicRun = await new BenchmarkService(database).getRun(
      ownerId,
      projectId,
      run.id,
    );
    expect(publicRun.jobs[0]?.errorMessage).toBe(
      "结果保存失败；补偿清理需要人工核查。",
    );
    expect(publicRun.jobs[0]?.errorMessage).not.toContain("事务");
  });
});

function legacyGenerationInput() {
  return {
    schemaVersion: "1.0",
    requestId: crypto.randomUUID(),
    idempotencyKey: `legacy-input-${crypto.randomUUID()}`,
    styleSpecRevisionId: revisionId,
    productContext: {
      productName: "Generic product",
      category: "Accessories",
      sellingPoints: ["Compact"],
      targetAudience: null,
      forbiddenClaims: [],
    },
    canvas: { width: 1080, height: 1080 },
  };
}

async function createDirectBenchmarkRun(label: string) {
  return database.benchmarkRun.create({
    data: {
      ownerId,
      projectId,
      idempotencyKey: `${label}-${crypto.randomUUID()}`,
      experimentFingerprint: `${label}-${crypto.randomUUID()}`,
      sku: "Generic product",
      providerName: "qwen",
      modelName: "qwen-image-2.0",
      outputWidth: 800,
      outputHeight: 800,
      productAssetId,
      referenceAssetIds: [referenceAssetId],
      styleSpecRevisionId: revisionId,
      generationContextJson: {},
    },
  });
}

async function createPlainBenchmarkJob(benchmarkRunId: string) {
  const product = await database.asset.findUniqueOrThrow({ where: { id: productAssetId } });
  return database.benchmarkJob.create({
    data: {
      ownerId,
      projectId,
      benchmarkRunId,
      variant: BenchmarkVariant.PLAIN_PROMPT,
      status: BenchmarkJobStatus.QUEUED,
      providerName: "qwen",
      inputJson: {
        schemaVersion: "1.0",
        requestId: crypto.randomUUID(),
        modelName: "qwen-image-2.0",
        variant: "PLAIN_PROMPT",
        prompt: "Generate a clean generic product sample with no text, logo, price, people, or watermark.",
        productReference: {
          assetId: product.id,
          mimeType: product.mimeType,
          width: product.width,
          height: product.height,
          byteSize: Number(product.byteSize),
          sha256: product.sha256,
        },
        canvas: { width: 800, height: 800 },
      },
    },
  });
}

class AmbiguousPlainProvider extends PlainPromptQwenProvider {
  calls = 0;

  constructor() {
    super(fakePlainOptions());
  }

  override async generate(): Promise<PlainPromptGenerationResult> {
    this.calls += 1;
    throw new ProviderAdapterError(
      "PROVIDER_TIMEOUT",
      true,
      "ambiguous fixture",
      null,
      "MAY_HAVE_BEEN_ACCEPTED",
    );
  }
}

class SlowMockProvider extends MockImageGenerationProvider {
  override async generateBackground(
    input: Parameters<MockImageGenerationProvider["generateBackground"]>[0],
  ) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return super.generateBackground(input);
  }
}

class CountingMockProvider extends MockImageGenerationProvider {
  calls = 0;

  override async generateBackground(
    input: Parameters<MockImageGenerationProvider["generateBackground"]>[0],
  ) {
    this.calls += 1;
    return super.generateBackground(input);
  }
}

class SuccessfulPlainProvider extends PlainPromptQwenProvider {
  calls = 0;

  constructor(
    private readonly image: Uint8Array,
    private readonly delayMs = 0,
  ) {
    super(fakePlainOptions());
  }

  override async generate(): Promise<PlainPromptGenerationResult> {
    this.calls += 1;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return {
      providerRequestId: `success-${crypto.randomUUID()}`,
      image: { body: this.image, mimeType: "image/png" },
      rawUsage: { generatedImages: 1, width: 800, height: 800 },
    };
  }
}

function fakePlainOptions() {
  return {
    apiKey: "test-key",
    endpoint:
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    modelName: "qwen-image-2.0",
    timeoutMs: 1_000,
    fetchImpl: (() => {
      throw new Error("Network must not be used in remediation tests.");
    }) as typeof fetch,
  };
}

const qwenStyleProvider: ImageGenerationProvider = {
  name: "qwen",
  async generateBackground() {
    throw new Error("Style provider is not used by plain benchmark fixtures.");
  },
  async getJobStatus() {
    return { status: "PENDING" };
  },
  normalizeUsage() {
    return {
      generatedImages: 1,
      inputUnits: null,
      outputPixels: 640_000,
      costMetadata: {
        status: "UNKNOWN",
        amount: null,
        currency: null,
        estimated: false,
        reason: "PRICING_NOT_VERIFIED",
      },
    };
  },
};

class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, RetrievedObject>();
  failDeletes = false;

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
    if (this.failDeletes) throw new Error("Compensation deletion failed");
    this.objects.delete(key);
  }

  async checkConnection(): Promise<void> {}
}

function sha256(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function withConnectionOptions(
  value: string,
  options: readonly string[],
  schema?: string,
): string {
  const url = new URL(value);
  if (schema) url.searchParams.set("schema", schema);
  const existing = url.searchParams.get("options")?.trim();
  url.searchParams.set(
    "options",
    [...(existing ? [existing] : []), ...options].join(" "),
  );
  return url.toString();
}

function validStyleSpec() {
  return {
    schemaVersion: "1.0",
    summary: "Clean neutral commerce background",
    moodKeywords: ["clean", "neutral"],
    palette: [{ hex: "#EEEEEE", role: "Background" }],
    background: { scene: "Studio", texture: "Matte", lighting: "Soft" },
    composition: {
      productPlacement: "Centered",
      cameraAngle: "Eye level",
      negativeSpace: "Balanced",
    },
    typography: { tone: "Modern", recommendedStyles: ["Sans serif"] },
    decorations: [],
    negativeConstraints: ["No extra text"],
  };
}
