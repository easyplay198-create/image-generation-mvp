import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { BenchmarkJob } from "@/src/generated/prisma/client";
import {
  AssetKind,
  BenchmarkJobStatus,
  ProviderSubmissionState,
} from "@/src/generated/prisma/client";
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

const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1_000;

type SubmissionState = "NOT_STARTED" | "SUBMITTING" | "SUBMITTED";
type BenchmarkFailure = {
  code: string;
  message: string;
  providerRequestId: string | null;
  retryable: boolean;
  submissionState: SubmissionState;
};

export class BenchmarkWorker {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly styleProvider: ImageGenerationProvider,
    private readonly plainProvider: PlainPromptQwenProvider,
    private readonly leaseTimeoutMs = DEFAULT_LEASE_TIMEOUT_MS,
  ) {}

  async runOnce(): Promise<boolean> {
    await this.recoverExpiredJobs();
    const job = await this.claimNextJob();
    if (!job) return false;

    let providerRequestId: string | null = null;
    let submissionState: SubmissionState = "NOT_STARTED";
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      void this.heartbeat(job).then((active) => {
        if (!active) leaseLost = true;
      }).catch(() => {
        leaseLost = true;
      });
    }, Math.max(10, Math.floor(this.leaseTimeoutMs / 3)));
    heartbeat.unref();
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
        await this.markSubmitting(
          job,
          `${job.benchmarkRunId}:${job.variant}`,
        );
        submissionState = "SUBMITTING";
        const output = await this.plainProvider.generate({
          prompt: input.prompt,
          productReference: product,
          canvas: input.canvas,
        });
        providerRequestId = output.providerRequestId;
        await this.markSubmitted(job, providerRequestId, leaseLost);
        submissionState = "SUBMITTED";
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
        await this.markSubmitting(
          job,
          `${job.benchmarkRunId}:${job.variant}`,
        );
        submissionState = "SUBMITTING";
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
        await this.markSubmitted(job, providerRequestId, leaseLost);
        submissionState = "SUBMITTED";
        const status = await this.styleProvider.getJobStatus({ providerRequestId });
        if (status.status !== "SUCCEEDED") {
          throw new ProviderAdapterError(
            "PROVIDER_TIMEOUT",
            true,
            "Benchmark StyleSpec Provider 尚未完成。",
            providerRequestId,
            "MAY_HAVE_BEEN_ACCEPTED",
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
      const failure = normalizeFailure(
        error,
        providerRequestId,
        submissionState,
      );
      await this.failOrRetry(job, failure);
    } finally {
      clearInterval(heartbeat);
    }

    return true;
  }

  async recoverExpiredJobs(): Promise<number> {
    const terminalizedAmbiguous = await this.database.$executeRaw`
      UPDATE "BenchmarkJob"
      SET
        "status" = 'FAILED'::"BenchmarkJobStatus",
        "lockedAt" = NULL,
        "leaseToken" = NULL,
        "finishedAt" = COALESCE(
          "finishedAt",
          (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        ),
        "errorCode" = 'PROVIDER_SUBMISSION_AMBIGUOUS',
        "errorMessage" = 'Benchmark Provider 提交状态不明确，禁止自动重试。',
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "status" = 'RUNNING'::"BenchmarkJobStatus"
        AND "providerSubmissionState" = 'AMBIGUOUS'::"ProviderSubmissionState"
    `;
    const recoveredExpired = await this.database.$executeRaw`
      UPDATE "BenchmarkJob"
      SET
        "status" = CASE
          WHEN "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
            AND "providerInvocationKey" IS NULL
            AND "providerRequestId" IS NULL
            AND "attemptCount" < "maxAttempts"
            THEN 'QUEUED'::"BenchmarkJobStatus"
          ELSE 'FAILED'::"BenchmarkJobStatus"
        END,
        "lockedAt" = NULL,
        "leaseToken" = NULL,
        "providerSubmissionState" = CASE
          WHEN "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
            AND "providerInvocationKey" IS NULL
            AND "providerRequestId" IS NULL
            THEN 'NOT_STARTED'::"ProviderSubmissionState"
          ELSE 'AMBIGUOUS'::"ProviderSubmissionState"
        END,
        "finishedAt" = CASE
          WHEN "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
            AND "providerInvocationKey" IS NULL
            AND "providerRequestId" IS NULL
            AND "attemptCount" < "maxAttempts" THEN NULL
          ELSE (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        END,
        "errorCode" = CASE
          WHEN "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
            AND "providerInvocationKey" IS NULL
            AND "providerRequestId" IS NULL
            THEN 'WORKER_LEASE_EXPIRED'
          ELSE 'PROVIDER_SUBMISSION_AMBIGUOUS'
        END,
        "errorMessage" = CASE
          WHEN "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
            AND "providerInvocationKey" IS NULL
            AND "providerRequestId" IS NULL
            THEN 'Benchmark Worker 中断，任务租约已过期。'
          ELSE 'Benchmark Worker 在 Provider 提交后中断，禁止自动重试。'
        END,
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "status" = 'RUNNING'::"BenchmarkJobStatus"
        AND "providerSubmissionState" <> 'AMBIGUOUS'::"ProviderSubmissionState"
        AND (
          "lockedAt" IS NULL
          OR "lockedAt" < (
            (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            - (${this.leaseTimeoutMs} * INTERVAL '1 millisecond')
          )
        )
    `;
    return terminalizedAmbiguous + recoveredExpired;
  }

  private async claimNextJob(): Promise<BenchmarkJob | null> {
    const leaseToken = randomUUID();
    const jobs = await this.database.$queryRaw<BenchmarkJob[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "BenchmarkJob"
        WHERE "status" = 'QUEUED'::"BenchmarkJobStatus"
          AND "attemptCount" < "maxAttempts"
          AND "providerName" = ${this.styleProvider.name}
        ORDER BY "createdAt" ASC, "variant" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "BenchmarkJob" AS job
      SET
        "status" = 'RUNNING'::"BenchmarkJobStatus",
        "attemptCount" = job."attemptCount" + 1,
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "leaseToken" = ${leaseToken},
        "startedAt" = COALESCE(
          job."startedAt",
          (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        ),
        "finishedAt" = NULL,
        "errorCode" = NULL,
        "errorMessage" = NULL,
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `;
    return jobs[0] ?? null;
  }

  private async markSubmitting(job: BenchmarkJob, invocationKey: string) {
    const count = await this.database.$executeRaw`
      UPDATE "BenchmarkJob"
      SET
        "providerInvocationKey" = ${invocationKey},
        "providerSubmissionState" = 'SUBMITTING'::"ProviderSubmissionState",
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${job.id}
        AND "ownerId" = ${job.ownerId}
        AND "status" = 'RUNNING'::"BenchmarkJobStatus"
        AND "leaseToken" = ${job.leaseToken}
        AND "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
    `;
    if (count !== 1) {
      throw new Error("Benchmark submission fence was lost.");
    }
  }

  private async markSubmitted(
    job: BenchmarkJob,
    providerRequestId: string,
    leaseLost: boolean,
  ) {
    if (leaseLost) throw ambiguousFailure(providerRequestId);
    const count = await this.database.$executeRaw`
      UPDATE "BenchmarkJob"
      SET
        "providerRequestId" = ${providerRequestId},
        "providerSubmissionState" = 'SUBMITTED'::"ProviderSubmissionState",
        "providerSubmittedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${job.id}
        AND "ownerId" = ${job.ownerId}
        AND "status" = 'RUNNING'::"BenchmarkJobStatus"
        AND "leaseToken" = ${job.leaseToken}
        AND "providerSubmissionState" = 'SUBMITTING'::"ProviderSubmissionState"
    `;
    if (count !== 1) throw ambiguousFailure(providerRequestId);
  }

  private async heartbeat(job: BenchmarkJob): Promise<boolean> {
    const count = await this.database.$executeRaw`
      UPDATE "BenchmarkJob"
      SET
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${job.id}
        AND "ownerId" = ${job.ownerId}
        AND "status" = 'RUNNING'::"BenchmarkJobStatus"
        AND "leaseToken" = ${job.leaseToken}
    `;
    return count === 1;
  }

  private async failOrRetry(job: BenchmarkJob, failure: BenchmarkFailure) {
    const retry =
      failure.submissionState !== "SUBMITTED" &&
      failure.code !== "PROVIDER_SUBMISSION_AMBIGUOUS" &&
      failure.retryable &&
      job.attemptCount < job.maxAttempts;
    await this.database.benchmarkJob.updateMany({
      where: {
        id: job.id,
        ownerId: job.ownerId,
        status: BenchmarkJobStatus.RUNNING,
        leaseToken: job.leaseToken,
      },
      data: {
        status: retry ? BenchmarkJobStatus.QUEUED : BenchmarkJobStatus.FAILED,
        providerRequestId: failure.providerRequestId,
        providerSubmissionState:
          failure.code === "PROVIDER_SUBMISSION_AMBIGUOUS"
            ? ProviderSubmissionState.AMBIGUOUS
            : retry
              ? ProviderSubmissionState.NOT_STARTED
              : failure.submissionState === "SUBMITTED"
                ? ProviderSubmissionState.SUBMITTED
                : ProviderSubmissionState.NOT_STARTED,
        errorCode: failure.code,
        errorMessage: failure.message,
        lockedAt: null,
        leaseToken: null,
        finishedAt: retry ? null : new Date(),
      },
    });
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
    try {
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
    } catch {
      throw {
        code: "STORAGE_FAILED",
        message: "Benchmark 结果写入对象存储失败。",
        providerRequestId: input.providerRequestId,
        retryable: false,
        submissionState: "SUBMITTED",
      } satisfies BenchmarkFailure;
    }

    try {
      await withTransaction(this.database, async (transaction) => {
        const active = await transaction.benchmarkJob.findFirst({
          where: {
            id: input.job.id,
            ownerId: input.job.ownerId,
            status: BenchmarkJobStatus.RUNNING,
            leaseToken: input.job.leaseToken,
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
        const updated = await transaction.benchmarkJob.updateMany({
          where: {
            id: input.job.id,
            ownerId: input.job.ownerId,
            status: BenchmarkJobStatus.RUNNING,
            leaseToken: input.job.leaseToken,
          },
          data: {
            status: BenchmarkJobStatus.SUCCEEDED,
            providerRequestId: input.providerRequestId,
            providerSubmissionState: ProviderSubmissionState.COMPLETED,
            lockedAt: null,
            leaseToken: null,
            finishedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
        if (updated.count !== 1) {
          throw new Error("Benchmark completion fence was lost.");
        }
      });
    } catch (error) {
      try {
        await this.storage.deleteObject(objectKey);
      } catch {
        throw {
          code: "STORAGE_COMPENSATION_FAILED",
          message: "Benchmark 结果事务失败，且对象补偿删除失败。",
          providerRequestId: input.providerRequestId,
          retryable: false,
          submissionState: "SUBMITTED",
        } satisfies BenchmarkFailure;
      }
      throw error;
    }
  }
}

function normalizeFailure(
  error: unknown,
  fallbackRequestId: string | null,
  submissionState: SubmissionState,
): BenchmarkFailure {
  if (isBenchmarkFailure(error)) return error;
  if (error instanceof ProviderAdapterError) {
    const ambiguous =
      error.submissionDisposition === "MAY_HAVE_BEEN_ACCEPTED";
    return {
      code: ambiguous ? "PROVIDER_SUBMISSION_AMBIGUOUS" : error.code,
      message: ambiguous
        ? "Provider 可能已接受请求，禁止自动重试以避免重复计费。"
        : error.message,
      providerRequestId: error.providerRequestId ?? fallbackRequestId,
      retryable: ambiguous ? false : error.retryable,
      submissionState: ambiguous ? "SUBMITTED" : submissionState,
    };
  }
  if (submissionState === "SUBMITTING") {
    return ambiguousFailure(fallbackRequestId);
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message.slice(0, 500) : "Benchmark worker failed.",
    providerRequestId: fallbackRequestId,
    retryable: false,
    submissionState,
  };
}

function ambiguousFailure(providerRequestId: string | null): BenchmarkFailure {
  return {
    code: "PROVIDER_SUBMISSION_AMBIGUOUS",
    message: "Provider 提交结果不明确，禁止自动重试以避免重复计费。",
    providerRequestId,
    retryable: false,
    submissionState: "SUBMITTED",
  };
}

function isBenchmarkFailure(error: unknown): error is BenchmarkFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "providerRequestId" in error &&
    "retryable" in error &&
    "submissionState" in error
  );
}
