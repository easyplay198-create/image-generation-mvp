import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { Job } from "@/src/generated/prisma/client";
import {
  AssetKind,
  JobStatus,
  ProviderSubmissionState,
} from "@/src/generated/prisma/client";
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
    | "PROVIDER_SUBMISSION_AMBIGUOUS"
    | "STYLE_SPEC_INVALID"
    | "STORAGE_FAILED"
    | "DATABASE_FAILED"
    | "STORAGE_COMPENSATION_FAILED"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  providerRequestId: string | null;
  source: "provider" | "validation" | "storage" | "database" | "internal";
  submissionState: "NOT_STARTED" | "SUBMITTING" | "SUBMITTED";
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
    let submissionState: WorkerFailure["submissionState"] = "NOT_STARTED";
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
      const input = parseGenerationJobInput(job.inputJson);
      const generationContext =
        input.schemaVersion === "1.1"
          ? input.generationContext
          : {
              canvas: input.canvas,
              productReference: undefined,
              visualReferences: [],
            };
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
      const productReference = generationContext.productReference
        ? await this.loadProductReference({
            ownerId: job.ownerId,
            projectId: job.projectId,
            reference: generationContext.productReference,
            kind: AssetKind.PRODUCT,
          })
        : undefined;
      const visualReferences = await Promise.all(
        generationContext.visualReferences.map((reference) =>
          this.loadProductReference({
            ownerId: job.ownerId,
            projectId: job.projectId,
            reference,
            kind: AssetKind.REFERENCE,
          }),
        ),
      );
      await this.markSubmitting(job, `${job.id}:${input.idempotencyKey}`);
      submissionState = "SUBMITTING";
      const submission: unknown = await this.provider.generateBackground({
        projectId: job.projectId,
        styleSpec,
        productContext: input.productContext,
        canvas: generationContext.canvas,
        idempotencyKey: input.idempotencyKey,
        productReference,
        visualReferences,
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
          null,
          "MAY_HAVE_BEEN_ACCEPTED",
        );
      }
      if (leaseLost) {
        throw workerFailure(
          "PROVIDER_SUBMISSION_AMBIGUOUS",
          "Provider 提交期间任务租约丢失，禁止自动重试。",
          "database",
          providerRequestId,
          "SUBMITTED",
        );
      }
      await this.markSubmitted(job, providerRequestId);
      submissionState = "SUBMITTED";

      const status = await this.waitForProvider(job, providerRequestId);
      const providerDurationMs = Date.now() - providerStartedAt;
      const image = await validateGeneratedBackground(
        status.image,
        generationContext.canvas,
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
        productReferenceAssetId:
          generationContext.productReference?.assetId,
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
      const failure = toWorkerFailure(
        error,
        providerRequestId,
        submissionState,
      );
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
        ...(failure.code === "INTERNAL_ERROR"
          ? { originalError: describeUnexpectedError(error) }
          : {}),
      });
    } finally {
      clearInterval(heartbeat);
    }

    return true;
  }

  async recoverExpiredJobs(): Promise<number> {
    const terminalizedAmbiguous = await this.database.$executeRaw`
      UPDATE "Job"
      SET
        "status" = 'FAILED'::"JobStatus",
        "lockedAt" = NULL,
        "leaseToken" = NULL,
        "finishedAt" = COALESCE(
          "finishedAt",
          (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        ),
        "errorCode" = 'PROVIDER_SUBMISSION_AMBIGUOUS',
        "errorMessage" = '图片生成 Provider 提交状态不明确，禁止自动重试。',
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "type" = 'IMAGE_GENERATION'::"JobType"
        AND "status" = 'RUNNING'::"JobStatus"
        AND "providerSubmissionState" = 'AMBIGUOUS'::"ProviderSubmissionState"
    `;
    const recoveredExpired = await this.database.$executeRaw`
      UPDATE "Job"
      SET
        "status" = CASE
          WHEN "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
            AND "providerInvocationKey" IS NULL
            AND "providerRequestId" IS NULL
            AND "attemptCount" < "maxAttempts" THEN 'QUEUED'::"JobStatus"
          ELSE 'FAILED'::"JobStatus"
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
            THEN '图片生成 Worker 中断，任务租约已过期。'
          ELSE '图片生成 Worker 在 Provider 提交后中断，禁止自动重试。'
        END,
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "type" = 'IMAGE_GENERATION'::"JobType"
        AND "status" = 'RUNNING'::"JobStatus"
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

  private async claimNextJob(): Promise<Job | null> {
    const leaseToken = randomUUID();
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

  private async markSubmitting(
    job: Job,
    providerInvocationKey: string,
  ) {
    const count = await this.database.$executeRaw`
      UPDATE "Job"
      SET
        "providerInvocationKey" = ${providerInvocationKey},
        "providerSubmissionState" = 'SUBMITTING'::"ProviderSubmissionState",
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${job.id}
        AND "ownerId" = ${job.ownerId}
        AND "status" = 'RUNNING'::"JobStatus"
        AND "leaseToken" = ${job.leaseToken}
        AND "providerSubmissionState" = 'NOT_STARTED'::"ProviderSubmissionState"
    `;
    if (count !== 1) {
      throw workerFailure(
        "DATABASE_FAILED",
        "无法取得 Provider 提交 fencing 权限。",
        "database",
      );
    }
  }

  private async markSubmitted(
    job: Job,
    providerRequestId: string,
  ) {
    const count = await this.database.$executeRaw`
      UPDATE "Job"
      SET
        "providerRequestId" = ${providerRequestId},
        "providerSubmissionState" = 'SUBMITTED'::"ProviderSubmissionState",
        "providerSubmittedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${job.id}
        AND "ownerId" = ${job.ownerId}
        AND "status" = 'RUNNING'::"JobStatus"
        AND "leaseToken" = ${job.leaseToken}
        AND "providerSubmissionState" = 'SUBMITTING'::"ProviderSubmissionState"
    `;
    if (count !== 1) {
      throw workerFailure(
        "DATABASE_FAILED",
        "无法记录 Provider 请求 ID。",
        "database",
        providerRequestId,
        "SUBMITTED",
      );
    }
  }

  private async heartbeat(job: Job): Promise<boolean> {
    const count = await this.database.$executeRaw`
      UPDATE "Job"
      SET
        "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${job.id}
        AND "ownerId" = ${job.ownerId}
        AND "status" = 'RUNNING'::"JobStatus"
        AND "leaseToken" = ${job.leaseToken}
    `;
    return count === 1;
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

      await this.database.$executeRaw`
        UPDATE "Job"
        SET
          "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
          "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE "id" = ${job.id}
          AND "ownerId" = ${job.ownerId}
          AND "providerRequestId" = ${providerRequestId}
          AND "status" = 'RUNNING'::"JobStatus"
          AND "leaseToken" = ${job.leaseToken}
      `;
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
    productReferenceAssetId?: string;
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
          kind: input.productReferenceAssetId
            ? "product-main-candidate"
            : "generated-background",
          jobId: input.job.id,
        },
      });
    } catch {
      throw workerFailure(
        "STORAGE_FAILED",
        "生成背景写入对象存储失败。",
        "storage",
        input.providerRequestId,
        "SUBMITTED",
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
            leaseToken: input.job.leaseToken,
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
            sourceAssetId: input.productReferenceAssetId,
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
            leaseToken: input.job.leaseToken,
          },
          data: {
            status: JobStatus.SUCCEEDED,
            providerRequestId: input.providerRequestId,
            lockedAt: null,
            leaseToken: null,
            providerSubmissionState: ProviderSubmissionState.COMPLETED,
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
          "SUBMITTED",
        );
      }

      throw workerFailure(
        "DATABASE_FAILED",
        "生成结果数据库事务失败。",
        "database",
        input.providerRequestId,
        "SUBMITTED",
      );
    }
  }

  private async loadProductReference(input: {
    ownerId: string;
    projectId: string;
    kind: typeof AssetKind.PRODUCT | typeof AssetKind.REFERENCE;
    reference: {
      assetId: string;
      mimeType: string;
      width: number;
      height: number;
      byteSize: number;
      sha256: string;
    };
  }) {
    const asset = await this.database.asset.findFirst({
      where: {
        id: input.reference.assetId,
        ownerId: input.ownerId,
        projectId: input.projectId,
        kind: input.kind,
      },
    });
    if (
      !asset ||
      asset.mimeType !== input.reference.mimeType ||
      asset.width !== input.reference.width ||
      asset.height !== input.reference.height ||
      Number(asset.byteSize) !== input.reference.byteSize ||
      asset.sha256 !== input.reference.sha256
    ) {
      throw workerFailure(
        "PROVIDER_INVALID_RESPONSE",
        "Generation Context 图片快照无效或资产已发生变化。",
        "validation",
      );
    }

    let object: Awaited<ReturnType<ObjectStorage["getObject"]>>;
    try {
      object = await this.storage.getObject(asset.objectKey);
    } catch {
      throw workerFailure(
        "STORAGE_FAILED",
        "读取 Generation Context 图片失败。",
        "storage",
      );
    }
    if (
      object.contentType.toLowerCase() !== asset.mimeType.toLowerCase() ||
      object.body.byteLength !== Number(asset.byteSize) ||
      createHash("sha256").update(object.body).digest("hex") !== asset.sha256
    ) {
      throw workerFailure(
        "STORAGE_FAILED",
        "Generation Context 图片对象与资产记录不一致。",
        "storage",
      );
    }

    return {
      assetId: asset.id,
      body: object.body,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    };
  }

  private async failOrRetry(
    job: Job,
    failure: WorkerFailure,
  ): Promise<Job["status"]> {
    const retry =
      failure.submissionState !== "SUBMITTED" &&
      failure.code !== "PROVIDER_SUBMISSION_AMBIGUOUS" &&
      failure.retryable &&
      job.attemptCount < job.maxAttempts;
    const status = retry ? JobStatus.QUEUED : JobStatus.FAILED;

    await this.database.job.updateMany({
      where: {
        id: job.id,
        ownerId: job.ownerId,
        status: JobStatus.RUNNING,
        leaseToken: job.leaseToken,
      },
      data: {
        status,
        providerRequestId: failure.providerRequestId,
        errorCode: failure.code,
        errorMessage: failure.message,
        lockedAt: null,
        leaseToken: null,
        providerSubmissionState:
          failure.code === "PROVIDER_SUBMISSION_AMBIGUOUS"
            ? ProviderSubmissionState.AMBIGUOUS
            : retry
              ? ProviderSubmissionState.NOT_STARTED
              : failure.submissionState === "SUBMITTED"
                ? ProviderSubmissionState.SUBMITTED
                : ProviderSubmissionState.NOT_STARTED,
        finishedAt: retry ? null : new Date(),
      },
    });

    return status;
  }
}

function toWorkerFailure(
  error: unknown,
  providerRequestId: string | null,
  submissionState: WorkerFailure["submissionState"],
): WorkerFailure {
  if (isWorkerFailure(error)) return error;
  if (error instanceof ProviderAdapterError) {
    const ambiguous =
      error.submissionDisposition === "MAY_HAVE_BEEN_ACCEPTED";
    return {
      code: ambiguous ? "PROVIDER_SUBMISSION_AMBIGUOUS" : error.code,
      message: ambiguous
        ? "Provider 可能已接受请求，禁止自动重试以避免重复计费。"
        : error.message,
      retryable: ambiguous ? false : error.retryable,
      providerRequestId: error.providerRequestId ?? providerRequestId,
      source: "provider",
      submissionState: ambiguous ? "SUBMITTED" : submissionState,
    };
  }

  if (submissionState === "SUBMITTING") {
    return workerFailure(
      "PROVIDER_SUBMISSION_AMBIGUOUS",
      "Provider 提交结果不明确，禁止自动重试以避免重复计费。",
      "internal",
      providerRequestId,
      "SUBMITTED",
    );
  }

  return workerFailure(
    "INTERNAL_ERROR",
    "图片生成任务执行失败，请重试。",
    "internal",
    providerRequestId,
    submissionState,
  );
}

function workerFailure(
  code: WorkerFailure["code"],
  message: string,
  source: WorkerFailure["source"],
  providerRequestId: string | null = null,
  submissionState: WorkerFailure["submissionState"] = "NOT_STARTED",
): WorkerFailure {
  return {
    code,
    message,
    retryable: false,
    providerRequestId,
    source,
    submissionState,
  };
}

function isWorkerFailure(error: unknown): error is WorkerFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "retryable" in error &&
    "providerRequestId" in error &&
    "source" in error &&
    "submissionState" in error
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
  originalError?: { name: string; message: string };
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
      originalError: input.originalError,
    }),
  );
}

function describeUnexpectedError(error: unknown): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name.slice(0, 120),
      message: error.message.slice(0, 500),
    };
  }
  return { name: "UnknownThrownValue", message: String(error).slice(0, 500) };
}
