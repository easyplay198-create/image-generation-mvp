import type { Job } from "@/src/generated/prisma/client";
import { ApiError } from "@/src/http/api";
import type { DatabaseClient } from "@/src/storage/database";

export type JobDto = {
  id: string;
  projectId: string;
  type: Job["type"];
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

export class JobService {
  constructor(private readonly database: DatabaseClient) {}

  async getJob(ownerId: string, jobId: string): Promise<JobDto> {
    const job = await this.database.job.findFirst({
      where: { id: jobId, ownerId },
    });

    if (!job) {
      throw new ApiError(
        "JOB_NOT_FOUND",
        404,
        "任务不存在或无权访问。",
      );
    }

    return toJobDto(job);
  }
}

export function toJobDto(job: Job): JobDto {
  return {
    id: job.id,
    projectId: job.projectId,
    type: job.type,
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
