import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AssetKind, JobType } from "../../src/generated/prisma/client";
import {
  createDatabaseClient,
  type DatabaseClient,
  withTransaction,
} from "../../src/storage/database";
import { OwnedRecords } from "../../src/storage/owned-records";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const ownerId = `integration-owner-${crypto.randomUUID()}`;
let database: DatabaseClient;

beforeAll(() => {
  database = createDatabaseClient(connectionString);
});

afterAll(async () => {
  await database.export.deleteMany({ where: { ownerId } });
  await database.generationResult.deleteMany({ where: { ownerId } });
  await database.designVersion.deleteMany({ where: { ownerId } });
  await database.job.deleteMany({ where: { ownerId } });
  await database.styleSpecRevision.deleteMany({ where: { ownerId } });
  await database.asset.deleteMany({ where: { ownerId } });
  await database.project.deleteMany({ where: { ownerId } });
  await database.$disconnect();
});

describe("T-01 database boundary", () => {
  it("persists every foundation model and scopes every lookup by ownerId", async () => {
    const project = await database.project.create({
      data: {
        ownerId,
        name: "Integration project",
        productName: "Test product",
        category: "Test category",
        sellingPoints: ["Test point"],
      },
    });
    const productAsset = await database.asset.create({
      data: {
        ownerId,
        projectId: project.id,
        kind: AssetKind.PRODUCT,
        objectKey: `${ownerId}/product.png`,
        mimeType: "image/png",
        byteSize: BigInt(3),
        width: 1,
        height: 1,
        sha256: "product-sha256",
      },
    });
    const generatedAsset = await database.asset.create({
      data: {
        ownerId,
        projectId: project.id,
        kind: AssetKind.GENERATED_BACKGROUND,
        objectKey: `${ownerId}/generated.png`,
        mimeType: "image/png",
        byteSize: BigInt(4),
        width: 1,
        height: 1,
        sha256: "generated-sha256",
        sourceAssetId: productAsset.id,
      },
    });
    const styleSpecRevision = await database.styleSpecRevision.create({
      data: {
        ownerId,
        projectId: project.id,
        revisionNumber: 1,
        schemaVersion: "1",
        specJson: { fixture: true },
      },
    });
    const job = await database.job.create({
      data: {
        ownerId,
        projectId: project.id,
        type: JobType.IMAGE_GENERATION,
        styleSpecRevisionId: styleSpecRevision.id,
      },
    });
    const generationResult = await database.generationResult.create({
      data: {
        ownerId,
        projectId: project.id,
        jobId: job.id,
        assetId: generatedAsset.id,
        styleSpecRevisionId: styleSpecRevision.id,
      },
    });
    const designVersion = await database.designVersion.create({
      data: {
        ownerId,
        projectId: project.id,
        versionNumber: 1,
        styleSpecRevisionId: styleSpecRevision.id,
        designJson: { fixture: true },
        previewAssetId: generatedAsset.id,
      },
    });
    const exportAsset = await database.asset.create({
      data: {
        ownerId,
        projectId: project.id,
        kind: AssetKind.EXPORT,
        objectKey: `${ownerId}/export.png`,
        mimeType: "image/png",
        byteSize: BigInt(5),
        width: 1,
        height: 1,
        sha256: "export-sha256",
      },
    });
    const exported = await database.export.create({
      data: {
        ownerId,
        projectId: project.id,
        designVersionId: designVersion.id,
        assetId: exportAsset.id,
      },
    });
    const records = new OwnedRecords(database);
    const otherOwnerId = `${ownerId}-other`;
    const resources = [
      [records.findProject.bind(records), project.id],
      [records.findAsset.bind(records), generatedAsset.id],
      [records.findStyleSpecRevision.bind(records), styleSpecRevision.id],
      [records.findJob.bind(records), job.id],
      [records.findGenerationResult.bind(records), generationResult.id],
      [records.findDesignVersion.bind(records), designVersion.id],
      [records.findExport.bind(records), exported.id],
    ] as const;

    for (const [findRecord, id] of resources) {
      await expect(findRecord({ ownerId, id })).resolves.toMatchObject({
        id,
        ownerId,
      });
      await expect(
        findRecord({ ownerId: otherOwnerId, id }),
      ).resolves.toBeNull();
    }
  });

  it("rolls back every write when a transaction operation fails", async () => {
    const rollbackProjectId = `rollback-${crypto.randomUUID()}`;

    await expect(
      withTransaction(database, async (transaction) => {
        await transaction.project.create({
          data: {
            id: rollbackProjectId,
            ownerId,
            name: "Must roll back",
            productName: "Test product",
            category: "Test category",
            sellingPoints: [],
          },
        });

        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");

    await expect(
      database.project.findUnique({ where: { id: rollbackProjectId } }),
    ).resolves.toBeNull();
  });
});
