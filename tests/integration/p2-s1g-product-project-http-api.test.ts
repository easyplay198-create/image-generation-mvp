import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { P2_AUTH_ISSUER } from "../../src/auth/authjs-adapter";
import { createAuthJsP2PrincipalResolver } from "../../src/auth/authjs-principal-resolver";
import { createP2ProductProjectHttpHandlers } from "../../src/http/p2-product-project-api";
import {
  activateP2ProductTruthRevision,
  createP2ProductTruthRevision,
} from "../../src/truth/product-truth-revision";
import {
  createDatabaseClient,
  type DatabaseClient,
  type TransactionClient,
} from "../../src/storage/database";

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

describe.sequential("P2 S1G authenticated ProductProject card API", () => {
  it("authenticates and authorizes before body parsing or business writes", async () => {
    let bodyReads = 0;
    const before = await database.productProject.count();
    const noSession = await api(null).post(poisonedRequest(() => bodyReads++));
    expect(noSession.status).toBe(401);
    expect(bodyReads).toBe(0);
    await expect(noSession.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });

    const revoked = await createIdentity("revoked", "REVOKED");
    const forbidden = await api(revoked.userActorId).post(
      poisonedRequest(() => bodyReads++),
    );
    expect(forbidden.status).toBe(403);
    expect(bodyReads).toBe(0);
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN_SCOPE" },
    });
    await expect(database.productProject.count()).resolves.toBe(before);
  });

  it("creates safe normalized projects and persistently replays one exact 201", async () => {
    const identity = await createIdentity("create-replay");
    const legacyBefore = await legacyCounts();
    let requestSequence = 0;
    const handler = api(
      identity.userActorId,
      database,
      () => `s1g-create-request-${++requestSequence}`,
    );

    const first = await handler.post(
      projectRequest(
        { displayName: "  Marketplace camera  " },
        "s1g-create-key-0001",
      ),
    );
    const firstBody = await first.json();
    const replay = await handler.post(
      projectRequest(
        { displayName: "Marketplace camera" },
        "s1g-create-key-0001",
      ),
    );
    const replayBody = await replay.json();

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replayBody).toEqual(firstBody);
    expect(firstBody).toMatchObject({
      requestId: "s1g-create-request-1",
      result: {
        displayName: "Marketplace camera",
        status: "DRAFT",
        archivedAt: null,
      },
    });
    expect(Object.keys(firstBody.result).sort()).toEqual([
      "archivedAt",
      "createdAt",
      "displayName",
      "projectId",
      "status",
    ]);

    const persisted = await database.productProject.findMany({
      where: {
        workspaceId: identity.workspaceId,
        displayName: "Marketplace camera",
      },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].projectId).toBe(firstBody.result.projectId);
    expect(persisted[0].skuIdentityKey).not.toBe(firstBody.result.projectId);
    await expect(
      database.p2IdempotencyRecord.count({
        where: {
          workspaceId: identity.workspaceId,
          operation: "product_project.create.v1",
          idempotencyKey: "s1g-create-key-0001",
        },
      }),
    ).resolves.toBe(1);

    const conflict = await handler.post(
      projectRequest(
        { displayName: "Different product" },
        "s1g-create-key-0001",
      ),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    await expect(
      database.productProject.count({
        where: { workspaceId: identity.workspaceId },
      }),
    ).resolves.toBe(1);

    const defaulted = await handler.post(
      projectRequest({ displayName: "   " }, "s1g-create-key-0002"),
    );
    expect(defaulted.status).toBe(201);
    await expect(defaulted.json()).resolves.toMatchObject({
      result: { displayName: "Untitled product", status: "DRAFT" },
    });
    expect(await legacyCounts()).toEqual(legacyBefore);
  });

  it("serializes concurrent same-key creation into one project", async () => {
    const identity = await createIdentity("concurrent");
    const handler = api(identity.userActorId);
    const body = { displayName: "Concurrent project" };
    const [first, second] = await Promise.all([
      handler.post(projectRequest(body, "s1g-concurrent-key-0001")),
      handler.post(projectRequest(body, "s1g-concurrent-key-0001")),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await first.json()).toEqual(await second.json());
    await expect(
      database.productProject.count({
        where: {
          workspaceId: identity.workspaceId,
          displayName: "Concurrent project",
        },
      }),
    ).resolves.toBe(1);
    await expect(
      database.p2IdempotencyRecord.count({
        where: {
          workspaceId: identity.workspaceId,
          operation: "product_project.create.v1",
          idempotencyKey: "s1g-concurrent-key-0001",
        },
      }),
    ).resolves.toBe(1);
  });

  it("rolls back project and idempotency state when completion fails", async () => {
    const identity = await createIdentity("rollback");
    const response = await api(
      identity.userActorId,
      failIdempotencyCompletionDatabase(database),
    ).post(
      projectRequest(
        { displayName: "Must roll back" },
        "s1g-rollback-key-0001",
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    await expect(
      database.productProject.count({
        where: {
          workspaceId: identity.workspaceId,
          displayName: "Must roll back",
        },
      }),
    ).resolves.toBe(0);
    await expect(
      database.p2IdempotencyRecord.count({
        where: { idempotencyKey: "s1g-rollback-key-0001" },
      }),
    ).resolves.toBe(0);
  });

  it("returns active truth and source counts without sensitive fields", async () => {
    const identity = await createIdentity("card");
    const handler = api(identity.userActorId, database, () => "s1g-card-request");
    const created = await handler.post(
      projectRequest({ displayName: "Product card" }, "s1g-card-key-0001"),
    );
    const projectId = (await created.json()).result.projectId as string;
    const sourceIds = await seedCardSources(identity, projectId);
    const principalResolver = authResolver(identity.userActorId);
    const draft = await createP2ProductTruthRevision(
      database,
      {
        projectId,
        expectedCurrentRevisionId: null,
        parentRevisionId: null,
        truthBody: {
          name: "Compact studio camera",
          color: "Black",
          unknownFields: ["sensor origin"],
        },
        productContinuity: "SAME_PRODUCT",
        sourceBindings: [
          {
            sourceSnapshotId: sourceIds.productSourceId,
            sourceRole: "PRODUCT_PRIMARY",
            sortOrder: 0,
          },
        ],
      },
      principalResolver,
    );
    await activateP2ProductTruthRevision(
      database,
      {
        projectId,
        truthRevisionId: draft.revision.productTruthRevisionId,
        expectedCurrentRevisionId: null,
        requestId: "s1g-card-activation-request",
        correlationId: "s1g-card-activation-correlation",
        sourceCommit: "64e1b023a5281577b58d2f5c1440c9f60459884c",
        productVersion: "0.1.0",
      },
      principalResolver,
    );

    const response = await handler.get(
      new Request(`https://example.test/api/p2/projects/${projectId}`),
      context(projectId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      requestId: "s1g-card-request",
      card: {
        project: {
          projectId,
          displayName: "Product card",
          status: "DRAFT",
        },
        activeTruthRevision: {
          productTruthRevisionId: draft.revision.productTruthRevisionId,
          revisionNumber: 1,
          truthBody: { name: "Compact studio camera", color: "Black" },
          productContinuity: "SAME_PRODUCT",
          status: "ACTIVE",
        },
        sourceSummary: {
          totalSnapshots: 5,
          activeValidProductSources: 1,
          activeValidReferences: 2,
          actionRequiredSnapshots: 1,
        },
      },
    });
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "skuIdentityKey",
      "storageLocator",
      "workspaceId",
      "createdByActorId",
      "requestFingerprint",
      "idempotencyRecordId",
      "sessionToken",
      '"ownerId"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("makes missing and cross-Workspace project reads indistinguishable", async () => {
    const owner = await createIdentity("card-owner");
    const ownerCreated = await api(owner.userActorId).post(
      projectRequest({ displayName: "Owner project" }, "s1g-owner-key-0001"),
    );
    const ownerProjectId = (await ownerCreated.json()).result.projectId as string;
    const intruder = await createIdentity("card-intruder");
    const intruderApi = api(
      intruder.userActorId,
      database,
      () => "s1g-hidden-request",
    );

    const crossWorkspace = await intruderApi.get(
      new Request("https://example.test"),
      context(ownerProjectId),
    );
    const missing = await intruderApi.get(
      new Request("https://example.test"),
      context(`p2_missing_${crypto.randomUUID()}`),
    );

    expect(crossWorkspace.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await crossWorkspace.json()).toEqual(await missing.json());
  });
});

function api(
  userActorId: string | null,
  handlerDatabase: DatabaseClient = database,
  createRequestId: () => string = () => `s1g-request-${crypto.randomUUID()}`,
) {
  return createP2ProductProjectHttpHandlers({
    database: handlerDatabase,
    principalResolver: authResolver(userActorId),
    createRequestId,
  });
}

function authResolver(userActorId: string | null) {
  return createAuthJsP2PrincipalResolver({
    database,
    readSession: async () =>
      userActorId === null ? null : { user: { id: userActorId } },
  });
}

function projectRequest(body: unknown, idempotencyKey: string): Request {
  return new Request("https://example.test/api/p2/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function poisonedRequest(onBodyRead: () => void): Request {
  return Object.freeze({
    headers: new Headers({
      "content-type": "application/json",
      "Idempotency-Key": "s1g-poison-key-0001",
    }),
    async text() {
      onBodyRead();
      throw new Error("BODY_MUST_NOT_BE_READ");
    },
  }) as unknown as Request;
}

function context(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

async function createIdentity(
  label: string,
  membershipStatus: "ACTIVE" | "REVOKED" = "ACTIVE",
) {
  const suffix = crypto.randomUUID();
  const identity = {
    userActorId: `p2_s1g_actor_${label}_${suffix}`,
    workspaceId: `p2_s1g_workspace_${label}_${suffix}`,
    membershipId: `p2_s1g_membership_${label}_${suffix}`,
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
    await transaction.workspace.create({
      data: {
        workspaceId: identity.workspaceId,
        displayName: `P2 S1G ${label}`,
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

async function seedCardSources(
  identity: Awaited<ReturnType<typeof createIdentity>>,
  projectId: string,
) {
  const productSourceId = uniqueId("source-product");
  const records = [
    sourceRecord(identity, projectId, productSourceId, "PRODUCT_SOURCE", "VALID", "ACTIVE"),
    sourceRecord(identity, projectId, uniqueId("source-product-reference"), "PRODUCT_REFERENCE", "VALID", "ACTIVE"),
    sourceRecord(identity, projectId, uniqueId("source-brand-reference"), "BRAND_REFERENCE", "VALID", "ACTIVE"),
    sourceRecord(identity, projectId, uniqueId("source-action"), "OTHER_REFERENCE", "ACTION_REQUIRED", "ACTIVE"),
    sourceRecord(identity, projectId, uniqueId("source-deleted"), "PRODUCT_SOURCE", "VALID", "DELETED"),
  ];
  await database.sourceSnapshot.createMany({ data: records });
  return { productSourceId };
}

function sourceRecord(
  identity: Awaited<ReturnType<typeof createIdentity>>,
  projectId: string,
  sourceSnapshotId: string,
  sourceKind:
    | "PRODUCT_SOURCE"
    | "PRODUCT_REFERENCE"
    | "BRAND_REFERENCE"
    | "OTHER_REFERENCE",
  validationStatus: "VALID" | "ACTION_REQUIRED",
  lifecycleStatus: "ACTIVE" | "DELETED",
) {
  return {
    sourceSnapshotId,
    workspaceId: identity.workspaceId,
    projectId,
    sourceKind,
    mediaType: "image/png",
    byteSize: BigInt(128),
    contentDigest: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
    storageLocator: `p2-test/${projectId}/${sourceSnapshotId}.png`,
    validationStatus,
    lifecycleStatus,
    createdByActorId: identity.userActorId,
  };
}

async function legacyCounts() {
  const [projects, assets, jobs] = await Promise.all([
    database.project.count(),
    database.asset.count(),
    database.job.count(),
  ]);
  return { projects, assets, jobs };
}

function failIdempotencyCompletionDatabase(
  targetDatabase: DatabaseClient,
): DatabaseClient {
  return new Proxy(targetDatabase, {
    get(target, property) {
      if (property === "$transaction") {
        return async (
          operation: (transaction: TransactionClient) => Promise<unknown>,
        ) =>
          target.$transaction(async (transaction) => {
            const wrapped = new Proxy(transaction, {
              get(transactionTarget, transactionProperty) {
                if (transactionProperty !== "p2IdempotencyRecord") {
                  const value = Reflect.get(
                    transactionTarget,
                    transactionProperty,
                    transactionTarget,
                  );
                  return typeof value === "function"
                    ? value.bind(transactionTarget)
                    : value;
                }
                return new Proxy(transactionTarget.p2IdempotencyRecord, {
                  get(delegate, delegateProperty) {
                    if (delegateProperty === "update") {
                      return async () => {
                        throw new Error("INJECTED_IDEMPOTENCY_COMPLETION_FAILURE");
                      };
                    }
                    const value = Reflect.get(delegate, delegateProperty, delegate);
                    return typeof value === "function" ? value.bind(delegate) : value;
                  },
                });
              },
            }) as TransactionClient;
            return operation(wrapped);
          });
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function uniqueId(label: string): string {
  return `p2_s1g_${label}_${crypto.randomUUID()}`;
}
