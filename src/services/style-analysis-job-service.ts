import type { Job } from "@/src/generated/prisma/client";
import { AssetKind, JobStatus, JobType } from "@/src/generated/prisma/client";
import type { CreateStyleAnalysisJobInput } from "@/src/domain/style-analysis-job";
import { ApiError } from "@/src/http/api";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";

export type StyleAnalysisJobDto = {
  id: string;
  projectId: string;
  type: "STYLE_ANALYSIS";
  status: Job["status"];
  attemptCount: number;
  maxAttempts: number;
  providerName: string | null;
  providerRequestId: string | null;
  styleSpecRevisionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class StyleAnalysisJobService {
  constructor(private readonly database: DatabaseClient) {}

  async createJob(input: {
    ownerId: string;
    projectId: string;
    providerName: string;
    requestId: string;
    request: CreateStyleAnalysisJobInput;
  }): Promise<StyleAnalysisJobDto> {
    return withTransaction(this.database, async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Project"
        WHERE "id" = ${input.projectId} AND "ownerId" = ${input.ownerId}
        FOR UPDATE
      `;

      if (lockedProjects.length !== 1) {
        throw projectNotFound();
      }

      const duplicate = await transaction.job.findFirst({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          type: JobType.STYLE_ANALYSIS,
          idempotencyKey: input.request.idempotencyKey,
        },
      });
      if (duplicate) {
        return toStyleAnalysisJobDto(duplicate);
      }

      const activeJob = await transaction.job.findFirst({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          type: JobType.STYLE_ANALYSIS,
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        },
      });
      if (activeJob) {
        throw new ApiError(
          "JOB_CONFLICT",
          409,
          "该项目已有正在处理的风格分析任务。",
          { jobId: activeJob.id },
        );
      }

      const project = await transaction.project.findFirst({
        where: { id: input.projectId, ownerId: input.ownerId },
        select: {
          productName: true,
          category: true,
          sellingPoints: true,
          targetAudience: true,
          forbiddenClaims: true,
        },
      });
      if (!project) {
        throw projectNotFound();
      }

      const references = await transaction.asset.findMany({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          kind: AssetKind.REFERENCE,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (references.length === 0) {
        throw new ApiError(
          "JOB_CONFLICT",
          409,
          "至少上传 1 张参考图后才能开始风格分析。",
        );
      }

      const job = await transaction.job.create({
        data: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          type: JobType.STYLE_ANALYSIS,
          status: JobStatus.QUEUED,
          idempotencyKey: input.request.idempotencyKey,
          inputJson: {
            schemaVersion: "1.0",
            requestId: input.requestId,
            productInfo: project,
            referenceAssetIds: references.map((reference) => reference.id),
          },
          providerName: input.providerName,
          maxAttempts: 2,
        },
      });

      return toStyleAnalysisJobDto(job);
    });
  }

  async getJob(ownerId: string, jobId: string): Promise<StyleAnalysisJobDto> {
    const job = await this.database.job.findFirst({
      where: {
        id: jobId,
        ownerId,
        type: JobType.STYLE_ANALYSIS,
      },
    });

    if (!job) {
      throw new ApiError(
        "JOB_NOT_FOUND",
        404,
        "风格分析任务不存在或无权访问。",
      );
    }

    return toStyleAnalysisJobDto(job);
  }
}

export function toStyleAnalysisJobDto(job: Job): StyleAnalysisJobDto {
  if (job.type !== JobType.STYLE_ANALYSIS) {
    throw new Error("Cannot serialize a non-style-analysis job.");
  }

  return {
    id: job.id,
    projectId: job.projectId,
    type: "STYLE_ANALYSIS",
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    providerName: job.providerName,
    providerRequestId: job.providerRequestId,
    styleSpecRevisionId: job.styleSpecRevisionId,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function projectNotFound() {
  return new ApiError(
    "PROJECT_NOT_FOUND",
    404,
    "商品项目不存在或无权访问。",
  );
}
