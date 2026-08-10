import { randomUUID } from "node:crypto";

import { AssetKind } from "@/src/generated/prisma/client";
import type {
  UploadAssetKind,
  ValidatedImageUpload,
} from "@/src/domain/asset-upload";
import { validateImageUpload } from "@/src/domain/asset-upload";
import { ApiError } from "@/src/http/api";
import { toAssetDto, type AssetDto } from "@/src/services/project-service";
import type {
  DatabaseClient,
  TransactionClient,
} from "@/src/storage/database";
import { withTransaction } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";
import { persistStoredRecord } from "@/src/storage/persist-stored-record";

const ASSET_LIMITS: Record<UploadAssetKind, number> = {
  PRODUCT: 1,
  REFERENCE: 6,
};

type AssetCounter = {
  asset: {
    count(args: {
      where: {
        ownerId: string;
        projectId: string;
        kind: AssetKind;
      };
    }): Promise<number>;
  };
};

export type AssetPreview = {
  body: Uint8Array;
  mimeType: string;
  byteSize: number;
};

export class AssetService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
  ) {}

  async uploadAsset(input: {
    ownerId: string;
    projectId: string;
    kind: UploadAssetKind;
    file: FormDataEntryValue | null;
  }): Promise<AssetDto> {
    await this.assertProject(input.ownerId, input.projectId);
    await assertAssetCapacity(
      this.database,
      input.ownerId,
      input.projectId,
      input.kind,
    );

    const image = await validateImageUpload(input.file);
    const objectKey = createObjectKey(
      input.projectId,
      image.extension,
    );
    const assetKind = toAssetKind(input.kind);
    const asset = await persistStoredRecord({
      storage: this.storage,
      object: {
        key: objectKey,
        body: image.body,
        contentType: image.mimeType,
        metadata: {
          sha256: image.sha256,
          kind: input.kind.toLowerCase(),
        },
      },
      createRecord: () =>
        this.createAssetRecord({
          ownerId: input.ownerId,
          projectId: input.projectId,
          kind: input.kind,
          assetKind,
          objectKey,
          image,
        }),
    });

    return toAssetDto(asset);
  }

  async getPreview(input: {
    ownerId: string;
    projectId: string;
    assetId: string;
  }): Promise<AssetPreview> {
    const asset = await this.database.asset.findFirst({
      where: {
        id: input.assetId,
        projectId: input.projectId,
        ownerId: input.ownerId,
        kind: {
          in: [AssetKind.PRODUCT, AssetKind.REFERENCE],
        },
      },
    });

    if (!asset) {
      throw new ApiError(
        "ASSET_NOT_FOUND",
        404,
        "图片资产不存在或无权访问。",
      );
    }

    const object = await this.storage.getObject(asset.objectKey);

    return {
      body: object.body,
      mimeType: asset.mimeType,
      byteSize: Number(asset.byteSize),
    };
  }

  private async assertProject(ownerId: string, projectId: string) {
    const project = await this.database.project.findFirst({
      where: { id: projectId, ownerId },
      select: { id: true },
    });

    if (!project) {
      throw new ApiError(
        "PROJECT_NOT_FOUND",
        404,
        "商品项目不存在或无权访问。",
      );
    }
  }

  private async createAssetRecord(input: {
    ownerId: string;
    projectId: string;
    kind: UploadAssetKind;
    assetKind: AssetKind;
    objectKey: string;
    image: ValidatedImageUpload;
  }) {
    return withTransaction(this.database, async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Project"
        WHERE "id" = ${input.projectId} AND "ownerId" = ${input.ownerId}
        FOR UPDATE
      `;

      if (lockedProjects.length !== 1) {
        throw new ApiError(
          "PROJECT_NOT_FOUND",
          404,
          "商品项目不存在或无权访问。",
        );
      }

      await assertAssetCapacity(
        transaction,
        input.ownerId,
        input.projectId,
        input.kind,
      );

      return transaction.asset.create({
        data: {
          ownerId: input.ownerId,
          projectId: input.projectId,
          kind: input.assetKind,
          objectKey: input.objectKey,
          mimeType: input.image.mimeType,
          byteSize: BigInt(input.image.byteSize),
          width: input.image.width,
          height: input.image.height,
          sha256: input.image.sha256,
        },
      });
    });
  }
}

async function assertAssetCapacity(
  database: AssetCounter | DatabaseClient | TransactionClient,
  ownerId: string,
  projectId: string,
  kind: UploadAssetKind,
): Promise<void> {
  const assetKind = toAssetKind(kind);
  const count = await database.asset.count({
    where: {
      ownerId,
      projectId,
      kind: assetKind,
    },
  });
  const limit = ASSET_LIMITS[kind];

  if (count >= limit) {
    throw new ApiError(
      "ASSET_LIMIT_REACHED",
      409,
      kind === "PRODUCT"
        ? "每个项目只能上传 1 张主商品图。"
        : "每个项目最多只能上传 6 张参考图。",
      { kind, limit },
    );
  }
}

function toAssetKind(kind: UploadAssetKind): AssetKind {
  return kind === "PRODUCT" ? AssetKind.PRODUCT : AssetKind.REFERENCE;
}

function createObjectKey(projectId: string, extension: string): string {
  return `projects/${projectId}/assets/${randomUUID()}.${extension}`;
}
