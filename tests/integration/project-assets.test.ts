import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredObject } from "../../src/storage/object-storage";
import type { ObjectStorage, RetrievedObject } from "../../src/storage/object-storage";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";
import { AssetService } from "../../src/services/asset-service";
import { ProjectService } from "../../src/services/project-service";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const ownerId = `t02-owner-${crypto.randomUUID()}`;
const otherOwnerId = `${ownerId}-other`;
let database: DatabaseClient;
let storage: MemoryObjectStorage;
let projectService: ProjectService;
let assetService: AssetService;
let projectId: string;

beforeAll(() => {
  database = createDatabaseClient(connectionString);
  storage = new MemoryObjectStorage();
  projectService = new ProjectService(database);
  assetService = new AssetService(database, storage);
});

afterAll(async () => {
  await database.project.deleteMany({ where: { ownerId } });
  await database.$disconnect();
});

describe("T-02 project and asset boundary", () => {
  it("creates, reads and edits a project without crossing ownerId", async () => {
    const project = await projectService.createProject(ownerId, {
      name: "T-02 project",
      productName: "Coffee cup",
      category: "Drinkware",
      sellingPoints: ["Lightweight"],
      targetAudience: null,
      forbiddenClaims: [],
    });
    projectId = project.id;

    await expect(projectService.listProjects(otherOwnerId)).resolves.toEqual([]);

    await expect(
      projectService.getProject(otherOwnerId, projectId),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(
      projectService.updateProject(otherOwnerId, projectId, {
        name: "Unauthorized",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });

    await expect(
      projectService.updateProject(ownerId, projectId, {
        productName: "Updated coffee cup",
        sellingPoints: ["Lightweight", "Leak resistant"],
      }),
    ).resolves.toMatchObject({
      productName: "Updated coffee cup",
      sellingPoints: ["Lightweight", "Leak resistant"],
    });
  });

  it("stores one product image and never exceeds six references under concurrency", async () => {
    const productFile = await createPngFile("product.png");
    const referenceFile = await createPngFile("reference.png");
    const disguisedFile = await createPngFile("disguised.jpg", "image/jpeg");

    await expect(
      assetService.uploadAsset({
        ownerId,
        projectId,
        kind: "PRODUCT",
        file: disguisedFile,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    await expect(
      database.asset.count({ where: { ownerId, projectId } }),
    ).resolves.toBe(0);
    expect(storage.objects.size).toBe(0);

    const product = await assetService.uploadAsset({
      ownerId,
      projectId,
      kind: "PRODUCT",
      file: productFile,
    });

    for (let index = 0; index < 5; index += 1) {
      await assetService.uploadAsset({
        ownerId,
        projectId,
        kind: "REFERENCE",
        file: referenceFile,
      });
    }

    storage.waitForConcurrentPuts(2);
    const race = await Promise.allSettled([
      assetService.uploadAsset({
        ownerId,
        projectId,
        kind: "REFERENCE",
        file: referenceFile,
      }),
      assetService.uploadAsset({
        ownerId,
        projectId,
        kind: "REFERENCE",
        file: referenceFile,
      }),
    ]);

    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      race.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { code: "ASSET_LIMIT_REACHED" },
    });
    expect(storage.objects.size).toBe(7);
    expect(storage.deletes).toBe(1);
    for (const key of storage.objects.keys()) {
      expect(key).toMatch(
        new RegExp(`^projects/${projectId}/assets/[0-9a-f-]+\\.png$`),
      );
      expect(key).not.toContain("product.png");
      expect(key).not.toContain("reference.png");
    }

    await expect(
      assetService.uploadAsset({
        ownerId,
        projectId,
        kind: "REFERENCE",
        file: referenceFile,
      }),
    ).rejects.toMatchObject({ code: "ASSET_LIMIT_REACHED" });
    await expect(
      assetService.uploadAsset({
        ownerId,
        projectId,
        kind: "PRODUCT",
        file: productFile,
      }),
    ).rejects.toMatchObject({ code: "ASSET_LIMIT_REACHED" });
    expect(storage.objects.size).toBe(7);

    const refreshed = await projectService.getProject(ownerId, projectId);
    expect(refreshed.assets.filter((asset) => asset.kind === "PRODUCT")).toHaveLength(1);
    expect(refreshed.assets.filter((asset) => asset.kind === "REFERENCE")).toHaveLength(6);

    await expect(
      assetService.getPreview({ ownerId, projectId, assetId: product.id }),
    ).resolves.toMatchObject({
      mimeType: "image/png",
      byteSize: product.byteSize,
    });
    await expect(
      assetService.getPreview({
        ownerId: otherOwnerId,
        projectId,
        assetId: product.id,
      }),
    ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
  });
});

class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, RetrievedObject>();
  deletes = 0;
  private putBarrier?: {
    remaining: number;
    promise: Promise<void>;
    release: () => void;
  };

  waitForConcurrentPuts(participants: number): void {
    let release = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.putBarrier = { remaining: participants, promise, release };
  }

  async putObject(object: StoredObject): Promise<void> {
    this.objects.set(object.key, {
      body: Uint8Array.from(object.body),
      contentType: object.contentType,
    });

    const barrier = this.putBarrier;
    if (barrier) {
      barrier.remaining -= 1;
      if (barrier.remaining === 0) {
        this.putBarrier = undefined;
        barrier.release();
      }
      await barrier.promise;
    }
  }

  async getObject(key: string): Promise<RetrievedObject> {
    const object = this.objects.get(key);
    if (!object) throw new Error("Object not found");
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    this.deletes += 1;
    this.objects.delete(key);
  }

  async checkConnection(): Promise<void> {}
}

async function createPngFile(fileName: string, mimeType = "image/png") {
  const bytes = await sharp({
    create: {
      width: 3,
      height: 4,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new File([body], fileName, { type: mimeType });
}
