import type { Asset, Project } from "@/src/generated/prisma/client";
import { ApiError } from "@/src/http/api";
import type {
  ProjectCreateInput,
  ProjectUpdateInput,
} from "@/src/domain/project";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";

export type AssetDto = {
  id: string;
  kind: Asset["kind"];
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  createdAt: string;
  previewUrl: string;
};

export type ProjectDto = {
  id: string;
  name: string;
  status: Project["status"];
  productName: string;
  category: string;
  sellingPoints: string[];
  targetAudience: string | null;
  forbiddenClaims: string[];
  createdAt: string;
  updatedAt: string;
  assets: AssetDto[];
};

export type ProjectSummaryDto = Omit<ProjectDto, "assets">;

export class ProjectService {
  constructor(private readonly database: DatabaseClient) {}

  async listProjects(ownerId: string): Promise<ProjectSummaryDto[]> {
    const projects = await this.database.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    });

    return projects.map(toProjectSummaryDto);
  }

  async createProject(
    ownerId: string,
    input: ProjectCreateInput,
  ): Promise<ProjectDto> {
    const project = await this.database.project.create({
      data: {
        ownerId,
        ...input,
      },
      include: {
        assets: true,
      },
    });

    return toProjectDto(project);
  }

  async getProject(ownerId: string, projectId: string): Promise<ProjectDto> {
    const project = await this.database.project.findFirst({
      where: {
        id: projectId,
        ownerId,
      },
      include: {
        assets: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!project) {
      throw projectNotFound();
    }

    return toProjectDto(project);
  }

  async updateProject(
    ownerId: string,
    projectId: string,
    input: ProjectUpdateInput,
  ): Promise<ProjectDto> {
    return withTransaction(this.database, async (transaction) => {
      const update = await transaction.project.updateMany({
        where: {
          id: projectId,
          ownerId,
        },
        data: input,
      });

      if (update.count !== 1) {
        throw projectNotFound();
      }

      const project = await transaction.project.findFirst({
        where: {
          id: projectId,
          ownerId,
        },
        include: {
          assets: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!project) {
        throw projectNotFound();
      }

      return toProjectDto(project);
    });
  }
}

export function toAssetDto(asset: Asset): AssetDto {
  return {
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    byteSize: Number(asset.byteSize),
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    createdAt: asset.createdAt.toISOString(),
    previewUrl: `/api/projects/${encodeURIComponent(asset.projectId)}/assets/${encodeURIComponent(asset.id)}`,
  };
}

function toProjectDto(project: Project & { assets: Asset[] }): ProjectDto {
  return {
    ...toProjectSummaryDto(project),
    assets: project.assets.map(toAssetDto),
  };
}

function toProjectSummaryDto(project: Project): ProjectSummaryDto {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    productName: project.productName,
    category: project.category,
    sellingPoints: project.sellingPoints,
    targetAudience: project.targetAudience,
    forbiddenClaims: project.forbiddenClaims,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function projectNotFound() {
  return new ApiError(
    "PROJECT_NOT_FOUND",
    404,
    "商品项目不存在或无权访问。",
  );
}
