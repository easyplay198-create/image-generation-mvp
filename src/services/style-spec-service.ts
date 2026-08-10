import type { StyleSpecRevision } from "@/src/generated/prisma/client";
import { JobType } from "@/src/generated/prisma/client";
import {
  parseStyleSpecV1,
  StyleSpecValidationError,
  type StyleSpecV1,
} from "@/src/domain/style-spec";
import { ApiError } from "@/src/http/api";
import {
  toStyleAnalysisJobDto,
  type StyleAnalysisJobDto,
} from "@/src/services/style-analysis-job-service";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";

export type StyleSpecRevisionDto = {
  id: string;
  projectId: string;
  revisionNumber: number;
  schemaVersion: "1.0";
  spec: StyleSpecV1;
  createdAt: string;
};

export type StyleSpecStateDto = {
  latestRevision: StyleSpecRevisionDto | null;
  latestJob: StyleAnalysisJobDto | null;
};

export class StyleSpecService {
  constructor(private readonly database: DatabaseClient) {}

  async getState(
    ownerId: string,
    projectId: string,
  ): Promise<StyleSpecStateDto> {
    await this.assertProject(ownerId, projectId);

    const [revision, job] = await Promise.all([
      this.database.styleSpecRevision.findFirst({
        where: { ownerId, projectId },
        orderBy: { revisionNumber: "desc" },
      }),
      this.database.job.findFirst({
        where: { ownerId, projectId, type: JobType.STYLE_ANALYSIS },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      latestRevision: revision ? toStyleSpecRevisionDto(revision) : null,
      latestJob: job ? toStyleAnalysisJobDto(job) : null,
    };
  }

  async saveUserRevision(input: {
    ownerId: string;
    projectId: string;
    spec: unknown;
  }): Promise<StyleSpecRevisionDto> {
    const spec = parseForApi(input.spec);

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

      const latest = await transaction.styleSpecRevision.findFirst({
        where: { ownerId: input.ownerId, projectId: input.projectId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });
      const revision = await transaction.styleSpecRevision.create({
        data: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          schemaVersion: spec.schemaVersion,
          specJson: spec,
        },
      });

      return toStyleSpecRevisionDto(revision);
    });
  }

  private async assertProject(ownerId: string, projectId: string) {
    const project = await this.database.project.findFirst({
      where: { id: projectId, ownerId },
      select: { id: true },
    });

    if (!project) {
      throw projectNotFound();
    }
  }
}

export function toStyleSpecRevisionDto(
  revision: StyleSpecRevision,
): StyleSpecRevisionDto {
  const spec = parseStoredSpec(revision.specJson);

  return {
    id: revision.id,
    projectId: revision.projectId,
    revisionNumber: revision.revisionNumber,
    schemaVersion: "1.0",
    spec,
    createdAt: revision.createdAt.toISOString(),
  };
}

function parseForApi(input: unknown): StyleSpecV1 {
  try {
    return parseStyleSpecV1(input);
  } catch (error) {
    if (error instanceof StyleSpecValidationError) {
      throw new ApiError(
        "STYLE_SPEC_INVALID",
        400,
        "StyleSpec 不符合 V1 Schema。",
        { issues: error.issues },
      );
    }
    throw error;
  }
}

function parseStoredSpec(input: unknown): StyleSpecV1 {
  try {
    return parseStyleSpecV1(input);
  } catch (error) {
    if (error instanceof StyleSpecValidationError) {
      throw new ApiError(
        "STYLE_SPEC_INVALID",
        500,
        "已保存的 StyleSpec 无法通过 V1 Schema 校验。",
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
