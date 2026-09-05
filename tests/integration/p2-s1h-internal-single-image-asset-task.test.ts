import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import { createP2AssetTaskHttpHandlers } from "../../src/http/p2-asset-task-api";
import { createP2ProductProject } from "../../src/projects/product-project";
import {
  createDatabaseClient,
  type DatabaseClient,
  type TransactionClient,
} from "../../src/storage/database";
import {
  activateP2ProductTruthRevision,
  createP2ProductTruthRevision,
} from "../../src/truth/product-truth-revision";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const SOURCE_COMMIT = "e7f92ab5dc7579e5d5426dd624cb38e3552beebd";
const PRODUCT_VERSION = "0.1.0";

let database: DatabaseClient;

beforeAll(() => {
  database = createDatabaseClient(connectionString);
});

afterAll(async () => {
  await database.$disconnect();
});

describe.sequential("P2 S1H internal single-image AssetTask", () => {
  it("creates and gets one safe QUEUED task, then exactly replays its 202", async () => {
    const fixture = await createActiveTruthFixture("create-replay");
    const beforeLegacy = await legacyCounts();
    let requestSequence = 0;
    const handler = api(
      fixture.identity,
      database,
      () => `s1h-create-request-${++requestSequence}`,
    );
    const input = createBody(fixture);

    const first = await handler.post(
      assetTaskRequest(input, "s1h-create-key-0001"),
      projectContext(fixture.projectId),
    );
    const firstBody = await first.json();
    const replay = await handler.post(
      assetTaskRequest(input, "s1h-create-key-0001"),
      projectContext(fixture.projectId),
    );

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(firstBody).toMatchObject({
      requestId: "s1h-create-request-1",
      assetTask: {
        projectId: fixture.projectId,
        taskType: "INTERNAL_SINGLE_IMAGE",
        assetClass: "IMAGE",
        outputPurpose: "INTERNAL_TEST",
        truthRevisionId: fixture.truthRevisionId,
        productSourceSnapshotId: fixture.sourceSnapshotId,
        status: "QUEUED",
        generationAttemptSummary: null,
        artifactRevisionSummary: null,
      },
    });
    expect(Object.keys(firstBody.assetTask).sort()).toEqual([
      "artifactRevisionSummary",
      "assetClass",
      "assetTaskId",
      "createdAt",
      "generationAttemptSummary",
      "outputPurpose",
      "productSourceSnapshotId",
      "projectId",
      "status",
      "taskType",
      "truthRevisionId",
    ]);
    for (const forbidden of [
      "workspaceId",
      "createdByActorId",
      "requestFingerprint",
      "idempotencyRecordId",
      "storageLocator",
    ]) {
      expect(JSON.stringify(firstBody)).not.toContain(forbidden);
    }

    const assetTaskId = firstBody.assetTask.assetTaskId as string;
    const getResponse = await handler.get(
      new Request("https://example.test"),
      taskContext(fixture.projectId, assetTaskId),
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      assetTask: firstBody.assetTask,
    });

    await expect(
      database.assetTask.count({
        where: {
          workspaceId: fixture.identity.workspaceId,
          projectId: fixture.projectId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      database.p2IdempotencyRecord.count({
        where: {
          workspaceId: fixture.identity.workspaceId,
          operation: "asset_task.create.v1",
          idempotencyKey: "s1h-create-key-0001",
          status: "SUCCEEDED",
        },
      }),
    ).resolves.toBe(1);

    const conflict = await handler.post(
      assetTaskRequest(
        { ...input, truthRevisionId: uniqueId("different-truth") },
        "s1h-create-key-0001",
      ),
      projectContext(fixture.projectId),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    await expect(
      database.assetTask.count({ where: { projectId: fixture.projectId } }),
    ).resolves.toBe(1);
    expect(await legacyCounts()).toEqual(beforeLegacy);
  });

  it("serializes concurrent same-key requests into one task and one record", async () => {
    const fixture = await createActiveTruthFixture("concurrent");
    let requestSequence = 0;
    const handler = api(
      fixture.identity,
      database,
      () => `s1h-concurrent-request-${++requestSequence}`,
    );
    const input = createBody(fixture);
    const [first, second] = await Promise.all([
      handler.post(
        assetTaskRequest(input, "s1h-concurrent-key-0001"),
        projectContext(fixture.projectId),
      ),
      handler.post(
        assetTaskRequest(input, "s1h-concurrent-key-0001"),
        projectContext(fixture.projectId),
      ),
    ]);

    expect([first.status, second.status]).toEqual([202, 202]);
    expect(await first.json()).toEqual(await second.json());
    await expect(
      database.assetTask.count({ where: { projectId: fixture.projectId } }),
    ).resolves.toBe(1);
    await expect(
      database.p2IdempotencyRecord.count({
        where: {
          workspaceId: fixture.identity.workspaceId,
          operation: "asset_task.create.v1",
          idempotencyKey: "s1h-concurrent-key-0001",
        },
      }),
    ).resolves.toBe(1);
  });

  it("isolates creation and exact replay of the same key in two valid Workspaces", async () => {
    const fixtureA = await createActiveTruthFixture("same-key-a");
    const fixtureB = await createActiveTruthFixture("same-key-b");
    const handlerA = api(fixtureA.identity);
    const handlerB = api(fixtureB.identity);
    const sharedKey = uniqueId("shared-key");
    const inputA = createBody(fixtureA);
    const inputB = createBody(fixtureB);

    const firstA = await handlerA.post(
      assetTaskRequest(inputA, sharedKey),
      projectContext(fixtureA.projectId),
    );
    const firstB = await handlerB.post(
      assetTaskRequest(inputB, sharedKey),
      projectContext(fixtureB.projectId),
    );
    expect(firstA.status).toBe(202);
    expect(firstB.status).toBe(202);
    const firstBodyA = await firstA.json();
    const firstBodyB = await firstB.json();
    expect(firstBodyA.assetTask.assetTaskId).not.toBe(
      firstBodyB.assetTask.assetTaskId,
    );
    expect(firstBodyA.requestId).not.toBe(firstBodyB.requestId);

    const replayA = await handlerA.post(
      assetTaskRequest(inputA, sharedKey),
      projectContext(fixtureA.projectId),
    );
    const replayB = await handlerB.post(
      assetTaskRequest(inputB, sharedKey),
      projectContext(fixtureB.projectId),
    );
    expect(replayA.status).toBe(202);
    expect(replayB.status).toBe(202);
    await expect(replayA.json()).resolves.toEqual(firstBodyA);
    await expect(replayB.json()).resolves.toEqual(firstBodyB);

    for (const { fixture, body } of [
      { fixture: fixtureA, body: firstBodyA },
      { fixture: fixtureB, body: firstBodyB },
    ]) {
      expect(body.assetTask).toMatchObject({
        projectId: fixture.projectId,
        truthRevisionId: fixture.truthRevisionId,
        productSourceSnapshotId: fixture.sourceSnapshotId,
        status: "QUEUED",
      });
      await expect(
        database.assetTask.count({
          where: {
            workspaceId: fixture.identity.workspaceId,
            projectId: fixture.projectId,
          },
        }),
      ).resolves.toBe(1);
      const records = await database.p2IdempotencyRecord.findMany({
        where: {
          workspaceId: fixture.identity.workspaceId,
          operation: "asset_task.create.v1",
          idempotencyKey: sharedKey,
        },
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        workspaceId: fixture.identity.workspaceId,
        projectId: fixture.projectId,
        actorId: fixture.identity.userActorId,
        status: "SUCCEEDED",
        responseStatus: 202,
      });
      expect(records[0].responseBody).toEqual(body);
    }

    await expect(
      database.assetTask.count({
        where: {
          OR: [fixtureA, fixtureB].map((fixture) => ({
            workspaceId: fixture.identity.workspaceId,
            projectId: fixture.projectId,
          })),
        },
      }),
    ).resolves.toBe(2);
    await expect(
      database.p2IdempotencyRecord.count({
        where: {
          workspaceId: {
            in: [fixtureA.identity.workspaceId, fixtureB.identity.workspaceId],
          },
          operation: "asset_task.create.v1",
          idempotencyKey: sharedKey,
        },
      }),
    ).resolves.toBe(2);
  });

  it("rolls back both task and idempotency state when completion fails", async () => {
    const fixture = await createActiveTruthFixture("rollback");
    const response = await api(
      fixture.identity,
      failIdempotencyCompletionDatabase(database),
    ).post(
      assetTaskRequest(createBody(fixture), "s1h-rollback-key-0001"),
      projectContext(fixture.projectId),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    await expect(
      database.assetTask.count({ where: { projectId: fixture.projectId } }),
    ).resolves.toBe(0);
    await expect(
      database.p2IdempotencyRecord.count({
        where: { idempotencyKey: "s1h-rollback-key-0001" },
      }),
    ).resolves.toBe(0);
  });

  it("rejects non-current or unlinked dependencies without partial state", async () => {
    const fixture = await createActiveTruthFixture("dependencies");
    const handler = api(fixture.identity);
    const unlinkedSourceId = await createSource(
      fixture.identity,
      fixture.projectId,
      "unlinked",
    );
    const unlinked = await handler.post(
      assetTaskRequest(
        {
          ...createBody(fixture),
          productSourceSnapshotId: unlinkedSourceId,
        },
        "s1h-unlinked-key-0001",
      ),
      projectContext(fixture.projectId),
    );
    expect(unlinked.status).toBe(404);

    const draft = await createP2ProductTruthRevision(
      database,
      {
        projectId: fixture.projectId,
        expectedCurrentRevisionId: fixture.truthRevisionId,
        parentRevisionId: fixture.truthRevisionId,
        truthBody: { name: "Not yet active" },
        productContinuity: "SAME_PRODUCT",
        sourceBindings: [
          {
            sourceSnapshotId: fixture.sourceSnapshotId,
            sourceRole: "PRODUCT_PRIMARY",
            sortOrder: 0,
          },
        ],
      },
      resolverFor(fixture.identity),
    );
    const nonCurrent = await handler.post(
      assetTaskRequest(
        {
          ...createBody(fixture),
          truthRevisionId: draft.revision.productTruthRevisionId,
        },
        "s1h-noncurrent-key-0001",
      ),
      projectContext(fixture.projectId),
    );
    expect(nonCurrent.status).toBe(409);
    await expect(nonCurrent.json()).resolves.toMatchObject({
      error: { code: "ASSET_TASK_DEPENDENCY_CONFLICT" },
    });

    await expect(
      database.assetTask.count({ where: { projectId: fixture.projectId } }),
    ).resolves.toBe(0);
    await expect(
      database.p2IdempotencyRecord.count({
        where: {
          operation: "asset_task.create.v1",
          idempotencyKey: {
            in: ["s1h-unlinked-key-0001", "s1h-noncurrent-key-0001"],
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it("makes cross-Workspace and nonexistent task access indistinguishable", async () => {
    const ownerFixture = await createActiveTruthFixture("scope-owner");
    const ownerHandler = api(ownerFixture.identity);
    const created = await ownerHandler.post(
      assetTaskRequest(createBody(ownerFixture), "s1h-scope-owner-key-0001"),
      projectContext(ownerFixture.projectId),
    );
    const assetTaskId = (await created.json()).assetTask.assetTaskId as string;
    const intruder = await createIdentity("scope-intruder");
    const intruderHandler = api(
      intruder,
      database,
      () => "s1h-hidden-request",
    );

    const crossCreate = await intruderHandler.post(
      assetTaskRequest(createBody(ownerFixture), "s1h-cross-key-0001"),
      projectContext(ownerFixture.projectId),
    );
    expect(crossCreate.status).toBe(404);
    await expect(
      database.p2IdempotencyRecord.count({
        where: { idempotencyKey: "s1h-cross-key-0001" },
      }),
    ).resolves.toBe(0);

    const crossRead = await intruderHandler.get(
      new Request("https://example.test"),
      taskContext(ownerFixture.projectId, assetTaskId),
    );
    const missingRead = await intruderHandler.get(
      new Request("https://example.test"),
      taskContext(ownerFixture.projectId, uniqueId("missing-task")),
    );
    expect(crossRead.status).toBe(404);
    expect(missingRead.status).toBe(404);
    expect(await crossRead.json()).toEqual(await missingRead.json());
  });

  it("rejects four illegal dependency INSERTs directly in PostgreSQL", async () => {
    const fixtureA = await createActiveTruthFixture("sql-dependencies-a");
    const fixtureB = await createActiveTruthFixture("sql-dependencies-b");
    const unlinkedSourceId = await createSource(
      fixtureA.identity,
      fixtureA.projectId,
      "sql-unlinked",
    );
    const draft = await createP2ProductTruthRevision(
      database,
      {
        projectId: fixtureA.projectId,
        expectedCurrentRevisionId: fixtureA.truthRevisionId,
        parentRevisionId: fixtureA.truthRevisionId,
        truthBody: { name: "P2 S1H SQL draft dependency" },
        productContinuity: "SAME_PRODUCT",
        sourceBindings: [
          {
            sourceSnapshotId: fixtureA.sourceSnapshotId,
            sourceRole: "PRODUCT_PRIMARY",
            sortOrder: 0,
          },
        ],
      },
      resolverFor(fixtureA.identity),
    );
    expect(draft.revision.status).toBe("DRAFT");
    expect(draft.sourceBindings).toEqual([
      expect.objectContaining({
        sourceSnapshotId: fixtureA.sourceSnapshotId,
        linkStatus: "ACTIVE",
      }),
    ]);
    await expect(
      database.truthRevisionSourceLink.count({
        where: {
          workspaceId: fixtureA.identity.workspaceId,
          projectId: fixtureA.projectId,
          productTruthRevisionId: fixtureA.truthRevisionId,
          sourceSnapshotId: unlinkedSourceId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      database.membership.count({
        where: {
          workspaceId: fixtureA.identity.workspaceId,
          userActorId: fixtureB.identity.userActorId,
        },
      }),
    ).resolves.toBe(0);

    const idempotencyScope = {
      workspaceId: fixtureA.identity.workspaceId,
      operation: "asset_task.create.v1",
    };
    const recordsBefore = await database.p2IdempotencyRecord.count({
      where: idempotencyScope,
    });
    const dependencyError = {
      code: "23514",
      message:
        "AssetTask requires the active truth revision and an active valid product source",
    };
    const cases = [
      {
        label: "unlinked-source",
        truthRevisionId: fixtureA.truthRevisionId,
        sourceSnapshotId: unlinkedSourceId,
        createdByActorId: fixtureA.identity.userActorId,
        expectedError: dependencyError,
      },
      {
        label: "draft-revision",
        truthRevisionId: draft.revision.productTruthRevisionId,
        sourceSnapshotId: fixtureA.sourceSnapshotId,
        createdByActorId: fixtureA.identity.userActorId,
        expectedError: dependencyError,
      },
      {
        label: "cross-workspace-source",
        truthRevisionId: fixtureA.truthRevisionId,
        sourceSnapshotId: fixtureB.sourceSnapshotId,
        createdByActorId: fixtureA.identity.userActorId,
        expectedError: dependencyError,
      },
      {
        label: "cross-workspace-creator",
        truthRevisionId: fixtureA.truthRevisionId,
        sourceSnapshotId: fixtureA.sourceSnapshotId,
        createdByActorId: fixtureB.identity.userActorId,
        expectedError: {
          code: "23503",
          constraint: "AssetTask_scope_creator_fkey",
        },
      },
    ];
    const client = new Client({ connectionString });
    try {
      await client.connect();
      for (const testCase of cases) {
        const assetTaskId = uniqueId(testCase.label);
        let insertError: unknown;
        await client.query("BEGIN");
        try {
          await client.query(
            `INSERT INTO "AssetTask" (
              "assetTaskId",
              "workspaceId",
              "projectId",
              "taskType",
              "assetClass",
              "outputPurpose",
              "truthRevisionId",
              "productSourceSnapshotId",
              "status",
              "createdByActorId"
            ) VALUES (
              $1,
              $2,
              $3,
              'INTERNAL_SINGLE_IMAGE',
              'IMAGE',
              'INTERNAL_TEST',
              $4,
              $5,
              'QUEUED',
              $6
            )`,
            [
              assetTaskId,
              fixtureA.identity.workspaceId,
              fixtureA.projectId,
              testCase.truthRevisionId,
              testCase.sourceSnapshotId,
              testCase.createdByActorId,
            ],
          );
        } catch (error) {
          insertError = error;
        } finally {
          await client.query("ROLLBACK");
        }
        await expect(
          database.assetTask.count({
            where: {
              workspaceId: fixtureA.identity.workspaceId,
              projectId: fixtureA.projectId,
              assetTaskId,
            },
          }),
        ).resolves.toBe(0);
        await expect(
          database.p2IdempotencyRecord.count({ where: idempotencyScope }),
        ).resolves.toBe(recordsBefore);
        expect(insertError).toMatchObject(testCase.expectedError);
      }
    } finally {
      await client.end();
    }
  });

  it("enforces frozen table shape, dependency constraints, and task immutability", async () => {
    const fixture = await createActiveTruthFixture("database-contract");
    const response = await api(fixture.identity).post(
      assetTaskRequest(createBody(fixture), "s1h-contract-key-0001"),
      projectContext(fixture.projectId),
    );
    const assetTaskId = (await response.json()).assetTask.assetTaskId as string;

    await expect(
      database.assetTask.update({
        where: { assetTaskId },
        data: { status: "QUEUED" },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.assetTask.delete({ where: { assetTaskId } }),
    ).rejects.toBeTruthy();

    const enums = await database.$queryRaw<Array<{ name: string; labels: string[] }>>`
      SELECT
        enum_type.typname AS name,
        array_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder)::text[] AS labels
      FROM pg_type AS enum_type
      INNER JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
      WHERE enum_type.typname IN (
        'AssetTaskType',
        'AssetClass',
        'AssetTaskOutputPurpose',
        'AssetTaskStatus'
      )
      GROUP BY enum_type.typname
      ORDER BY enum_type.typname`;
    expect(enums).toEqual([
      { name: "AssetClass", labels: ["IMAGE"] },
      { name: "AssetTaskOutputPurpose", labels: ["INTERNAL_TEST"] },
      { name: "AssetTaskStatus", labels: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "HARD_BLOCKED"] },
      { name: "AssetTaskType", labels: ["INTERNAL_SINGLE_IMAGE"] },
    ]);

    const indexes = await database.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'AssetTask'`;
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "AssetTask_pkey",
        "AssetTask_scope_id_key",
        "AssetTask_scope_status_createdAt_idx",
        "AssetTask_scope_truthRevision_idx",
        "AssetTask_scope_productSource_idx",
      ]),
    );

    const foreignKeys = await database.$queryRaw<
      Array<{ name: string; delete_action: string; update_action: string }>
    >`SELECT
        constraint_row.conname AS name,
        constraint_row.confdeltype::text AS delete_action,
        constraint_row.confupdtype::text AS update_action
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.contype = 'f'
        AND constraint_row.conrelid = '"AssetTask"'::regclass
      ORDER BY constraint_row.conname`;
    expect(foreignKeys.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "AssetTask_scope_project_fkey",
        "AssetTask_scope_truthRevision_fkey",
        "AssetTask_scope_productSource_fkey",
        "AssetTask_scope_creator_fkey",
      ]),
    );
    for (const foreignKey of foreignKeys) {
      expect(foreignKey).toMatchObject({
        delete_action: "r",
        update_action: "c",
      });
    }

    const databaseObjects = await database.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conrelid = '"AssetTask"'::regclass
      UNION ALL
      SELECT tgname AS name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid = '"AssetTask"'::regclass`;
    expect(databaseObjects.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "AssetTask_identifiers_check",
        "AssetTask_dependency_integrity_trigger",
        "AssetTask_guard_change_trigger",
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

type ActiveTruthFixture = {
  identity: SyntheticIdentity;
  projectId: string;
  sourceSnapshotId: string;
  truthRevisionId: string;
};

function api(
  identity: SyntheticIdentity,
  handlerDatabase: DatabaseClient = database,
  createRequestId: () => string = () => `s1h-request-${crypto.randomUUID()}`,
) {
  return createP2AssetTaskHttpHandlers({
    database: handlerDatabase,
    principalResolver: resolverFor(identity),
    createRequestId,
  });
}

function createBody(fixture: ActiveTruthFixture) {
  return {
    taskType: "INTERNAL_SINGLE_IMAGE",
    assetClass: "IMAGE",
    outputPurpose: "INTERNAL_TEST",
    truthRevisionId: fixture.truthRevisionId,
    productSourceSnapshotId: fixture.sourceSnapshotId,
  };
}

function assetTaskRequest(body: unknown, idempotencyKey: string): Request {
  return new Request("https://example.test/api/p2/projects/project/asset-tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function projectContext(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function taskContext(projectId: string, assetTaskId: string) {
  return { params: Promise.resolve({ projectId, assetTaskId }) };
}

async function createActiveTruthFixture(label: string): Promise<ActiveTruthFixture> {
  const identity = await createIdentity(label);
  const resolver = resolverFor(identity);
  const project = await createP2ProductProject(
    database,
    { displayName: `P2 S1H ${label}` },
    resolver,
  );
  const sourceSnapshotId = await createSource(
    identity,
    project.projectId,
    "primary",
  );
  const draft = await createP2ProductTruthRevision(
    database,
    {
      projectId: project.projectId,
      expectedCurrentRevisionId: null,
      parentRevisionId: null,
      truthBody: { name: `P2 S1H ${label} product` },
      productContinuity: "SAME_PRODUCT",
      sourceBindings: [
        {
          sourceSnapshotId,
          sourceRole: "PRODUCT_PRIMARY",
          sortOrder: 0,
        },
      ],
    },
    resolver,
  );
  const truthRevisionId = draft.revision.productTruthRevisionId;
  await activateP2ProductTruthRevision(
    database,
    {
      projectId: project.projectId,
      truthRevisionId,
      expectedCurrentRevisionId: null,
      requestId: `s1h-activate-request-${label}`,
      correlationId: `s1h-activate-correlation-${label}`,
      sourceCommit: SOURCE_COMMIT,
      productVersion: PRODUCT_VERSION,
    },
    resolver,
  );
  return {
    identity,
    projectId: project.projectId,
    sourceSnapshotId,
    truthRevisionId,
  };
}

async function createSource(
  identity: SyntheticIdentity,
  projectId: string,
  label: string,
): Promise<string> {
  const sourceSnapshotId = uniqueId(`${label}-source`);
  await database.sourceSnapshot.create({
    data: {
      sourceSnapshotId,
      workspaceId: identity.workspaceId,
      projectId,
      sourceKind: "PRODUCT_SOURCE",
      mediaType: "image/png",
      byteSize: BigInt(128),
      contentDigest: crypto
        .randomUUID()
        .replaceAll("-", "")
        .padEnd(64, "0"),
      storageLocator: `p2-test/${identity.workspaceId}/${projectId}/${sourceSnapshotId}.png`,
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
      createdByActorId: identity.userActorId,
    },
  });
  return sourceSnapshotId;
}

async function createIdentity(label: string): Promise<SyntheticIdentity> {
  const discriminator = crypto.randomUUID();
  const identity = {
    authIssuer: `urn:image-generation-mvp:test-only:p2-s1h:${label}`,
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
        displayName: `P2 S1H ${label}`,
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

async function legacyCounts() {
  const [projects, assets, jobs, generationResults] = await Promise.all([
    database.project.count(),
    database.asset.count(),
    database.job.count(),
    database.generationResult.count(),
  ]);
  return { projects, assets, jobs, generationResults };
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
                        throw new Error(
                          "INJECTED_IDEMPOTENCY_COMPLETION_FAILURE",
                        );
                      };
                    }
                    const value = Reflect.get(
                      delegate,
                      delegateProperty,
                      delegate,
                    );
                    return typeof value === "function"
                      ? value.bind(delegate)
                      : value;
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
  return `p2_s1h_${label}_${crypto.randomUUID()}`;
}
