import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { BenchmarkJob } from "@/src/generated/prisma/client";
import { AssetKind, BenchmarkJobStatus } from "@/src/generated/prisma/client";
import {
  parseBenchmarkJobInput,
  type BenchmarkAssetSnapshot,
} from "@/src/benchmarks/benchmark-contract";
import type { PlainPromptQwenProvider } from "@/src/benchmarks/plain-prompt-qwen-provider";
import {
  validateGeneratedBackground,
  validateNormalizedGenerationUsage,
} from "@/src/domain/generated-background";
import { parseStyleSpecV1 } from "@/src/domain/style-spec";
import type { ImageGenerationProvider } from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

export class BenchmarkWorker {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly styleProvider: ImageGenerationProvider,
    private readonly plainProvider: PlainPromptQwenProvider,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.claimNextJob();
    if (!job) return false;

    let providerRequestId: string | null = null;
    try {
      const input = parseBenchmarkJobInput(job.inputJson);
      if (
        job.providerName !== "qwen" ||
        this.styleProvider.name !== "qwen" ||
        this.plainProvider.name !== "qwen" ||
        this.plainProvider.modelName !== input.modelName
      ) {
        throw new Error("Benchmark provider/model invariant was violated.");
      }

      const product = await this.loadAsset(
        job,
        input.productReference,
        AssetKind.PRODUCT,
      );
      const startedAt = Date.now();
      let image;
      let usage;

      if (input.variant === "PLAIN_PROMPT") {
        const output = await this.plainProvider.generate({
          prompt: input.prompt,
          productReference: product,
          canvas: input.canvas,
        });
        providerRequestId = output.providerRequestId;
        image = await validateGeneratedBackground(
          output.image,
          input.canvas,
          providerRequestId,
        );
        usage = validateNormalizedGenerationUsage(
          this.plainProvider.normalizeUsage(output.rawUsage),
          providerRequestId,
        );
      } else {
        const run = await this.database.benchmarkRun.findFirst({
          where: {
            id: job.benchmarkRunId,
            ownerId: job.ownerId,
            projectId: job.projectId,
            styleSpecRevisionId: input.styleSpecRevisionId,
            modelName: input.modelName,
          },
        });
        if (
          !run ||
          !isDeepStrictEqual(run.generationContextJson, input.generationContext)
        ) {
          throw new Error("Benchmark Generation Context snapshot changed.");
        }
        const revision = await this.database.styleSpecRevision.findFirst({
          where: {
            id: input.styleSpecRevisionId,
            ownerId: job.ownerId,
            projectId: job.projectId,
            revisionNumber: 2,
          },
        });
        if (!revision) throw new Error("Benchmark StyleSpec revision 2 is missing.");
        const visualReferences = await Promise.all(
          input.visualReferences.map((snapshot) =>
            this.loadAsset(job, snapshot, AssetKind.REFERENCE),
          ),
        );
        const submission = await this.styleProvider.generateBackground({
          projectId: job.projectId,
          styleSpec: parseStyleSpecV1(revision.specJson),
          productContext: input.productContext,
          canvas: input.canvas,
          idempotencyKey: `${job.benchmarkRunId}:style-spec`,
          productReference: product,
          visualReferences,
        });
        providerRequestId = submission.providerRequestId;
        const status = await this.styleProvider.getJobStatus({ providerRequestId });
        if (status.status !== "SUCCEEDED") {
          throw new ProviderAdapterError(
            "PROVIDER_TIMEOUT",
            true,
            "Benchmark StyleSpec Provider 尚未完成。",
            providerRequestId,
          );
        }
        image = await validateGeneratedBackground(
          status.image,
          input.canvas,
          providerRequestId,
        );
        usage = validateNormalizedGenerationUsage(
          this.styleProvider.normalizeUsage(status.rawUsage),
          providerRequestId,
        );
      }

      await this.storeResult({
        job,
        requestId: input.requestId,
        providerRequestId,
        durationMs: Date.now() - startedAt,
        productAssetId: input.productReference.assetId,
        image,
        usage,
      });
    } catch (error) {
      const failure = normalizeFailure(error, providerRequestId);
      await this.database.benchmarkJob.updateMany({
        where: {
          id: job.id,
          ownerId: job.ownerId,
          status: BenchmarkJobStatus.RUNNING,
        },
        data: {
          status: BenchmarkJobStatus.FAILED,
          providerRequestId: failure.providerRequestId,
          errorCode: failure.code,
          errorMessage: failure.message,
          finishedAt: new Date(),
        },
      });
    }

    return true;
  }

  private async claimNextJob(): Promise<BenchmarkJob | null> {
    const jobs = await this.database.$queryRaw<BenchmarkJob[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "BenchmarkJob"
        WHERE "status" = 'QUEUED'::"BenchmarkJobStatus"
          AND "providerName" = ${this.styleProvider.name}
        ORDER BY "createdAt" ASC, "variant" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "BenchmarkJob" AS job
      SET
        "status" = 'RUNNING'::"BenchmarkJobStatus",
        "startedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        "finishedAt" = NULL,
        "errorCode" = NULL,
        "errorMessage" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `;
    return jobs[0] ?? null;
  }

  private async loadAsset(
    job: BenchmarkJob,
    snapshot: BenchmarkAssetSnapshot,
    kind: typeof AssetKind.PRODUCT | typeof AssetKind.REFERENCE,
  ) {
    const asset = await this.database.asset.findFirst({
      where: {
        id: snapshot.assetId,
        ownerId: job.ownerId,
        projectId: job.projectId,
        kind,
      },
    });
    if (
      !asset ||
      asset.mimeType !== snapshot.mimeType ||
      asset.width !== snapshot.width ||
      asset.height !== snapshot.height ||
      Number(asset.byteSize) !== snapshot.byteSize ||
      asset.sha256 !== snapshot.sha256
    ) {
      throw new Error("Benchmark asset snapshot changed.");
    }
    const object = await this.storage.getObject(asset.objectKey);
    if (
      object.contentType.toLowerCase() !== asset.mimeType.toLowerCase() ||
      object.body.byteLength !== Number(asset.byteSize) ||
      createHash("sha256").update(object.body).digest("hex") !== asset.sha256
    ) {
      throw new Error("Benchmark asset object does not match its snapshot.");
    }
    return {
      assetId: asset.id,
      body: object.body,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    };
  }

  private async storeResult(input: {
    job: BenchmarkJob;
    requestId: string;
    providerRequestId: string;
    durationMs: number;
    productAssetId: string;
    image: Awaited<ReturnType<typeof validateGeneratedBackground>>;
    usage: ReturnType<typeof validateNormalizedGenerationUsage>;
  }) {
    const objectKey = `projects/${input.job.projectId}/benchmarks/${input.job.benchmarkRunId}/${input.job.variant.toLowerCase()}-${randomUUID()}.${input.image.extension}`;
    await this.storage.putObject({
      key: objectKey,
      body: input.image.body,
      contentType: input.image.mimeType,
      metadata: {
        sha256: input.image.sha256,
        kind: "benchmark-result",
        benchmarkJobId: input.job.id,
      },
    });

    try {
      await withTransaction(this.database, async (transaction) => {
        const active = await transaction.benchmarkJob.findFirst({
          where: {
            id: input.job.id,
            ownerId: input.job.ownerId,
            status: BenchmarkJobStatus.RUNNING,
          },
          select: { id: true },
        });
        if (!active) throw new Error("Benchmark job is no longer running.");
        const asset = await transaction.asset.create({
          data: {
            ownerId: input.job.ownerId,
            projectId: input.job.projectId,
            kind: AssetKind.GENERATED_BACKGROUND,
            objectKey,
            mimeType: input.image.mimeType,
            byteSize: BigInt(input.image.byteSize),
            width: input.image.width,
            height: input.image.height,
            sha256: input.image.sha256,
            sourceAssetId: input.productAssetId,
          },
        });
        await transaction.benchmarkResult.create({
          data: {
            ownerId: input.job.ownerId,
            projectId: input.job.projectId,
            benchmarkJobId: input.job.id,
            assetId: asset.id,
            providerName: input.job.providerName,
            providerRequestId: input.providerRequestId,
            requestId: input.requestId,
            durationMs: input.durationMs,
            usageJson: {
              generatedImages: input.usage.generatedImages,
              inputUnits: input.usage.inputUnits,
              outputPixels: input.usage.outputPixels,
            },
            costMetadataJson: input.usage.costMetadata,
          },
        });
        await transaction.benchmarkJob.update({
          where: { id: input.job.id },
          data: {
            status: BenchmarkJobStatus.SUCCEEDED,
            providerRequestId: input.providerRequestId,
            finishedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
      });
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  }
}

function normalizeFailure(error: unknown, fallbackRequestId: string | null) {
  if (error instanceof ProviderAdapterError) {
    return {
      code: error.code,
      message: error.message,
      providerRequestId: error.providerRequestId ?? fallbackRequestId,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message.slice(0, 500) : "Benchmark worker failed.",
    providerRequestId: fallbackRequestId,
  };
}
