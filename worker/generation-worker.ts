import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { Job } from "@/src/generated/prisma/client";
import { AssetKind, JobStatus } from "@/src/generated/prisma/client";
import { parseGenerationJobInput } from "@/src/domain/generation-job";
import {
  validateGeneratedBackground,
  validateNormalizedGenerationUsage,
  type ValidatedGeneratedBackground,
} from "@/src/domain/generated-background";
import {
  parseStyleSpecV1,
  StyleSpecValidationError,
} from "@/src/domain/style-spec";
import type {
  ImageGenerationProvider,
  ImageGenerationStatus,
  NormalizedGenerationUsage,
} from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_DELAY_MS = 100;
const MAX_STATUS_POLLS = 10;

type WorkerFailure = {
  code:
    | "PROVIDER_AUTH_FAILED"
    | "PROVIDER_RATE_LIMITED"
    | "PROVIDER_POLICY_REJECTED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_INVALID_RESPONSE"
    | "STYLE_SPEC_INVALID"
    | "STORAGE_FAILED"
    | "DATABASE_FAILED"
    | "STORAGE_COMPENSATION_FAILED"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  providerRequestId: string | null;
  source: "provider" | "validation" | "storage" | "database" | "internal";
};

export class GenerationWorker {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly provider: ImageGenerationProvider,
    private readonly leaseTimeoutMs = DEFAULT_LEASE_TIMEOUT_MS,
    private readonly pollDelayMs = DEFAULT_POLL_DELAY_MS,
  ) {}

  async runOnce(): Promise<boolean> {
    await this.recoverExpiredJobs();
    const job = await this.claimNextJob();
    if (!job) return false;

    const startedAt = Date.now();
    let requestId: string | undefined;
    let providerRequestId: string | null = null;

    try {
      const input = parseGenerationJobInput(job.inputJson);
      requestId = input.requestId;
      const revision = await this.database.styleSpecRevision.findFirst({
        where: {
          id: input.styleSpecRevisionId,
          ownerId: job.ownerId,
          projectId: job.projectId,
        },
      });
      if (!revision) {
        throw workerFailure(
          "STYLE_SPEC_INVALID",
          "StyleSpec revision 不存在或无权访问。",
          "validation",
        );
      }

      let styleSpec;
      try {
        styleSpec = parseStyleSpecV1(revision.specJson);
      } catch (error) {
        if (error instanceof StyleSpecValidationError) {
          throw workerFailure(
            "STYLE_SPEC_INVALID",
            "StyleSpec revision 未通过 V1 Schema 校验。",
            "validation",
          );
        }
        throw error;
      }

      const providerStartedAt = Date.now();
      const submission: unknown = await this.provider.generateBackground({
        projectId: job.projectId,
        styleSpec,
        productContext: input.productContext,
        canvas: input.canvas,
        idempotencyKey: input.idempotencyKey,
      });
      providerRequestId =
        typeof submission === "object" &&
        submission !== null &&
        "providerRequestId" in submission &&
        typeof submission.providerRequestId === "string"
          ? submission.providerRequestId
          : null;
      if (
        typeof providerRequestId !== "string" ||
        providerRequestId.trim().length === 0 ||
        providerRequestId.length > 200
      ) {
        throw new ProviderAdapterError(
          "PROVIDER_INVALID_RESPONSE",
          false,
          "图片生成 Provider 返回了无效请求 ID。",
        );
      }
      await this.recordProviderRequestId(job, providerRequestId);

      const status = await this.waitForProvider(job, providerRequestId);
      const providerDurationMs = Date.now() - providerStartedAt;
      const image = await validateGeneratedBackground(
        status.image,
        input.canvas,
        providerRequestId,
      );
      const usage = validateNormalizedGenerationUsage(
        this.provider.normalizeUsage(status.rawUsage),
        providerRequestId,
      );

      await this.storeResult({
        job,
        requestId,
        providerRequestId,
        providerDurationMs,
        styleSpecRevisionId: input.styleSpecRevisionId,
        image,
        usage,
      });
      logWorkerResult({
        job,
        providerName: this.provider.name,
        providerRequestId,
        requestId,
        durationMs: Date.now() - startedAt,
        providerDurationMs,
        result: "succeeded",
      });
    } catch (error) {
      const failure = toWorkerFailure(error, providerRequestId);
      const status = await this.failOrRetry(job, failure);
      logWorkerResult({
        job,
        providerName: this.provider.name,
        providerRequestId: failure.providerRequestId,
        requestId,
        durationMs: Date.now() - startedAt,
        result: status === JobStatus.QUEUED ? "retrying" : "failed",
        errorCode: failure.code,
        failureSource: failure.source,
      });
    }

    return true;
  }

  async recoverExpiredJobs(): Promise<number> {
    const expiredBefore = new Date(Date.now() - this.leaseTimeoutMs);

    return this.database.$executeRaw`
      UPDATE "Job"
      SET
        "status" = CASE
          WHEN "attemptCount" < "maxAttempts" THEN 'QUEUED'::"JobStatus"
          ELSE 'FAILED'::"JobStatus"
        END,
        "lockedAt" = NULL,
        "finishedAt" = CASE
          WHEN "attemptCount" < "maxAttempts" THEN NULL
          ELSE CURRENT_TIMESTAMP
        END,
        "errorCode" = 'WORKER_LEASE_EXPIRED',
        "errorMessage" = '图片生成 Worker 中断，任务租约已过期。',
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "type" = 'IMAGE_GENERATION'::"JobType"
        AND "status" = 'RUNNING'::"JobStatus"
        AND "lockedAt" < ${expiredBefore}
    `;
  }

  private async claimNextJob(): Promise<Job | null> {
    const jobs = await this.database.$queryRaw<Job[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "Job"
        WHERE "type" = 'IMAGE_GENERATION'::"JobType"
          AND "status" = 'QUEUED'::"JobStatus"
          AND "attemptCount" < "maxAttempts"
          AND "providerName" = ${this.provider.name}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "Job" AS job
      SET
        "status" = 'RUNNING'::"JobStatus",
        "attemptCount" = job."attemptCount" + 1,
        "lockedAt" = CURRENT_TIMESTAMP,
        "startedAt" = COALESCE(job."startedAt", CURRENT_TIMESTAMP),
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

  private async recordProviderRequestId(
    job: Job,
    providerRequestId: string,
  ) {
    const update = await this.database.job.updateMany({
      where: {
        id: job.id,
        ownerId: job.ownerId,
        status: JobStatus.RUNNING,
      },
      data: { providerRequestId, lockedAt: new Date() },
    });
    if (update.count !== 1) {
      throw workerFailure(
        "DATABASE_FAILED",
        "无法记录 Provider 请求 ID。",
        "database",
        providerRequestId,
      );
    }
  }

  private async waitForProvider(
    job: Job,
    providerRequestId: string,
  ): Promise<Extract<ImageGenerationStatus, { status: "SUCCEEDED" }>> {
    for (let poll = 0; poll < MAX_STATUS_POLLS; poll += 1) {
      const status: unknown = await this.provider.getJobStatus({
        providerRequestId,
      });
      if (
        typeof status === "object" &&
        status !== null &&
        "status" in status &&
        status.status === "SUCCEEDED" &&
        "image" in status &&
        "rawUsage" in status
      ) {
        return status as Extract<
          ImageGenerationStatus,
          { status: "SUCCEEDED" }
        >;
      }
      if (
        typeof status !== "object" ||
        status === null ||
        !("status" in status) ||
        status.status !== "PENDING"
      ) {
        throw new ProviderAdapterError(
          "PROVIDER_INVALID_RESPONSE",
          false,
          "图片生成 Provider 返回了无效任务状态。",
          providerRequestId,
        );
      }

      await this.database.job.updateMany({
        where: {
          id: job.id,
          ownerId: job.ownerId,
          providerRequestId,
          status: JobStatus.RUNNING,
        },
        data: { lockedAt: new Date() },
      });
      await delay(this.pollDelayMs);
    }

    throw new ProviderAdapterError(
      "PROVIDER_TIMEOUT",
      true,
      "图片生成 Provider 在轮询期限内未完成。",
      providerRequestId,
    );
  }

  private async storeResult(input: {
    job: Job;
    requestId: string;
    providerRequestId: string;
    providerDurationMs: number;
    styleSpecRevisionId: string;
    image: ValidatedGeneratedBackground;
    usage: NormalizedGenerationUsage;
  }): Promise<void> {
    const objectKey = `projects/${input.job.projectId}/generated/${randomUUID()}.${input.image.extension}`;

    try {
      await this.storage.putObject({
        key: objectKey,
        body: input.image.body,
        contentType: input.image.mimeType,
        metadata: {
          sha256: input.image.sha256,
          kind: "generated-background",
          jobId: input.job.id,
        },
      });
    } catch {
      throw workerFailure(
        "STORAGE_FAILED",
        "生成背景写入对象存储失败。",
        "storage",
        input.providerRequestId,
      );
    }

    try {
      await withTransaction(this.database, async (transaction) => {
        const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "Project"
          WHERE "id" = ${input.job.projectId} AND "ownerId" = ${input.job.ownerId}
          FOR UPDATE
        `;
        if (lockedProjects.length !== 1) {
          throw new Error("The generation project no longer exists.");
        }

        const runningJob = await transaction.job.findFirst({
          where: {
            id: input.job.id,
            ownerId: input.job.ownerId,
            status: JobStatus.RUNNING,
          },
          select: { id: true },
        });
        if (!runningJob) {
          throw new Error("The image generation job is no longer running.");
        }

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
          },
        });
        await transaction.generationResult.create({
          data: {
            ownerId: input.job.ownerId,
            projectId: input.job.projectId,
            jobId: input.job.id,
            assetId: asset.id,
            styleSpecRevisionId: input.styleSpecRevisionId,
            providerName: this.provider.name,
            providerRequestId: input.providerRequestId,
            requestId: input.requestId,
            durationMs: input.providerDurationMs,
            usageJson: {
              generatedImages: input.usage.generatedImages,
              inputUnits: input.usage.inputUnits,
              outputPixels: input.usage.outputPixels,
            },
            costMetadataJson: input.usage.costMetadata,
          },
        });
        const update = await transaction.job.updateMany({
          where: {
            id: input.job.id,
            ownerId: input.job.ownerId,
            status: JobStatus.RUNNING,
          },
          data: {
            status: JobStatus.SUCCEEDED,
            providerRequestId: input.providerRequestId,
            lockedAt: null,
            finishedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
        if (update.count !== 1) {
          throw new Error("The image generation job could not be completed.");
        }
      });
    } catch {
      try {
        await this.storage.deleteObject(objectKey);
      } catch {
        throw workerFailure(
          "STORAGE_COMPENSATION_FAILED",
          "生成结果事务失败，且对象补偿删除失败。",
          "storage",
          input.providerRequestId,
        );
      }

      throw workerFailure(
        "DATABASE_FAILED",
        "生成结果数据库事务失败。",
        "database",
        input.providerRequestId,
      );
    }
  }

  private async failOrRetry(
    job: Job,
    failure: WorkerFailure,
  ): Promise<Job["status"]> {
    const retry = failure.retryable && job.attemptCount < job.maxAttempts;
    const status = retry ? JobStatus.QUEUED : JobStatus.FAILED;

    await this.database.job.updateMany({
      where: {
        id: job.id,
        ownerId: job.ownerId,
        status: JobStatus.RUNNING,
      },
      data: {
        status,
        providerRequestId: failure.providerRequestId,
        errorCode: failure.code,
        errorMessage: failure.message,
        lockedAt: null,
        finishedAt: retry ? null : new Date(),
      },
    });

    return status;
  }
}

function toWorkerFailure(
  error: unknown,
  providerRequestId: string | null,
): WorkerFailure {
  if (isWorkerFailure(error)) return error;
  if (error instanceof ProviderAdapterError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      providerRequestId: error.providerRequestId ?? providerRequestId,
      source: "provider",
    };
  }

  return workerFailure(
    "INTERNAL_ERROR",
    "图片生成任务执行失败，请重试。",
    "internal",
    providerRequestId,
  );
}

function workerFailure(
  code: WorkerFailure["code"],
  message: string,
  source: WorkerFailure["source"],
  providerRequestId: string | null = null,
): WorkerFailure {
  return { code, message, retryable: false, providerRequestId, source };
}

function isWorkerFailure(error: unknown): error is WorkerFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "retryable" in error &&
    "providerRequestId" in error &&
    "source" in error
  );
}

function logWorkerResult(input: {
  job: Job;
  providerName: string;
  providerRequestId: string | null;
  requestId?: string;
  durationMs: number;
  providerDurationMs?: number;
  result: "succeeded" | "retrying" | "failed";
  errorCode?: string;
  failureSource?: WorkerFailure["source"];
}) {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: input.result === "failed" ? "error" : "info",
      requestId: input.requestId,
      ownerId: input.job.ownerId,
      projectId: input.job.projectId,
      jobId: input.job.id,
      operation: "image-generation.execute",
      durationMs: input.durationMs,
      providerDurationMs: input.providerDurationMs,
      result: input.result,
      providerName: input.providerName,
      providerRequestId: input.providerRequestId,
      errorCode: input.errorCode,
      failureSource: input.failureSource,
    }),
  );
}
