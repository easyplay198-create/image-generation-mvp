import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import { createP2ProductProject } from "../../src/projects/product-project";
import {
  activateP2ProductTruthRevision,
  createP2ProductTruthRevision,
} from "../../src/truth/product-truth-revision";
import {
  createDatabaseClient,
  type DatabaseClient,
  type TransactionClient,
} from "../../src/storage/database";
import {
  createP2TestPrincipalResolver,
  initializeP2TestAuthContext,
  P2_TEST_IDENTITY,
} from "../fixtures/p2-test-auth-context";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const SOURCE_COMMIT = "cd5a754772de95eba19b6d01e16bea38bbfa59fb";
const PRODUCT_VERSION = "0.1.0";

let database: DatabaseClient;
let primaryProjectId: string;
let primarySourceId: string;
let firstTruthRevisionId: string;
let secondTruthRevisionId: string;
let otherIdentity: SyntheticIdentity;
let otherSourceId: string;

const primaryResolver = createP2TestPrincipalResolver({ NODE_ENV: "test" });

beforeAll(async () => {
  database = createDatabaseClient(connectionString);
  await initializeP2TestAuthContext(database, { NODE_ENV: "test" });

  const primary = await createScopedProjectAndSource(
    "primary",
    primaryResolver,
    P2_TEST_IDENTITY,
  );
  primaryProjectId = primary.projectId;
  primarySourceId = primary.sourceSnapshotId;

  otherIdentity = await createSyntheticIdentity("p2-s1c-other");
  const other = await createScopedProjectAndSource(
    "other",
    resolverFor(otherIdentity),
    otherIdentity,
  );
  otherSourceId = other.sourceSnapshotId;
});

afterAll(async () => {
  await database.$disconnect();
});

describe.sequential("P2 S1C scoped product truth activation", () => {
  it("atomically creates a first DRAFT truth revision and authoritative source link", async () => {
    const draft = await createP2ProductTruthRevision(
      database,
      draftInput(primaryProjectId, primarySourceId, {
        truthBody: {
          merchantSku: "SKU-S1C-001",
          name: "Portable inflator",
          color: "Black and red",
          interfaces: ["USB-C"],
          accessories: ["Air hose"],
          parameters: { voltage: "12 V" },
          unknownFields: ["Exact battery chemistry"],
          forbiddenFacts: ["Do not claim waterproofing"],
        },
      }),
      primaryResolver,
    );
    firstTruthRevisionId = draft.revision.productTruthRevisionId;

    expect(draft.revision).toMatchObject({
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      projectId: primaryProjectId,
      revisionNumber: 1,
      productContinuity: "SAME_PRODUCT",
      status: "DRAFT",
      parentRevisionId: null,
      createdByActorId: P2_TEST_IDENTITY.userActorId,
      activatedAt: null,
      supersededAt: null,
      invalidatedAt: null,
    });
    expect(draft.sourceBindings).toEqual([
      expect.objectContaining({
        sourceSnapshotId: primarySourceId,
        sourceRole: "PRODUCT_PRIMARY",
        sortOrder: 0,
        linkStatus: "ACTIVE",
      }),
    ]);

    const persistedRevision =
      await database.productTruthRevision.findUniqueOrThrow({
        where: { productTruthRevisionId: firstTruthRevisionId },
      });
    const persistedLinks = await database.truthRevisionSourceLink.findMany({
      where: { productTruthRevisionId: firstTruthRevisionId },
    });
    const project = await database.productProject.findUniqueOrThrow({
      where: { projectId: primaryProjectId },
    });
    expect(persistedRevision.status).toBe("DRAFT");
    expect(persistedLinks).toHaveLength(1);
    expect(project.activeTruthRevisionId).toBeNull();
    await expect(
      database.p2DomainEvent.count({ where: { projectId: primaryProjectId } }),
    ).resolves.toBe(0);
    await assertNoLegacyWrites(primaryProjectId);
  });

  it("hides cross-Workspace projects and rejects cross-project source binding", async () => {
    const revisionCount = await database.productTruthRevision.count({
      where: { projectId: primaryProjectId },
    });

    await expect(
      createP2ProductTruthRevision(
        database,
        draftInput(primaryProjectId, primarySourceId),
        resolverFor(otherIdentity),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });

    await expect(
      createP2ProductTruthRevision(
        database,
        draftInput(primaryProjectId, otherSourceId),
        primaryResolver,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_REVOKED" });

    await expect(
      database.productTruthRevision.count({ where: { projectId: primaryProjectId } }),
    ).resolves.toBe(revisionCount);
  });

  it("rolls back the revision when source-link persistence fails", async () => {
    const before = await database.productTruthRevision.count({
      where: { projectId: primaryProjectId },
    });
    const injectedFailure = new Error("injected source-link failure");
    const failingDatabase = withFailingSourceLinkCreate(database, injectedFailure);

    await expect(
      createP2ProductTruthRevision(
        failingDatabase,
        draftInput(primaryProjectId, primarySourceId, {
          truthBody: { name: "Rollback candidate" },
        }),
        primaryResolver,
      ),
    ).rejects.toBe(injectedFailure);

    await expect(
      database.productTruthRevision.count({ where: { projectId: primaryProjectId } }),
    ).resolves.toBe(before);
  });

  it("explicitly activates the first revision and appends one immutable event", async () => {
    const result = await activateP2ProductTruthRevision(
      database,
      activationInput(primaryProjectId, firstTruthRevisionId, null, "first"),
      primaryResolver,
    );

    expect(result.project).toEqual({
      projectId: primaryProjectId,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      activeTruthRevisionId: firstTruthRevisionId,
    });
    expect(result.activatedRevision).toMatchObject({
      productTruthRevisionId: firstTruthRevisionId,
      status: "ACTIVE",
    });
    expect(result.previousRevision).toBeNull();

    const project = await database.productProject.findUniqueOrThrow({
      where: { projectId: primaryProjectId },
    });
    const revision = await database.productTruthRevision.findUniqueOrThrow({
      where: { productTruthRevisionId: firstTruthRevisionId },
    });
    const event = await database.p2DomainEvent.findUniqueOrThrow({
      where: { eventId: result.event.eventId },
    });
    expect(project.activeTruthRevisionId).toBe(firstTruthRevisionId);
    expect(revision).toMatchObject({
      status: "ACTIVE",
      supersededAt: null,
      invalidatedAt: null,
    });
    expect(revision.activatedAt).toBeInstanceOf(Date);
    expect(event).toMatchObject({
      eventType: "truth_revision.activated.v1",
      eventSchemaVersion: 1,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      projectId: primaryProjectId,
      actorType: "USER_ACTOR",
      actorId: P2_TEST_IDENTITY.userActorId,
      requestId: requestId("first"),
      correlationId: correlationId("first"),
      sourceCommit: SOURCE_COMMIT,
      productVersion: PRODUCT_VERSION,
      eventBody: {
        truthRevisionId: firstTruthRevisionId,
        parentRevisionId: null,
        previousActiveTruthRevisionId: null,
        projectId: primaryProjectId,
      },
    });
  });

  it("creates and activates the next revision with exact parent and concurrency binding", async () => {
    const secondDraft = await createP2ProductTruthRevision(
      database,
      draftInput(primaryProjectId, primarySourceId, {
        expectedCurrentRevisionId: firstTruthRevisionId,
        parentRevisionId: firstTruthRevisionId,
        truthBody: {
          merchantSku: "SKU-S1C-001",
          name: "Portable inflator",
          color: "Black and red",
          parameters: { voltage: "12 V", maxPressure: "150 PSI" },
        },
      }),
      primaryResolver,
    );
    secondTruthRevisionId = secondDraft.revision.productTruthRevisionId;
    expect(secondDraft.revision).toMatchObject({
      revisionNumber: 2,
      status: "DRAFT",
      parentRevisionId: firstTruthRevisionId,
    });

    const activated = await activateP2ProductTruthRevision(
      database,
      activationInput(
        primaryProjectId,
        secondTruthRevisionId,
        firstTruthRevisionId,
        "second",
      ),
      primaryResolver,
    );
    expect(activated.activatedRevision.status).toBe("ACTIVE");
    expect(activated.previousRevision).toMatchObject({
      productTruthRevisionId: firstTruthRevisionId,
      status: "SUPERSEDED",
    });

    const [first, second, project, events] = await Promise.all([
      database.productTruthRevision.findUniqueOrThrow({
        where: { productTruthRevisionId: firstTruthRevisionId },
      }),
      database.productTruthRevision.findUniqueOrThrow({
        where: { productTruthRevisionId: secondTruthRevisionId },
      }),
      database.productProject.findUniqueOrThrow({
        where: { projectId: primaryProjectId },
      }),
      database.p2DomainEvent.findMany({
        where: { projectId: primaryProjectId },
        orderBy: { occurredAt: "asc" },
      }),
    ]);
    expect(first.status).toBe("SUPERSEDED");
    expect(first.supersededAt).toBeInstanceOf(Date);
    expect(second.status).toBe("ACTIVE");
    expect(project.activeTruthRevisionId).toBe(secondTruthRevisionId);
    expect(events).toHaveLength(2);
    expect(events[1].eventBody).toEqual({
      truthRevisionId: secondTruthRevisionId,
      parentRevisionId: firstTruthRevisionId,
      previousActiveTruthRevisionId: firstTruthRevisionId,
      projectId: primaryProjectId,
    });
  });

  it("rejects stale creation, wrong parent, replay, and cross-Workspace activation without events", async () => {
    const eventCount = await database.p2DomainEvent.count({
      where: { projectId: primaryProjectId },
    });

    await expect(
      createP2ProductTruthRevision(
        database,
        draftInput(primaryProjectId, primarySourceId, {
          expectedCurrentRevisionId: firstTruthRevisionId,
          parentRevisionId: firstTruthRevisionId,
        }),
        primaryResolver,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(
      createP2ProductTruthRevision(
        database,
        draftInput(primaryProjectId, primarySourceId, {
          expectedCurrentRevisionId: secondTruthRevisionId,
          parentRevisionId: firstTruthRevisionId,
        }),
        primaryResolver,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(
      activateP2ProductTruthRevision(
        database,
        activationInput(
          primaryProjectId,
          secondTruthRevisionId,
          secondTruthRevisionId,
          "replay",
        ),
        primaryResolver,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(
      activateP2ProductTruthRevision(
        database,
        activationInput(
          primaryProjectId,
          secondTruthRevisionId,
          secondTruthRevisionId,
          "cross-workspace",
        ),
        resolverFor(otherIdentity),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });

    await expect(
      database.p2DomainEvent.count({ where: { projectId: primaryProjectId } }),
    ).resolves.toBe(eventCount);
  });

  it.each(["DIFFERENT_PRODUCT", "REVIEW_REQUIRED"] as const)(
    "persists but does not silently activate %s continuity",
    async (productContinuity) => {
      const fixture = await createScopedProjectAndSource(
        productContinuity.toLowerCase(),
        primaryResolver,
        P2_TEST_IDENTITY,
      );
      const draft = await createP2ProductTruthRevision(
        database,
        draftInput(fixture.projectId, fixture.sourceSnapshotId, {
          productContinuity,
        }),
        primaryResolver,
      );

      await expect(
        activateP2ProductTruthRevision(
          database,
          activationInput(
            fixture.projectId,
            draft.revision.productTruthRevisionId,
            null,
            productContinuity.toLowerCase(),
          ),
          primaryResolver,
        ),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      await expect(
        database.productProject.findUniqueOrThrow({
          where: { projectId: fixture.projectId },
        }),
      ).resolves.toMatchObject({ activeTruthRevisionId: null });
      await expect(
        database.p2DomainEvent.count({ where: { projectId: fixture.projectId } }),
      ).resolves.toBe(0);
    },
  );

  it("rejects non-valid and revoked sources without creating truth rows", async () => {
    const actionFixture = await createScopedProjectAndSource(
      "action-required",
      primaryResolver,
      P2_TEST_IDENTITY,
      { validationStatus: "ACTION_REQUIRED" },
    );
    const revokedFixture = await createScopedProjectAndSource(
      "revoked",
      primaryResolver,
      P2_TEST_IDENTITY,
      { lifecycleStatus: "DELETED" },
    );

    await expect(
      createP2ProductTruthRevision(
        database,
        draftInput(actionFixture.projectId, actionFixture.sourceSnapshotId),
        primaryResolver,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_ACTION_REQUIRED" });
    await expect(
      createP2ProductTruthRevision(
        database,
        draftInput(revokedFixture.projectId, revokedFixture.sourceSnapshotId),
        primaryResolver,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_REVOKED" });

    await expect(
      database.productTruthRevision.count({
        where: {
          projectId: { in: [actionFixture.projectId, revokedFixture.projectId] },
        },
      }),
    ).resolves.toBe(0);
  });

  it("enforces scoped foreign keys, active-pointer integrity, immutability, and append-only events", async () => {
    const firstLink = await database.truthRevisionSourceLink.findFirstOrThrow({
      where: { productTruthRevisionId: firstTruthRevisionId },
    });
    const firstEvent = await database.p2DomainEvent.findFirstOrThrow({
      where: { projectId: primaryProjectId },
    });

    await expect(
      database.productTruthRevision.update({
        where: { productTruthRevisionId: secondTruthRevisionId },
        data: { truthBody: { name: "Mutated truth" } },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.productTruthRevision.update({
        where: { productTruthRevisionId: secondTruthRevisionId },
        data: { status: "DRAFT", activatedAt: null },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.productTruthRevision.delete({
        where: { productTruthRevisionId: firstTruthRevisionId },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.truthRevisionSourceLink.update({
        where: { linkId: firstLink.linkId },
        data: { sortOrder: 99 },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.truthRevisionSourceLink.delete({
        where: { linkId: firstLink.linkId },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.p2DomainEvent.update({
        where: { eventId: firstEvent.eventId },
        data: { productVersion: "mutated" },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.p2DomainEvent.delete({
        where: { eventId: firstEvent.eventId },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.productProject.update({
        where: { projectId: primaryProjectId },
        data: { activeTruthRevisionId: firstTruthRevisionId },
      }),
    ).rejects.toBeTruthy();

    await expect(
      database.truthRevisionSourceLink.create({
        data: {
          linkId: uniqueId("cross-project-link"),
          workspaceId: P2_TEST_IDENTITY.workspaceId,
          projectId: primaryProjectId,
          productTruthRevisionId: secondTruthRevisionId,
          sourceSnapshotId: otherSourceId,
          sourceRole: "PRODUCT_SUPPORTING",
          sortOrder: 99,
          linkStatus: "ACTIVE",
          createdByActorId: P2_TEST_IDENTITY.userActorId,
        },
      }),
    ).rejects.toBeTruthy();

    await assertNoLegacyWrites(primaryProjectId);
  });

  it("exposes the frozen indexes, foreign keys, checks, and guards", async () => {
    const indexes = await database.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN (
          'ProductProject',
          'SourceSnapshot',
          'ProductTruthRevision',
          'TruthRevisionSourceLink',
          'P2DomainEvent'
        )`;
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "SourceSnapshot_scope_id_key",
        "ProductTruthRevision_scope_revision_key",
        "ProductTruthRevision_one_active_key",
        "TruthRevisionSourceLink_revision_source_key",
        "TruthRevisionSourceLink_revision_sort_key",
        "P2DomainEvent_scope_occurredAt_idx",
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
        AND constraint_row.conrelid IN (
          '"ProductProject"'::regclass,
          '"ProductTruthRevision"'::regclass,
          '"TruthRevisionSourceLink"'::regclass,
          '"P2DomainEvent"'::regclass
        )
      ORDER BY constraint_row.conname`;
    expect(foreignKeys.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ProductProject_scope_activeTruthRevision_fkey",
        "ProductTruthRevision_scope_project_fkey",
        "ProductTruthRevision_scope_parent_fkey",
        "ProductTruthRevision_scope_creator_fkey",
        "TruthRevisionSourceLink_scope_revision_fkey",
        "TruthRevisionSourceLink_scope_source_fkey",
        "TruthRevisionSourceLink_scope_creator_fkey",
        "P2DomainEvent_scope_project_fkey",
        "P2DomainEvent_scope_actor_fkey",
      ]),
    );
    for (const foreignKey of foreignKeys) {
      expect(foreignKey).toMatchObject({
        delete_action: "r",
        update_action: "c",
      });
    }

    const constraints = await database.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conrelid IN (
        '"ProductTruthRevision"'::regclass,
        '"TruthRevisionSourceLink"'::regclass,
        '"P2DomainEvent"'::regclass
      )`;
    expect(constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ProductTruthRevision_revisionNumber_check",
        "ProductTruthRevision_truthBody_check",
        "ProductTruthRevision_status_timestamps_check",
        "TruthRevisionSourceLink_sortOrder_check",
        "P2DomainEvent_type_check",
        "P2DomainEvent_sourceCommit_check",
        "P2DomainEvent_body_check",
      ]),
    );

    const triggers = await database.$queryRaw<Array<{ name: string }>>`
      SELECT tgname AS name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN (
          '"ProductProject"'::regclass,
          '"ProductTruthRevision"'::regclass,
          '"TruthRevisionSourceLink"'::regclass,
          '"P2DomainEvent"'::regclass
        )`;
    expect(triggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ProductProject_active_truth_integrity_trigger",
        "ProductTruthRevision_active_truth_integrity_trigger",
        "ProductTruthRevision_guard_change_trigger",
        "TruthRevisionSourceLink_guard_change_trigger",
        "P2DomainEvent_guard_change_trigger",
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

async function createScopedProjectAndSource(
  label: string,
  resolver: P2WorkspacePrincipalResolver,
  identity: Pick<SyntheticIdentity, "workspaceId" | "userActorId">,
  sourceState: {
    validationStatus?: "VALID" | "ACTION_REQUIRED";
    lifecycleStatus?: "ACTIVE" | "DELETED";
  } = {},
) {
  const project = await createP2ProductProject(
    database,
    { displayName: `P2 S1C ${label}` },
    resolver,
  );
  const sourceSnapshotId = uniqueId(`${label}-source`);
  await database.sourceSnapshot.create({
    data: {
      sourceSnapshotId,
      workspaceId: identity.workspaceId,
      projectId: project.projectId,
      sourceKind: "PRODUCT_SOURCE",
      mediaType: "image/png",
      byteSize: BigInt(128),
      contentDigest: crypto
        .randomUUID()
        .replaceAll("-", "")
        .padEnd(64, "0"),
      storageLocator: `p2-test/${identity.workspaceId}/${project.projectId}/${sourceSnapshotId}.png`,
      validationStatus: sourceState.validationStatus ?? "VALID",
      lifecycleStatus: sourceState.lifecycleStatus ?? "ACTIVE",
      createdByActorId: identity.userActorId,
    },
  });
  return { projectId: project.projectId, sourceSnapshotId };
}

function draftInput(
  projectId: string,
  sourceSnapshotId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId,
    expectedCurrentRevisionId: null,
    parentRevisionId: null,
    truthBody: { name: "Portable inflator" },
    productContinuity: "SAME_PRODUCT",
    sourceBindings: [
      { sourceSnapshotId, sourceRole: "PRODUCT_PRIMARY", sortOrder: 0 },
    ],
    ...overrides,
  };
}

function activationInput(
  projectId: string,
  truthRevisionId: string,
  expectedCurrentRevisionId: string | null,
  label: string,
) {
  return {
    projectId,
    truthRevisionId,
    expectedCurrentRevisionId,
    requestId: requestId(label),
    correlationId: correlationId(label),
    sourceCommit: SOURCE_COMMIT,
    productVersion: PRODUCT_VERSION,
  };
}

function requestId(label: string): string {
  return `p2-s1c-request-${label}`;
}

function correlationId(label: string): string {
  return `p2-s1c-correlation-${label}`;
}

async function assertNoLegacyWrites(projectId: string): Promise<void> {
  await expect(
    database.project.findUnique({ where: { id: projectId } }),
  ).resolves.toBeNull();
  await expect(
    database.asset.count({ where: { projectId } }),
  ).resolves.toBe(0);
  await expect(
    database.job.count({ where: { projectId } }),
  ).resolves.toBe(0);
}

function withFailingSourceLinkCreate(
  realDatabase: DatabaseClient,
  injectedFailure: Error,
): DatabaseClient {
  return {
    $transaction: async (
      operation: (transaction: TransactionClient) => Promise<unknown>,
    ) => realDatabase.$transaction(async (transaction) => {
      const proxy = new Proxy(transaction, {
        get(target, property, receiver) {
          if (property === "truthRevisionSourceLink") {
            return {
              ...target.truthRevisionSourceLink,
              createMany: async () => {
                throw injectedFailure;
              },
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return operation(proxy);
    }),
  } as unknown as DatabaseClient;
}

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

function uniqueId(label: string): string {
  return `p2_test_${label}_${crypto.randomUUID()}`;
}
