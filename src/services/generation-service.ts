import type {
  Asset,
  GenerationResult,
} from "@/src/generated/prisma/client";
import { AssetKind, JobStatus, JobType } from "@/src/generated/prisma/client";
import type { CreateGenerationJobInput } from "@/src/domain/generation-job";
import { parseStoredGenerationUsage } from "@/src/domain/generated-background";
import {
  parseStyleSpecV1,
  StyleSpecValidationError,
} from "@/src/domain/style-spec";
import { ApiError } from "@/src/http/api";
import { toJobDto, type JobDto } from "@/src/services/job-service";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

export type GenerationResultDto = {
  id: string;
  projectId: string;
  jobId: string;
  styleSpecRevisionId: string;
  providerName: string;
  providerRequestId: string;
  requestId: string;
  durationMs: number;
  usage: {
    generatedImages: number;
    inputUnits: number | null;
    outputPixels: number;
  };
  costMetadata: {
    amount: string;
    currency: string;
    estimated: boolean;
  };
  asset: {
    id: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
    previewUrl: string;
  };
  createdAt: string;
};

export type GeneratedBackgroundPreview = {
  body: Uint8Array;
  mimeType: string;
  byteSize: number;
};

export class GenerationService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage?: ObjectStorage,
  ) {}

  async createJob(input: {
    ownerId: string;
    projectId: string;
    providerName: string;
    requestId: string;
    request: CreateGenerationJobInput;
  }): Promise<JobDto> {
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
          type: JobType.IMAGE_GENERATION,
          idempotencyKey: input.request.idempotencyKey,
        },
      });
      if (duplicate) return toJobDto(duplicate);

      const activeJob = await transaction.job.findFirst({
        where: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          type: JobType.IMAGE_GENERATION,
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        },
      });
      if (activeJob) {
        throw new ApiError(
          "JOB_CONFLICT",
          409,
          "该项目已有正在处理的背景生成任务。",
          { jobId: activeJob.id },
        );
      }

      const revision = await transaction.styleSpecRevision.findFirst({
        where: {
          id: input.request.styleSpecRevisionId,
          ownerId: input.ownerId,
          projectId: input.projectId,
        },
      });
      if (!revision) {
        throw new ApiError(
          "STYLE_SPEC_INVALID",
          404,
          "StyleSpec revision 不存在或无权访问。",
        );
      }
      assertStoredStyleSpec(revision.specJson);

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
      if (!project) throw projectNotFound();

      const job = await transaction.job.create({
        data: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          type: JobType.IMAGE_GENERATION,
          status: JobStatus.QUEUED,
          idempotencyKey: input.request.idempotencyKey,
          styleSpecRevisionId: revision.id,
          inputJson: {
            schemaVersion: "1.0",
            requestId: input.requestId,
            idempotencyKey: input.request.idempotencyKey,
            styleSpecRevisionId: revision.id,
            productContext: project,
            canvas: { width: 1080, height: 1080 },
          },
          providerName: input.providerName,
          maxAttempts: 2,
        },
      });

      return toJobDto(job);
    });
  }

  async listGenerations(
    ownerId: string,
    projectId: string,
  ): Promise<GenerationResultDto[]> {
    await this.assertProject(ownerId, projectId);
    const results = await this.database.generationResult.findMany({
      where: { ownerId, projectId },
      include: { asset: true },
      orderBy: { createdAt: "desc" },
    });

    return results.map(toGenerationResultDto);
  }

  async getPreview(input: {
    ownerId: string;
    projectId: string;
    generationId: string;
  }): Promise<GeneratedBackgroundPreview> {
    if (!this.storage) {
      throw new Error("Object storage is required for generation previews.");
    }

    const result = await this.database.generationResult.findFirst({
      where: {
        id: input.generationId,
        ownerId: input.ownerId,
        projectId: input.projectId,
        asset: { kind: AssetKind.GENERATED_BACKGROUND },
      },
      include: { asset: true },
    });
    if (!result) {
      throw new ApiError(
        "GENERATION_NOT_FOUND",
        404,
        "生成背景不存在或无权访问。",
      );
    }

    const object = await this.storage.getObject(result.asset.objectKey);
    return {
      body: object.body,
      mimeType: result.asset.mimeType,
      byteSize: Number(result.asset.byteSize),
    };
  }

  private async assertProject(ownerId: string, projectId: string) {
    const project = await this.database.project.findFirst({
      where: { id: projectId, ownerId },
      select: { id: true },
    });
    if (!project) throw projectNotFound();
  }
}

export function toGenerationResultDto(
  result: GenerationResult & { asset: Asset },
): GenerationResultDto {
  const normalized = parseStoredGenerationUsage(
    result.usageJson,
    result.costMetadataJson,
    result.providerRequestId,
  );

  return {
    id: result.id,
    projectId: result.projectId,
    jobId: result.jobId,
    styleSpecRevisionId: result.styleSpecRevisionId,
    providerName: result.providerName,
    providerRequestId: result.providerRequestId,
    requestId: result.requestId,
    durationMs: result.durationMs,
    usage: {
      generatedImages: normalized.generatedImages,
      inputUnits: normalized.inputUnits,
      outputPixels: normalized.outputPixels,
    },
    costMetadata: normalized.costMetadata,
    asset: {
      id: result.asset.id,
      mimeType: result.asset.mimeType,
      byteSize: Number(result.asset.byteSize),
      width: result.asset.width,
      height: result.asset.height,
      sha256: result.asset.sha256,
      previewUrl: `/api/projects/${encodeURIComponent(result.projectId)}/generations/${encodeURIComponent(result.id)}/preview`,
    },
    createdAt: result.createdAt.toISOString(),
  };
}

function assertStoredStyleSpec(input: unknown) {
  try {
    parseStyleSpecV1(input);
  } catch (error) {
    if (error instanceof StyleSpecValidationError) {
      throw new ApiError(
        "STYLE_SPEC_INVALID",
        409,
        "StyleSpec revision 未通过 V1 Schema 校验。",
      );
    }
    throw error;
  }
}

function projectNotFound() {
  return new ApiError(
    "PROJECT_NOT_FOUND",
    404,
    "商品项目不存在或无权访问。",
  );
}
