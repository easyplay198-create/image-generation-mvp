import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AssetKind } from "../../src/generated/prisma/client";
import {
  parseDesignDocument,
  type DesignDocument,
} from "../../src/editor/design-document";
import { DesignVersionService } from "../../src/services/design-version-service";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const ownerId = `t05-owner-${crypto.randomUUID()}`;
let database: DatabaseClient;
let service: DesignVersionService;
let projectId: string;
let productAssetId: string;
let backgroundAssetId: string;
let styleSpecRevisionId: string;

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  service = new DesignVersionService(database);
  const project = await database.project.create({
    data: {
      ownerId,
      name: "T-05 editor project",
      productName: "Travel mug",
      category: "Drinkware",
      sellingPoints: ["Keeps drinks warm"],
    },
  });
  projectId = project.id;
  const product = await database.asset.create({
    data: {
      ownerId,
      projectId,
      kind: AssetKind.PRODUCT,
      objectKey: `tests/${projectId}/t05-product.png`,
      mimeType: "image/png",
      byteSize: BigInt(1),
      width: 800,
      height: 800,
      sha256: "t05-product",
    },
  });
  productAssetId = product.id;
  const background = await database.asset.create({
    data: {
      ownerId,
      projectId,
      kind: AssetKind.GENERATED_BACKGROUND,
      objectKey: `tests/${projectId}/t05-background.png`,
      mimeType: "image/png",
      byteSize: BigInt(1),
      width: 1080,
      height: 1080,
      sha256: "t05-background",
    },
  });
  backgroundAssetId = background.id;
  const revision = await database.styleSpecRevision.create({
    data: {
      ownerId,
      projectId,
      revisionNumber: 1,
      schemaVersion: "1.0",
      specJson: { fixture: true },
    },
  });
  styleSpecRevisionId = revision.id;
});

afterAll(async () => {
  await database.project.deleteMany({ where: { ownerId } });
  await database.$disconnect();
});

describe("T-05 design version save boundary", () => {
  it("saves immutable design and layer snapshots with monotonic versions", async () => {
    const firstDocument = validDocument("Version one");
    const first = await service.saveVersion({
      ownerId,
      projectId,
      document: firstDocument,
    });
    const secondDocument = validDocument("Version two");
    const second = await service.saveVersion({
      ownerId,
      projectId,
      document: secondDocument,
    });

    expect(first).toMatchObject({
      versionNumber: 1,
      canvasWidth: 1080,
      canvasHeight: 1080,
      styleSpecRevisionId,
      document: firstDocument,
    });
    expect(second.versionNumber).toBe(2);

    const persistedFirst = await database.designVersion.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(parseDesignDocument(persistedFirst.documentJson)).toEqual(
      firstDocument,
    );
    expect(findText(parseDesignDocument(persistedFirst.documentJson))).toBe(
      "Version one",
    );
  });

  it("serializes concurrent saves under the project lock", async () => {
    const versions = await Promise.all(
      ["Concurrent A", "Concurrent B"].map((text) =>
        service.saveVersion({
          ownerId,
          projectId,
          document: validDocument(text),
        }),
      ),
    );

    expect(versions.map((version) => version.versionNumber).sort()).toEqual([
      3, 4,
    ]);
  });

  it("enforces owner, product asset and generated background boundaries", async () => {
    await expect(
      service.saveVersion({
        ownerId: `${ownerId}-other`,
        projectId,
        document: validDocument("Other owner"),
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });

    await expect(
      service.saveVersion({
        ownerId,
        projectId,
        document: replaceAssetReference(
          validDocument("Wrong product"),
          "PRODUCT",
          backgroundAssetId,
        ),
      }),
    ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });

    await expect(
      service.saveVersion({
        ownerId,
        projectId,
        document: replaceAssetReference(
          validDocument("Wrong background"),
          "AI_BACKGROUND",
          productAssetId,
        ),
      }),
    ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
  });
});

function validDocument(text: string): DesignDocument {
  return parseDesignDocument({
    schemaVersion: "1.0",
    styleSpecRevisionId,
    canvas: {
      width: 1080,
      height: 1080,
      backgroundColor: "#FFFFFF",
    },
    layers: [
      {
        id: "background-main",
        type: "AI_BACKGROUND",
        sourceAssetId: backgroundAssetId,
        zIndex: 0,
        visible: true,
        locked: true,
        x: 540,
        y: 540,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      },
      {
        id: "product-main",
        type: "PRODUCT",
        sourceAssetId: productAssetId,
        zIndex: 10,
        visible: true,
        locked: false,
        x: 540,
        y: 600,
        scaleX: 0.8,
        scaleY: 0.8,
        rotation: 0,
        opacity: 1,
      },
      {
        id: "text-main",
        type: "TEXT",
        sourceAssetId: null,
        zIndex: 20,
        visible: true,
        locked: false,
        x: 540,
        y: 120,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        text,
        fontFamily: "Arial",
        fontSize: 64,
        color: "#172033",
        textAlign: "center",
      },
    ],
  });
}

function replaceAssetReference(
  document: DesignDocument,
  type: "PRODUCT" | "AI_BACKGROUND",
  sourceAssetId: string,
): DesignDocument {
  return parseDesignDocument({
    ...document,
    layers: document.layers.map((layer) =>
      layer.type === type ? { ...layer, sourceAssetId } : layer,
    ),
  });
}

function findText(document: DesignDocument): string | undefined {
  return document.layers.find((layer) => layer.type === "TEXT")?.text;
}
