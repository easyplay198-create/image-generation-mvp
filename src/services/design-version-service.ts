import { AssetKind, Prisma } from "@/src/generated/prisma/client";
import {
  parseDesignDocument,
  type DesignDocument,
} from "@/src/editor/design-document";
import { ApiError } from "@/src/http/api";
import type { DatabaseClient } from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";

export type DesignVersionDto = {
  id: string;
  projectId: string;
  versionNumber: number;
  canvasWidth: number;
  canvasHeight: number;
  styleSpecRevisionId: string;
  document: DesignDocument;
  createdAt: string;
};

export class DesignVersionService {
  constructor(private readonly database: DatabaseClient) {}

  async saveVersion(input: {
    ownerId: string;
    projectId: string;
    document: DesignDocument;
  }): Promise<DesignVersionDto> {
    const document = parseDesignDocument(input.document);

    return withTransaction(this.database, async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Project"
        WHERE "id" = ${input.projectId} AND "ownerId" = ${input.ownerId}
        FOR UPDATE
      `;
      if (lockedProjects.length !== 1) throw projectNotFound();

      const revision = await transaction.styleSpecRevision.findFirst({
        where: {
          id: document.styleSpecRevisionId,
          ownerId: input.ownerId,
          projectId: input.projectId,
        },
        select: { id: true },
      });
      if (!revision) {
        throw new ApiError(
          "STYLE_SPEC_INVALID",
          409,
          "设计引用的 StyleSpec revision 不存在或无权访问。",
        );
      }

      const assetLayers = document.layers.filter(
        (layer) =>
          layer.type === "PRODUCT" || layer.type === "AI_BACKGROUND",
      );
      const assets = await transaction.asset.findMany({
        where: {
          id: { in: assetLayers.map((layer) => layer.sourceAssetId) },
          ownerId: input.ownerId,
          projectId: input.projectId,
        },
        select: { id: true, kind: true },
      });
      const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

      for (const layer of assetLayers) {
        const asset = assetsById.get(layer.sourceAssetId);
        const expectedKind =
          layer.type === "PRODUCT"
            ? AssetKind.PRODUCT
            : AssetKind.GENERATED_BACKGROUND;
        if (!asset || asset.kind !== expectedKind) {
          throw new ApiError(
            "ASSET_NOT_FOUND",
            409,
            layer.type === "PRODUCT"
              ? "商品图层必须引用当前项目的原始商品资产。"
              : "背景图层必须引用当前项目的 AI 背景资产。",
            { layerId: layer.id, expectedKind },
          );
        }
      }

      const latestVersion = await transaction.designVersion.findFirst({
        where: { ownerId: input.ownerId, projectId: input.projectId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const version = await transaction.designVersion.create({
        data: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          canvasWidth: document.canvas.width,
          canvasHeight: document.canvas.height,
          styleSpecRevisionId: document.styleSpecRevisionId,
          documentJson: document as Prisma.InputJsonValue,
        },
      });

      return {
        id: version.id,
        projectId: version.projectId,
        versionNumber: version.versionNumber,
        canvasWidth: version.canvasWidth,
        canvasHeight: version.canvasHeight,
        styleSpecRevisionId: version.styleSpecRevisionId,
        document,
        createdAt: version.createdAt.toISOString(),
      };
    });
  }
}

function projectNotFound() {
  return new ApiError(
    "PROJECT_NOT_FOUND",
    404,
    "商品项目不存在或无权访问。",
  );
}
