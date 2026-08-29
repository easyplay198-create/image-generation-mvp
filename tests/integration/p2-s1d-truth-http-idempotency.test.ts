import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import { createP2TruthHttpHandlers } from "../../src/http/p2-truth-api";
import { createP2ProductProject } from "../../src/projects/product-project";
import { createDatabaseClient, type DatabaseClient } from "../../src/storage/database";
import {
  createP2TestPrincipalResolver,
  initializeP2TestAuthContext,
  P2_TEST_IDENTITY,
} from "../fixtures/p2-test-auth-context";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for integration tests.");

const resolver = createP2TestPrincipalResolver({ NODE_ENV: "test" });
const evidence = Object.freeze({
  sourceCommit: "37981dc37f64e9f89e96bac286a89967981947e5",
  productVersion: "0.1.0",
});
let database: DatabaseClient;
let projectId: string;
let sourceSnapshotId: string;
let requestSequence = 0;

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  await initializeP2TestAuthContext(database, { NODE_ENV: "test" });
  const project = await createP2ProductProject(
    database,
    { displayName: "P2 S1D HTTP idempotency" },
    resolver,
  );
  projectId = project.projectId;
  sourceSnapshotId = `p2_test_s1d_source_${crypto.randomUUID()}`;
  await database.sourceSnapshot.create({
    data: {
      sourceSnapshotId,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      projectId,
      sourceKind: "PRODUCT_SOURCE",
      mediaType: "image/png",
      byteSize: BigInt(128),
      contentDigest: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
      storageLocator: `p2-test/${projectId}/${sourceSnapshotId}.png`,
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
      createdByActorId: P2_TEST_IDENTITY.userActorId,
    },
  });
});

afterAll(async () => {
  await database.$disconnect();
});

describe.sequential("P2 S1D truth HTTP idempotency", () => {
  it("atomically creates and exactly replays one DRAFT response", async () => {
    const api = handlers(resolver);
    const body = createBody();
    const first = await api.create(request(body, "s1d-create-key-0001"), context(projectId));
    const firstBody = await first.json();
    const replay = await api.create(request(body, "s1d-create-key-0001"), context(projectId));
    const replayBody = await replay.json();

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replayBody).toEqual(firstBody);
    const truthRevisionId = firstBody.result.revision.productTruthRevisionId as string;
    await expect(database.productTruthRevision.count({ where: { productTruthRevisionId: truthRevisionId } })).resolves.toBe(1);
    await expect(database.p2IdempotencyRecord.count({ where: { projectId, operation: "truth_revision.create.v1" } })).resolves.toBe(1);

    const read = await api.get(new Request("https://example.test"), context(projectId, truthRevisionId));
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      revision: { productTruthRevisionId: truthRevisionId, status: "DRAFT" },
    });
  });

  it("rejects a reused key with another fingerprint", async () => {
    const api = handlers(resolver);
    const response = await api.create(
      request({ ...createBody(), truthBody: { name: "Different product" } }, "s1d-create-key-0001"),
      context(projectId),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("serializes concurrent same-key requests into one business mutation", async () => {
    const fixture = await createProjectAndSource("concurrent");
    const api = handlers(resolver);
    const body = createBodyFor(fixture.sourceSnapshotId);
    const [first, second] = await Promise.all([
      api.create(request(body, "s1d-concurrent-key-0001"), context(fixture.projectId)),
      api.create(request(body, "s1d-concurrent-key-0001"), context(fixture.projectId)),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await first.json()).toEqual(await second.json());
    await expect(database.productTruthRevision.count({ where: { projectId: fixture.projectId } })).resolves.toBe(1);
    await expect(database.p2IdempotencyRecord.count({ where: { projectId: fixture.projectId } })).resolves.toBe(1);
  });

  it("creates one activation event and exactly replays the response", async () => {
    const api = handlers(resolver);
    const created = await api.create(request(createBody(), "s1d-create-key-0002"), context(projectId));
    const createdBody = await created.json();
    const truthRevisionId = createdBody.result.revision.productTruthRevisionId as string;
    const activationBody = { expectedCurrentRevisionId: null, correlationId: "s1d-correlation-0001" };
    const first = await api.activate(request(activationBody, "s1d-activate-key-0001"), context(projectId, truthRevisionId));
    const firstBody = await first.json();
    const replay = await api.activate(request(activationBody, "s1d-activate-key-0001"), context(projectId, truthRevisionId));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(firstBody);
    await expect(database.p2DomainEvent.count({ where: { projectId } })).resolves.toBe(1);
    await expect(database.p2IdempotencyRecord.count({ where: { projectId, operation: "truth_revision.activate.v1" } })).resolves.toBe(1);
  });

  it("rolls back the idempotency claim when the business operation fails", async () => {
    const response = await handlers(resolver).create(
      request({ ...createBody(), expectedCurrentRevisionId: "stale-revision" }, "s1d-failed-key-0001"),
      context(projectId),
    );
    expect(response.status).toBe(409);
    await expect(database.p2IdempotencyRecord.count({ where: { idempotencyKey: "s1d-failed-key-0001" } })).resolves.toBe(0);
  });

  it("hides a revision from another Workspace", async () => {
    const other = await createSyntheticIdentity();
    const existing = await database.productTruthRevision.findFirstOrThrow({ where: { projectId } });
    const response = await handlers(resolverFor(other)).get(
      new Request("https://example.test"),
      context(projectId, existing.productTruthRevisionId),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PROJECT_NOT_FOUND" } });

    const post = await handlers(resolverFor(other)).create(
      request(createBody(), "s1d-cross-workspace-key-0001"),
      context(projectId),
    );
    expect(post.status).toBe(404);
    await expect(post.json()).resolves.toMatchObject({ error: { code: "PROJECT_NOT_FOUND" } });
    await expect(database.p2IdempotencyRecord.count({ where: { idempotencyKey: "s1d-cross-workspace-key-0001" } })).resolves.toBe(0);
  });

  it("enforces immutable terminal response records and no legacy writes", async () => {
    const record = await database.p2IdempotencyRecord.findFirstOrThrow({ where: { projectId, status: "SUCCEEDED" } });
    await expect(database.p2IdempotencyRecord.update({
      where: { idempotencyRecordId: record.idempotencyRecordId },
      data: { responseStatus: 202 },
    })).rejects.toBeTruthy();
    await expect(database.p2IdempotencyRecord.delete({
      where: { idempotencyRecordId: record.idempotencyRecordId },
    })).rejects.toBeTruthy();
    await expect(database.project.findUnique({ where: { id: projectId } })).resolves.toBeNull();
    await expect(database.asset.count({ where: { projectId } })).resolves.toBe(0);
    await expect(database.job.count({ where: { projectId } })).resolves.toBe(0);
  });
});

function handlers(principalResolver: P2WorkspacePrincipalResolver) {
  return createP2TruthHttpHandlers({
    database,
    principalResolver,
    buildEvidence: evidence,
    createRequestId: () => `s1d-request-${++requestSequence}`,
  });
}

function createBody() {
  return createBodyFor(sourceSnapshotId);
}

function createBodyFor(sourceId: string) {
  return {
    expectedCurrentRevisionId: null,
    parentRevisionId: null,
    truthBody: { name: "Portable inflator" },
    productContinuity: "SAME_PRODUCT",
    sourceBindings: [{ sourceSnapshotId: sourceId, sourceRole: "PRODUCT_PRIMARY", sortOrder: 0 }],
  };
}

async function createProjectAndSource(label: string) {
  const project = await createP2ProductProject(database, { displayName: `P2 S1D ${label}` }, resolver);
  const sourceId = `p2_test_s1d_${label}_${crypto.randomUUID()}`;
  await database.sourceSnapshot.create({
    data: {
      sourceSnapshotId: sourceId,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      projectId: project.projectId,
      sourceKind: "PRODUCT_SOURCE",
      mediaType: "image/png",
      byteSize: BigInt(128),
      contentDigest: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
      storageLocator: `p2-test/${project.projectId}/${sourceId}.png`,
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
      createdByActorId: P2_TEST_IDENTITY.userActorId,
    },
  });
  return { projectId: project.projectId, sourceSnapshotId: sourceId };
}

function request(body: unknown, key: string): Request {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

function context(project: string, truthRevisionId?: string) {
  return { params: Promise.resolve({ projectId: project, truthRevisionId }) };
}

async function createSyntheticIdentity() {
  const id = crypto.randomUUID();
  const identity = {
    authIssuer: `urn:image-generation-mvp:test-only:s1d:${id}`,
    authSubject: id,
    userActorId: `p2_test_s1d_actor_${id}`,
    workspaceId: `p2_test_s1d_workspace_${id}`,
    membershipId: `p2_test_s1d_membership_${id}`,
  };
  await database.$transaction(async (transaction) => {
    await transaction.userActor.create({ data: { userActorId: identity.userActorId, authIssuer: identity.authIssuer, authSubject: identity.authSubject, status: "ACTIVE" } });
    await transaction.workspace.create({ data: { workspaceId: identity.workspaceId, displayName: "P2 S1D other", status: "ACTIVE", createdByActorId: identity.userActorId } });
    await transaction.membership.create({ data: { membershipId: identity.membershipId, workspaceId: identity.workspaceId, userActorId: identity.userActorId, role: "OWNER", status: "ACTIVE" } });
  });
  return identity;
}

function resolverFor(identity: Awaited<ReturnType<typeof createSyntheticIdentity>>): P2WorkspacePrincipalResolver {
  return Object.freeze({ async resolve() { return { authIssuer: identity.authIssuer, authSubject: identity.authSubject, workspaceId: identity.workspaceId }; } });
}
