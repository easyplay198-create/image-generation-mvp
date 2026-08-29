import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import {
  createP2ProductProject,
  getP2ProductProject,
} from "../../src/projects/product-project";
import { registerP2SourceSnapshot } from "../../src/sources/source-snapshot";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "../../src/storage/object-storage";
import {
  createP2TestPrincipalResolver,
  initializeP2TestAuthContext,
  P2_TEST_IDENTITY,
} from "../fixtures/p2-test-auth-context";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

let database: DatabaseClient;
let primaryProjectId: string;
let primarySnapshotId: string;
let otherIdentity: SyntheticIdentity;

const primaryResolver = createP2TestPrincipalResolver({ NODE_ENV: "test" });

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  await initializeP2TestAuthContext(database, { NODE_ENV: "test" });
  otherIdentity = await createSyntheticIdentity("p2-s1b-other");
});

afterAll(async () => {
  await database.$disconnect();
});

describe.sequential("P2 S1B ProductProject and SourceSnapshot isolation", () => {
  it("creates and reads a safe ProductProject only in the active Workspace", async () => {
    const project = await createP2ProductProject(
      database,
      { displayName: "  P2 S1B product  " },
      primaryResolver,
    );
    primaryProjectId = project.projectId;

    expect(project).toMatchObject({
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      displayName: "P2 S1B product",
      status: "DRAFT",
      createdByActorId: P2_TEST_IDENTITY.userActorId,
      archivedAt: null,
    });
    expect(project).not.toHaveProperty("skuIdentityKey");
    expect(project).not.toHaveProperty("ownerId");
    expect(project).not.toHaveProperty("activeTruthRevisionId");

    await expect(
      getP2ProductProject(database, primaryProjectId, primaryResolver),
    ).resolves.toEqual(project);

    const persisted = await database.productProject.findUniqueOrThrow({
      where: { projectId: primaryProjectId },
    });
    expect(persisted.skuIdentityKey).toMatch(/^p2_sku_[0-9a-f-]+$/);
    expect(persisted.skuIdentityKey).not.toContain("P2 S1B product");
    await expect(
      database.project.findUnique({ where: { id: primaryProjectId } }),
    ).resolves.toBeNull();
  });

  it("fails closed on cross-Workspace reads and storage registration", async () => {
    const otherResolver = resolverFor(otherIdentity);
    const storage = new MemoryObjectStorage();

    await expect(
      getP2ProductProject(database, primaryProjectId, otherResolver),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(
      registerP2SourceSnapshot(
        database,
        storage,
        {
          projectId: primaryProjectId,
          sourceKind: "PRODUCT_SOURCE",
          file: await createImageFile("png", "cross-workspace.png", "image/png"),
        },
        otherResolver,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(storage.puts).toBe(0);
    expect(storage.objects.size).toBe(0);

    await expect(
      database.productProject.create({
        data: {
          projectId: uniqueId("cross-scope-project"),
          workspaceId: otherIdentity.workspaceId,
          skuIdentityKey: uniqueId("cross-scope-sku"),
          displayName: "Invalid cross-scope creator",
          status: "DRAFT",
          createdByActorId: P2_TEST_IDENTITY.userActorId,
        },
      }),
    ).rejects.toBeTruthy();

    await expect(
      database.sourceSnapshot.create({
        data: validSnapshotData({
          sourceSnapshotId: uniqueId("cross-scope-snapshot"),
          workspaceId: otherIdentity.workspaceId,
          projectId: primaryProjectId,
          createdByActorId: otherIdentity.userActorId,
        }),
      }),
    ).rejects.toBeTruthy();
  });

  it("enforces frozen uniqueness, checks, and creator provenance", async () => {
    const project = await database.productProject.findUniqueOrThrow({
      where: { projectId: primaryProjectId },
    });

    await expect(
      database.productProject.create({
        data: {
          projectId: uniqueId("duplicate-sku-project"),
          workspaceId: project.workspaceId,
          skuIdentityKey: project.skuIdentityKey,
          displayName: "Duplicate hidden identity",
          status: "DRAFT",
          createdByActorId: project.createdByActorId,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.productProject.create({
        data: {
          projectId: uniqueId("invalid-archived-project"),
          workspaceId: project.workspaceId,
          skuIdentityKey: uniqueId("invalid-archived-sku"),
          displayName: "Invalid archived state",
          status: "ARCHIVED",
          createdByActorId: project.createdByActorId,
          archivedAt: null,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.productProject.create({
        data: {
          projectId: uniqueId("blank-name-project"),
          workspaceId: project.workspaceId,
          skuIdentityKey: uniqueId("blank-name-sku"),
          displayName: "   ",
          status: "DRAFT",
          createdByActorId: project.createdByActorId,
        },
      }),
    ).rejects.toBeTruthy();

    const invalidSnapshots = [
      validSnapshotData({
        sourceSnapshotId: uniqueId("zero-byte"),
        byteSize: BigInt(0),
      }),
      validSnapshotData({
        sourceSnapshotId: uniqueId("invalid-mime"),
        mediaType: "image/gif",
      }),
      validSnapshotData({
        sourceSnapshotId: uniqueId("invalid-digest"),
        contentDigest: "ABC",
      }),
      validSnapshotData({
        sourceSnapshotId: uniqueId("blank-locator"),
        storageLocator: "   ",
      }),
      validSnapshotData({
        sourceSnapshotId: uniqueId("cross-scope-actor"),
        createdByActorId: otherIdentity.userActorId,
      }),
    ];

    for (const data of invalidSnapshots) {
      await expect(database.sourceSnapshot.create({ data })).rejects.toBeTruthy();
    }
  });

  it("persists one exact validated snapshot without legacy or binary rows", async () => {
    const storage = new MemoryObjectStorage();
    const file = await createImageFile("png", "product.png", "image/png");

    const snapshot = await registerP2SourceSnapshot(
      database,
      storage,
      {
        projectId: primaryProjectId,
        sourceKind: "PRODUCT_SOURCE",
        file,
      },
      primaryResolver,
    );
    primarySnapshotId = snapshot.sourceSnapshotId;

    expect(snapshot).toMatchObject({
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      projectId: primaryProjectId,
      sourceKind: "PRODUCT_SOURCE",
      mediaType: "image/png",
      byteSize: file.size,
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
      createdByActorId: P2_TEST_IDENTITY.userActorId,
    });
    expect(snapshot.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot).not.toHaveProperty("storageLocator");

    const persisted = await database.sourceSnapshot.findUniqueOrThrow({
      where: { sourceSnapshotId: primarySnapshotId },
    });
    expect(persisted).toMatchObject({
      workspaceId: snapshot.workspaceId,
      projectId: snapshot.projectId,
      sourceKind: snapshot.sourceKind,
      mediaType: snapshot.mediaType,
      byteSize: BigInt(snapshot.byteSize),
      contentDigest: snapshot.contentDigest,
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
      createdByActorId: snapshot.createdByActorId,
    });
    expect(persisted.storageLocator).toMatch(
      new RegExp(
        `^p2/${P2_TEST_IDENTITY.workspaceId}/${primaryProjectId}/source-snapshots/${primarySnapshotId}\\.png$`,
      ),
    );
    expect(Object.keys(persisted)).not.toContain("body");
    expect(storage.objects.get(persisted.storageLocator)?.body).toHaveLength(
      file.size,
    );
    await expect(
      database.asset.count({ where: { projectId: primaryProjectId } }),
    ).resolves.toBe(0);
  });

  it("rejects BLOCKED and ARCHIVED projects before injected storage writes", async () => {
    const blocked = await createP2ProductProject(
      database,
      { displayName: "Blocked project" },
      primaryResolver,
    );
    const archived = await createP2ProductProject(
      database,
      { displayName: "Archived project" },
      primaryResolver,
    );
    await database.productProject.update({
      where: { projectId: blocked.projectId },
      data: { status: "BLOCKED" },
    });
    await database.productProject.update({
      where: { projectId: archived.projectId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    for (const projectId of [blocked.projectId, archived.projectId]) {
      const storage = new MemoryObjectStorage();
      await expect(
        registerP2SourceSnapshot(
          database,
          storage,
          {
            projectId,
            sourceKind: "PRODUCT_SOURCE",
            file: await createImageFile("png", "blocked.png", "image/png"),
          },
          primaryResolver,
        ),
      ).rejects.toMatchObject({ code: "PROJECT_NOT_WRITABLE" });
      expect(storage.puts).toBe(0);
      expect(storage.objects.size).toBe(0);
    }
  });

  it("enforces immutable identities, immutable source content, and no physical delete", async () => {
    await expect(
      database.productProject.update({
        where: { projectId: primaryProjectId },
        data: { skuIdentityKey: uniqueId("changed-sku") },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.productProject.delete({ where: { projectId: primaryProjectId } }),
    ).rejects.toBeTruthy();

    await expect(
      database.sourceSnapshot.update({
        where: { sourceSnapshotId: primarySnapshotId },
        data: { contentDigest: "b".repeat(64) },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.sourceSnapshot.delete({
        where: { sourceSnapshotId: primarySnapshotId },
      }),
    ).rejects.toBeTruthy();

    await expect(
      database.productProject.findUnique({ where: { projectId: primaryProjectId } }),
    ).resolves.not.toBeNull();
    await expect(
      database.sourceSnapshot.findUnique({
        where: { sourceSnapshotId: primarySnapshotId },
      }),
    ).resolves.not.toBeNull();
  });

  it("exposes the frozen composite foreign keys, checks, indexes, and triggers", async () => {
    const foreignKeys = await database.$queryRaw<
      Array<{ name: string; columns: string[]; delete_action: string; update_action: string }>
    >`SELECT
        constraint_row.conname AS name,
        array_agg(attribute.attname ORDER BY key_column.ordinality)::text[] AS columns,
        constraint_row.confdeltype::text AS delete_action,
        constraint_row.confupdtype::text AS update_action
      FROM pg_constraint AS constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey)
        WITH ORDINALITY AS key_column(attnum, ordinality)
      INNER JOIN pg_attribute AS attribute
        ON attribute.attrelid = constraint_row.conrelid
       AND attribute.attnum = key_column.attnum
      WHERE constraint_row.contype = 'f'
        AND constraint_row.conrelid IN (
          '"ProductProject"'::regclass,
          '"SourceSnapshot"'::regclass
        )
      GROUP BY
        constraint_row.oid,
        constraint_row.conname,
        constraint_row.confdeltype,
        constraint_row.confupdtype
      ORDER BY constraint_row.conname`;
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ProductProject_workspaceId_createdByActorId_fkey",
          columns: ["workspaceId", "createdByActorId"],
        }),
        expect.objectContaining({
          name: "SourceSnapshot_workspaceId_projectId_fkey",
          columns: ["workspaceId", "projectId"],
        }),
        expect.objectContaining({
          name: "SourceSnapshot_workspaceId_createdByActorId_fkey",
          columns: ["workspaceId", "createdByActorId"],
        }),
      ]),
    );
    for (const foreignKey of foreignKeys) {
      expect(foreignKey).toMatchObject({ delete_action: "r", update_action: "c" });
    }

    const constraints = await database.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conrelid IN (
        '"ProductProject"'::regclass,
        '"SourceSnapshot"'::regclass
      )`;
    expect(constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ProductProject_displayName_check",
        "ProductProject_status_archived_check",
        "SourceSnapshot_byteSize_check",
        "SourceSnapshot_mediaType_check",
        "SourceSnapshot_contentDigest_check",
        "SourceSnapshot_storageLocator_check",
      ]),
    );

    const indexes = await database.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('ProductProject', 'SourceSnapshot')`;
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ProductProject_workspaceId_projectId_key",
        "ProductProject_workspaceId_skuIdentityKey_key",
        "ProductProject_workspaceId_status_createdAt_idx",
        "SourceSnapshot_workspaceId_projectId_capturedAt_idx",
        "SourceSnapshot_workspaceId_projectId_contentDigest_idx",
      ]),
    );

    const triggers = await database.$queryRaw<Array<{ name: string }>>`
      SELECT tgname AS name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN (
          '"ProductProject"'::regclass,
          '"SourceSnapshot"'::regclass
        )`;
    expect(triggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ProductProject_guard_change_trigger",
        "SourceSnapshot_guard_change_trigger",
      ]),
    );
  });
});

type SyntheticIdentity = {
  authIssuer: string;
  authSubject: string;
  userActorId: string;
  workspaceId: string;
  membershipId: string;
};

async function createSyntheticIdentity(label: string): Promise<SyntheticIdentity> {
  const discriminator = crypto.randomUUID();
  const identity = {
    authIssuer: `urn:image-generation-mvp:test-only:${label}`,
    authSubject: discriminator,
    userActorId: uniqueId(`${label}-actor`),
    workspaceId: uniqueId(`${label}-workspace`),
    membershipId: uniqueId(`${label}-membership`),
  };

  await database.$transaction(async (transaction) => {
    await transaction.userActor.create({
      data: {
        userActorId: identity.userActorId,
        authIssuer: identity.authIssuer,
        authSubject: identity.authSubject,
        status: "ACTIVE",
      },
    });
    await transaction.workspace.create({
      data: {
        workspaceId: identity.workspaceId,
        displayName: `Synthetic ${label} workspace`,
        status: "ACTIVE",
        createdByActorId: identity.userActorId,
      },
    });
    await transaction.membership.create({
      data: {
        membershipId: identity.membershipId,
        workspaceId: identity.workspaceId,
        userActorId: identity.userActorId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
  });

  return identity;
}

function resolverFor(identity: SyntheticIdentity): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      return {
        authIssuer: identity.authIssuer,
        authSubject: identity.authSubject,
        workspaceId: identity.workspaceId,
      };
    },
  });
}

function validSnapshotData(overrides: Record<string, unknown> = {}) {
  return {
    sourceSnapshotId: uniqueId("direct-snapshot"),
    workspaceId: P2_TEST_IDENTITY.workspaceId,
    projectId: primaryProjectId,
    sourceKind: "PRODUCT_SOURCE" as const,
    mediaType: "image/png",
    byteSize: BigInt(64),
    contentDigest: "a".repeat(64),
    storageLocator: uniqueId("test-storage-locator"),
    validationStatus: "VALID" as const,
    lifecycleStatus: "ACTIVE" as const,
    createdByActorId: P2_TEST_IDENTITY.userActorId,
    ...overrides,
  };
}

class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, RetrievedObject>();
  puts = 0;
  deletes = 0;

  async putObject(object: StoredObject): Promise<void> {
    this.puts += 1;
    this.objects.set(object.key, {
      body: Uint8Array.from(object.body),
      contentType: object.contentType,
    });
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

async function createImageFile(
  format: "png" | "jpeg" | "webp",
  fileName: string,
  mimeType: string,
) {
  const bytes = await sharp({
    create: {
      width: 3,
      height: 4,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })[format]().toBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new File([body], fileName, { type: mimeType });
}

function uniqueId(label: string): string {
  return `p2_test_${label}_${crypto.randomUUID()}`;
}
