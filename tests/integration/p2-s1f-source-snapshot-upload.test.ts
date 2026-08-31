import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { P2_AUTH_ISSUER } from "../../src/auth/authjs-adapter";
import { createAuthJsP2PrincipalResolver } from "../../src/auth/authjs-principal-resolver";
import { createP2SourceSnapshotHttpHandlers } from "../../src/http/p2-source-snapshot-api";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "../../src/storage/object-storage";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

let database: DatabaseClient;

beforeAll(() => {
  database = createDatabaseClient(connectionString);
});

afterAll(async () => {
  await database.$disconnect();
});

describe.sequential("P2 S1F authenticated SourceSnapshot upload", () => {
  it("persists one safe snapshot through an Auth.js principal", async () => {
    const identity = await createIdentity("success");
    const projectId = await createProject(identity, "success");
    const storage = new MemoryObjectStorage();
    const response = await api(identity.userActorId, storage).post(
      request(await uploadForm()),
      context(projectId),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      requestId: "request-integration",
      result: {
        workspaceId: identity.workspaceId,
        projectId,
        sourceKind: "PRODUCT_SOURCE",
        mediaType: "image/png",
        validationStatus: "VALID",
        lifecycleStatus: "ACTIVE",
        createdByActorId: identity.userActorId,
      },
    });
    expect(body.result).not.toHaveProperty("storageLocator");
    expect(body.result).not.toHaveProperty("body");
    const persisted = await database.sourceSnapshot.findUniqueOrThrow({
      where: { sourceSnapshotId: body.result.sourceSnapshotId },
    });
    expect(persisted).toMatchObject({
      workspaceId: identity.workspaceId,
      projectId,
      contentDigest: body.result.contentDigest,
      storageLocator: storage.puts[0].key,
    });
    expect(storage.objects.get(persisted.storageLocator)?.body).toHaveLength(
      Number(persisted.byteSize),
    );
  });

  it("hides another Workspace project without writing an object", async () => {
    const owner = await createIdentity("cross-owner");
    const projectId = await createProject(owner, "cross-project");
    const intruder = await createIdentity("cross-intruder");
    const storage = new MemoryObjectStorage();

    const response = await api(intruder.userActorId, storage).post(
      request(await uploadForm()),
      context(projectId),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND" },
    });
    expect(storage.puts).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it("fails closed for zero or inactive Membership and inactive Workspace", async () => {
    const targetOwner = await createIdentity("zero-membership-owner");
    const targetProjectId = await createProject(targetOwner, "zero-membership");
    const zeroMembership = await createIdentity("zero-membership", "NONE");
    await expect(
      database.membership.count({
        where: { userActorId: zeroMembership.userActorId },
      }),
    ).resolves.toBe(0);
    const revoked = await createIdentity("revoked-membership", "REVOKED");
    const revokedProjectId = await createProject(revoked, "revoked-membership");
    const suspended = await createIdentity("suspended-workspace");
    const suspendedProjectId = await createProject(suspended, "suspended-workspace");
    await database.workspace.update({
      where: { workspaceId: suspended.workspaceId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });

    for (const { identity, projectId } of [
      { identity: zeroMembership, projectId: targetProjectId },
      { identity: revoked, projectId: revokedProjectId },
      { identity: suspended, projectId: suspendedProjectId },
    ]) {
      const storage = new MemoryObjectStorage();
      const response = await api(identity.userActorId, storage).post(
        request(await uploadForm()),
        context(projectId),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "FORBIDDEN_SCOPE" },
      });
      expect(storage.puts).toHaveLength(0);
    }
  });

  it("rejects corrupt bytes without storage or database persistence", async () => {
    const identity = await createIdentity("corrupt");
    const projectId = await createProject(identity, "corrupt");
    const storage = new MemoryObjectStorage();
    const form = new FormData();
    form.set("sourceKind", "PRODUCT_SOURCE");
    form.set("file", new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    ], "corrupt.png", { type: "image/png" }));

    const before = await database.sourceSnapshot.count({ where: { projectId } });
    const response = await api(identity.userActorId, storage).post(
      request(form),
      context(projectId),
    );
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_FILE_TYPE" },
    });
    await expect(
      database.sourceSnapshot.count({ where: { projectId } }),
    ).resolves.toBe(before);
    expect(storage.puts).toHaveLength(0);
  });
});

function api(userActorId: string, storage: ObjectStorage) {
  return createP2SourceSnapshotHttpHandlers({
    database,
    principalResolver: createAuthJsP2PrincipalResolver({
      database,
      readSession: async () => ({ user: { id: userActorId } }),
    }),
    createObjectStorage: () => storage,
    createRequestId: () => "request-integration",
  });
}

async function createIdentity(
  label: string,
  membershipStatus: "ACTIVE" | "REVOKED" | "NONE" = "ACTIVE",
) {
  const suffix = crypto.randomUUID();
  const identity = {
    userActorId: `p2_s1f_actor_${label}_${suffix}`,
    workspaceId: `p2_s1f_workspace_${label}_${suffix}`,
    membershipId: `p2_s1f_membership_${label}_${suffix}`,
    email: `${label}-${suffix}@example.test`,
  };
  await database.$transaction(async (transaction) => {
    await transaction.userActor.create({
      data: {
        userActorId: identity.userActorId,
        authIssuer: P2_AUTH_ISSUER,
        authSubject: identity.email,
        status: "ACTIVE",
      },
    });
    if (membershipStatus === "NONE") return;
    await transaction.workspace.create({
      data: {
        workspaceId: identity.workspaceId,
        displayName: `P2 S1F ${label}`,
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
    if (membershipStatus === "REVOKED") {
      await transaction.membership.update({
        where: { membershipId: identity.membershipId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedByActorId: identity.userActorId,
        },
      });
    }
  });
  return identity;
}

async function createProject(
  identity: Awaited<ReturnType<typeof createIdentity>>,
  label: string,
): Promise<string> {
  const projectId = uniqueId(`project-${label}`);
  await database.productProject.create({
    data: {
      projectId,
      workspaceId: identity.workspaceId,
      skuIdentityKey: uniqueId(`sku-${label}`),
      displayName: `P2 S1F ${label}`,
      status: "DRAFT",
      createdByActorId: identity.userActorId,
    },
  });
  return projectId;
}

async function uploadForm(): Promise<FormData> {
  const bytes = await sharp({
    create: {
      width: 3,
      height: 4,
      channels: 4,
      background: { r: 45, g: 67, b: 89, alpha: 1 },
    },
  }).png().toBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const form = new FormData();
  form.set("sourceKind", "PRODUCT_SOURCE");
  form.set("file", new File([body], "product.png", { type: "image/png" }));
  return form;
}

function request(form: FormData): Request {
  return new Request("https://example.test/api/p2/source-snapshots", {
    method: "POST",
    body: form,
  });
}

function context(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function uniqueId(label: string): string {
  return `p2_s1f_${label}_${crypto.randomUUID()}`;
}

class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, RetrievedObject>();
  readonly puts: StoredObject[] = [];

  async putObject(object: StoredObject): Promise<void> {
    this.puts.push(object);
    this.objects.set(object.key, {
      body: object.body,
      contentType: object.contentType,
    });
  }

  async getObject(key: string): Promise<RetrievedObject> {
    const object = this.objects.get(key);
    if (!object) throw new Error("OBJECT_NOT_FOUND");
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async checkConnection(): Promise<void> {}
}
