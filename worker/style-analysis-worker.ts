import type { Job } from "@/src/generated/prisma/client";
import { AssetKind, JobStatus } from "@/src/generated/prisma/client";
import { parseStyleAnalysisJobInput } from "@/src/domain/style-analysis-job";
import {
  parseStyleSpecV1,
  StyleSpecValidationError,
  type StyleSpecV1,
} from "@/src/domain/style-spec";
import type { StyleAnalyzerProvider } from "@/src/providers/style-analyzer-provider";
import { StyleAnalyzerProviderError } from "@/src/providers/style-analyzer-provider";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

type WorkerFailure = {
  code:
    | "PROVIDER_AUTH_FAILED"
    | "PROVIDER_RATE_LIMITED"
    | "PROVIDER_POLICY_REJECTED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_INVALID_RESPONSE"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  providerRequestId: string | null;
};

export class StyleAnalysisWorker {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly provider: StyleAnalyzerProvider,
    private readonly leaseTimeoutMs = DEFAULT_LEASE_TIMEOUT_MS,
  ) {}

  async runOnce(): Promise<boolean> {
    await this.recoverExpiredJobs();
    const job = await this.claimNextJob();
    if (!job) return false;

    const startedAt = Date.now();
    let requestId: string | undefined;

    try {
      const persistedInput = parseStyleAnalysisJobInput(job.inputJson);
      requestId = persistedInput.requestId;
      const referenceImages = await this.loadReferenceImages(
        job,
        persistedInput.referenceAssetIds,
      );
      const result = await this.provider.analyze({
        projectId: job.projectId,
        productInfo: persistedInput.productInfo,
        referenceImages,
      });

      let spec: StyleSpecV1;
      try {
        spec = parseStyleSpecV1(result.output);
      } catch (error) {
        if (error instanceof StyleSpecValidationError) {
          throw invalidProviderResponse(result.providerRequestId);
        }
        throw error;
      }

      await this.completeJob(job, spec, result.providerRequestId);
      logWorkerResult(
        job,
        this.provider.name,
        startedAt,
        "succeeded",
        requestId,
        result.providerRequestId,
      );
    } catch (error) {
      const failure = toWorkerFailure(error);
      const status = await this.failOrRetry(job, failure);
      logWorkerResult(
        job,
        this.provider.name,
        startedAt,
        status === JobStatus.QUEUED ? "retrying" : "failed",
        requestId,
        failure.providerRequestId,
        failure.code,
      );
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
        "errorMessage" = '风格分析 Worker 中断，任务租约已过期。',
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "type" = 'STYLE_ANALYSIS'::"JobType"
        AND "status" = 'RUNNING'::"JobStatus"
        AND "lockedAt" < ${expiredBefore}
    `;
  }

  private async claimNextJob(): Promise<Job | null> {
    const jobs = await this.database.$queryRaw<Job[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "Job"
        WHERE "type" = 'STYLE_ANALYSIS'::"JobType"
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

  private async loadReferenceImages(job: Job, assetIds: string[]) {
    const assets = await this.database.asset.findMany({
      where: {
        id: { in: assetIds },
        ownerId: job.ownerId,
        projectId: job.projectId,
        kind: AssetKind.REFERENCE,
      },
    });
    if (assets.length !== assetIds.length) {
      throw new Error("A persisted reference asset is missing or inaccessible.");
    }

    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return Promise.all(
      assetIds.map(async (assetId) => {
        const asset = assetsById.get(assetId);
        if (!asset) {
          throw new Error("A persisted reference asset is missing.");
        }
        const object = await this.storage.getObject(asset.objectKey);

        return {
          assetId: asset.id,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          body: object.body,
        };
      }),
    );
  }

  private async completeJob(
    job: Job,
    spec: StyleSpecV1,
    providerRequestId: string | null,
  ): Promise<void> {
    await withTransaction(this.database, async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Project"
        WHERE "id" = ${job.projectId} AND "ownerId" = ${job.ownerId}
        FOR UPDATE
      `;
      if (lockedProjects.length !== 1) {
        throw new Error("The style analysis project no longer exists.");
      }

      const runningJob = await transaction.job.findFirst({
        where: {
          id: job.id,
          ownerId: job.ownerId,
          status: JobStatus.RUNNING,
        },
        select: { id: true },
      });
      if (!runningJob) {
        throw new Error("The style analysis job is no longer running.");
      }

      const latest = await transaction.styleSpecRevision.findFirst({
        where: { ownerId: job.ownerId, projectId: job.projectId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });
      const revision = await transaction.styleSpecRevision.create({
        data: {
          ownerId: job.ownerId,
          projectId: job.projectId,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          schemaVersion: spec.schemaVersion,
          specJson: spec,
        },
      });
      const update = await transaction.job.updateMany({
        where: {
          id: job.id,
          ownerId: job.ownerId,
          status: JobStatus.RUNNING,
        },
        data: {
          status: JobStatus.SUCCEEDED,
          styleSpecRevisionId: revision.id,
          providerRequestId,
          lockedAt: null,
          finishedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (update.count !== 1) {
        throw new Error("The style analysis job could not be completed.");
      }
    });
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

function invalidProviderResponse(
  providerRequestId: string | null,
): WorkerFailure {
  return {
    code: "PROVIDER_INVALID_RESPONSE",
    message: "风格分析 Provider 返回的数据未通过 StyleSpec V1 校验。",
    retryable: false,
    providerRequestId,
  };
}

function toWorkerFailure(error: unknown): WorkerFailure {
  if (isWorkerFailure(error)) return error;

  if (error instanceof StyleAnalyzerProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      providerRequestId: error.providerRequestId,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "风格分析任务执行失败，请重试。",
    retryable: false,
    providerRequestId: null,
  };
}

function isWorkerFailure(error: unknown): error is WorkerFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "retryable" in error &&
    "providerRequestId" in error
  );
}

function logWorkerResult(
  job: Job,
  providerName: string,
  startedAt: number,
  result: "succeeded" | "retrying" | "failed",
  requestId?: string,
  providerRequestId?: string | null,
  errorCode?: string,
) {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: result === "failed" ? "error" : "info",
      requestId,
      ownerId: job.ownerId,
      projectId: job.projectId,
      jobId: job.id,
      operation: "style-analysis.execute",
      durationMs: Date.now() - startedAt,
      result,
      providerName,
      providerRequestId,
      errorCode,
    }),
  );
}
