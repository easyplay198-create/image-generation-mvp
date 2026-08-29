import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  withP2WorkspaceMembershipScope,
  type P2WorkspacePrincipalResolver,
} from "../../src/auth/workspace-membership-scope";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";
import {
  initializeP2TestAuthContext,
  P2_TEST_IDENTITY,
  P2TestFixtureError,
} from "../fixtures/p2-test-auth-context";

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

describe.sequential("P2 S1A identity and workspace isolation", () => {
  it("atomically creates one deterministic active OWNER context and remains idempotent", async () => {
    const first = await initializeP2TestAuthContext(database, {
      NODE_ENV: "test",
      MVP_DEMO_USER_ID: "ignored-legacy-demo-owner",
    });
    const second = await initializeP2TestAuthContext(database, {
      NODE_ENV: "test",
      MVP_DEMO_USER_ID: "a-different-ignored-owner",
    });

    expect(second).toEqual(first);
    expect(first).toEqual({
      userActorId: P2_TEST_IDENTITY.userActorId,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      membershipId: P2_TEST_IDENTITY.membershipId,
      role: "OWNER",
    });
    await expect(
      database.userActor.count({
        where: { userActorId: P2_TEST_IDENTITY.userActorId },
      }),
    ).resolves.toBe(1);
    await expect(
      database.workspace.count({
        where: { workspaceId: P2_TEST_IDENTITY.workspaceId },
      }),
    ).resolves.toBe(1);
    await expect(
      database.membership.count({
        where: {
          workspaceId: P2_TEST_IDENTITY.workspaceId,
          status: "ACTIVE",
        },
      }),
    ).resolves.toBe(1);
  });

  it("resolves only an exact current Workspace membership", async () => {
    const identity = await createSyntheticIdentity("scope");
    await expect(
      resolveContextForTest(resolverFor(identity)),
    ).resolves.toEqual({
      userActorId: identity.userActorId,
      workspaceId: identity.workspaceId,
      membershipId: identity.membershipId,
      role: "OWNER",
    });

    const otherWorkspaceId = uniqueId("cross-workspace");
    await database.workspace.create({
      data: {
        workspaceId: otherWorkspaceId,
        displayName: "Synthetic isolated cross-workspace target",
        status: "ACTIVE",
        createdByActorId: identity.userActorId,
      },
    });

    await expect(
      resolveContextForTest(resolverFor(identity, otherWorkspaceId)),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE", status: 403 });
  });

  it("holds authorization rows until the scoped operation completes", async () => {
    const identity = await createSyntheticIdentity("locked-operation");
    const revocationDatabase = createDatabaseClient(connectionString);
    let releaseOperation = () => {};
    let markOperationStarted = () => {};
    const operationStarted = new Promise<void>((resolve) => {
      markOperationStarted = resolve;
    });
    const operationRelease = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });
    let revocationSettled = false;

    const scopedOperation = withP2WorkspaceMembershipScope(
      database,
      async (_transaction, context) => {
        markOperationStarted();
        await operationRelease;
        return context;
      },
      resolverFor(identity),
    );

    await operationStarted;
    const revocation = revocationDatabase.membership
      .update({
        where: { membershipId: identity.membershipId },
        data: { status: "REVOKED", revokedAt: new Date() },
      })
      .finally(() => {
        revocationSettled = true;
      });

    try {
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(revocationSettled).toBe(false);

      releaseOperation();
      await expect(scopedOperation).resolves.toMatchObject({
        membershipId: identity.membershipId,
      });
      await expect(revocation).resolves.toMatchObject({ status: "REVOKED" });
      await expect(
        resolveContextForTest(resolverFor(identity)),
      ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE", status: 403 });
    } finally {
      releaseOperation();
      await Promise.allSettled([scopedOperation, revocation]);
      await revocationDatabase.$disconnect();
    }
  });

  it("rejects inactive actor, workspace and membership state immediately", async () => {
    const disabled = await createSyntheticIdentity("disabled");
    await database.userActor.update({
      where: { userActorId: disabled.userActorId },
      data: { status: "DISABLED", disabledAt: new Date() },
    });
    await expect(
      resolveContextForTest(resolverFor(disabled)),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE", status: 403 });

    const suspended = await createSyntheticIdentity("suspended");
    await database.workspace.update({
      where: { workspaceId: suspended.workspaceId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await expect(
      resolveContextForTest(resolverFor(suspended)),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE" });

    const archived = await createSyntheticIdentity("archived");
    await database.workspace.update({
      where: { workspaceId: archived.workspaceId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await expect(
      resolveContextForTest(resolverFor(archived)),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE" });

    const revoked = await createSyntheticIdentity("revoked");
    await database.membership.update({
      where: { membershipId: revoked.membershipId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedByActorId: revoked.userActorId,
      },
    });
    await expect(
      resolveContextForTest(resolverFor(revoked)),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE" });
  });

  it("enforces unique principals, membership pairs and one active member per Workspace", async () => {
    const identity = await createSyntheticIdentity("unique");

    await expect(
      database.userActor.create({
        data: {
          userActorId: uniqueId("duplicate-principal"),
          authIssuer: identity.authIssuer,
          authSubject: identity.authSubject,
          status: "ACTIVE",
        },
      }),
    ).rejects.toBeTruthy();

    await expect(
      database.membership.create({
        data: {
          membershipId: uniqueId("duplicate-pair"),
          workspaceId: identity.workspaceId,
          userActorId: identity.userActorId,
          role: "OWNER",
          status: "ACTIVE",
        },
      }),
    ).rejects.toBeTruthy();

    const secondActor = await createSyntheticActor("second-active-member");
    await expect(
      database.membership.create({
        data: {
          membershipId: uniqueId("second-active-member"),
          workspaceId: identity.workspaceId,
          userActorId: secondActor.userActorId,
          role: "OWNER",
          status: "ACTIVE",
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.membership.count({
        where: { workspaceId: identity.workspaceId, status: "ACTIVE" },
      }),
    ).resolves.toBe(1);
  });

  it("enforces state checks, immutable identity and retained Membership history", async () => {
    await expect(
      database.userActor.create({
        data: {
          userActorId: uniqueId("invalid-active-actor"),
          authIssuer: uniqueId("issuer"),
          authSubject: uniqueId("subject"),
          status: "ACTIVE",
          disabledAt: new Date(),
        },
      }),
    ).rejects.toBeTruthy();

    const invalidWorkspaceActor = await createSyntheticActor(
      "invalid-active-workspace",
    );
    await expect(
      database.workspace.create({
        data: {
          workspaceId: uniqueId("invalid-active-workspace"),
          displayName: "Invalid active workspace",
          status: "ACTIVE",
          createdByActorId: invalidWorkspaceActor.userActorId,
          suspendedAt: new Date(),
        },
      }),
    ).rejects.toBeTruthy();

    const invalidMembershipActor = await createSyntheticActor(
      "invalid-active-membership",
    );
    const invalidMembershipWorkspaceId = uniqueId(
      "invalid-active-membership-workspace",
    );
    await database.workspace.create({
      data: {
        workspaceId: invalidMembershipWorkspaceId,
        displayName: "Invalid active membership workspace",
        status: "ACTIVE",
        createdByActorId: invalidMembershipActor.userActorId,
      },
    });
    await expect(
      database.membership.create({
        data: {
          membershipId: uniqueId("invalid-active-membership"),
          workspaceId: invalidMembershipWorkspaceId,
          userActorId: invalidMembershipActor.userActorId,
          role: "OWNER",
          status: "ACTIVE",
          revokedAt: new Date(),
        },
      }),
    ).rejects.toBeTruthy();

    const identity = await createSyntheticIdentity("immutable");
    await expect(
      database.userActor.update({
        where: { userActorId: identity.userActorId },
        data: { authSubject: uniqueId("changed-subject") },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.workspace.update({
        where: { workspaceId: identity.workspaceId },
        data: { createdByActorId: (await createSyntheticActor("other-creator")).userActorId },
      }),
    ).rejects.toBeTruthy();

    const otherWorkspaceId = uniqueId("immutable-target-workspace");
    await database.workspace.create({
      data: {
        workspaceId: otherWorkspaceId,
        displayName: "Synthetic immutable target",
        status: "ACTIVE",
        createdByActorId: identity.userActorId,
      },
    });
    await expect(
      database.membership.update({
        where: { membershipId: identity.membershipId },
        data: { workspaceId: otherWorkspaceId },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.membership.delete({
        where: { membershipId: identity.membershipId },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.workspace.delete({
        where: { workspaceId: identity.workspaceId },
      }),
    ).rejects.toBeTruthy();
    await expect(
      database.userActor.delete({
        where: { userActorId: identity.userActorId },
      }),
    ).rejects.toBeTruthy();

    const revoked = await createSyntheticIdentity("terminal-revoked");
    await database.membership.update({
      where: { membershipId: revoked.membershipId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await expect(
      database.membership.update({
        where: { membershipId: revoked.membershipId },
        data: {
          status: "ACTIVE",
          revokedAt: null,
          revokedByActorId: null,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("rolls back all new identity records when Membership creation fails", async () => {
    const actor = await syntheticActorInput("rollback");
    const workspaceId = uniqueId("rollback-workspace");

    await expect(
      database.$transaction(async (transaction) => {
        await transaction.userActor.create({ data: actor });
        await transaction.workspace.create({
          data: {
            workspaceId,
            displayName: "Must roll back",
            status: "ACTIVE",
            createdByActorId: actor.userActorId,
          },
        });
        await transaction.membership.create({
          data: {
            membershipId: uniqueId("rollback-membership"),
            workspaceId: P2_TEST_IDENTITY.workspaceId,
            userActorId: actor.userActorId,
            role: "OWNER",
            status: "ACTIVE",
          },
        });
      }),
    ).rejects.toBeTruthy();

    await expect(
      database.userActor.findUnique({ where: { userActorId: actor.userActorId } }),
    ).resolves.toBeNull();
    await expect(
      database.workspace.findUnique({ where: { workspaceId } }),
    ).resolves.toBeNull();
  });

  it("exposes the frozen partial index, checks, foreign-key actions and triggers", async () => {
    const indexes = await database.$queryRaw<
      Array<{ indexdef: string; indexname: string }>
    >`SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('UserActor', 'Workspace', 'Membership')`;
    const activeIndex = indexes.find(
      (index) => index.indexname === "Membership_one_active_per_workspace_key",
    );
    expect(activeIndex?.indexdef).toContain("UNIQUE INDEX");
    expect(activeIndex?.indexdef).toContain("WHERE");
    expect(activeIndex?.indexdef).toContain("'ACTIVE'");

    const constraints = await database.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conrelid IN (
        '"UserActor"'::regclass,
        '"Workspace"'::regclass,
        '"Membership"'::regclass
      )`;
    const constraintNames = constraints.map((constraint) => constraint.name);
    expect(constraintNames).toEqual(
      expect.arrayContaining([
        "UserActor_status_disabled_check",
        "Workspace_status_timestamps_check",
        "Membership_status_revocation_check",
      ]),
    );

    const foreignKeys = await database.$queryRaw<
      Array<{ delete_action: string; update_action: string }>
    >`SELECT confdeltype::text AS delete_action, confupdtype::text AS update_action
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid IN ('"Workspace"'::regclass, '"Membership"'::regclass)`;
    expect(foreignKeys).toHaveLength(4);
    for (const foreignKey of foreignKeys) {
      expect(foreignKey).toEqual({ delete_action: "r", update_action: "c" });
    }

    const triggers = await database.$queryRaw<Array<{ name: string }>>`
      SELECT tgname AS name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN (
          '"UserActor"'::regclass,
          '"Workspace"'::regclass,
          '"Membership"'::regclass
        )`;
    expect(triggers.map((trigger) => trigger.name)).toEqual(
      expect.arrayContaining([
        "UserActor_immutable_fields_trigger",
        "Workspace_immutable_fields_trigger",
        "Membership_guard_change_trigger",
      ]),
    );
  });

  it("fails closed on deterministic fixture drift without overwriting it", async () => {
    try {
      await database.workspace.update({
        where: { workspaceId: P2_TEST_IDENTITY.workspaceId },
        data: { displayName: "Deliberate test-only drift" },
      });

      await expect(
        initializeP2TestAuthContext(database, { NODE_ENV: "test" }),
      ).rejects.toBeInstanceOf(P2TestFixtureError);
      await expect(
        database.workspace.findUnique({
          where: { workspaceId: P2_TEST_IDENTITY.workspaceId },
          select: { displayName: true },
        }),
      ).resolves.toEqual({ displayName: "Deliberate test-only drift" });
    } finally {
      await database.workspace.update({
        where: { workspaceId: P2_TEST_IDENTITY.workspaceId },
        data: { displayName: P2_TEST_IDENTITY.displayName },
      });
    }
  });
});

type SyntheticIdentity = Awaited<ReturnType<typeof createSyntheticIdentity>>;

async function createSyntheticIdentity(label: string) {
  const actor = await syntheticActorInput(label);
  const workspaceId = uniqueId(`${label}-workspace`);
  const membershipId = uniqueId(`${label}-membership`);

  await database.$transaction(async (transaction) => {
    await transaction.userActor.create({ data: actor });
    await transaction.workspace.create({
      data: {
        workspaceId,
        displayName: `Synthetic ${label} workspace`,
        status: "ACTIVE",
        createdByActorId: actor.userActorId,
      },
    });
    await transaction.membership.create({
      data: {
        membershipId,
        workspaceId,
        userActorId: actor.userActorId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
  });

  return { ...actor, workspaceId, membershipId };
}

async function createSyntheticActor(label: string) {
  const actor = await syntheticActorInput(label);
  return database.userActor.create({ data: actor });
}

async function syntheticActorInput(label: string) {
  const discriminator = crypto.randomUUID();
  return {
    userActorId: `p2_test_actor_${label}_${discriminator}`,
    authIssuer: `urn:image-generation-mvp:test-only:${label}`,
    authSubject: discriminator,
    status: "ACTIVE" as const,
  };
}

function resolverFor(
  identity: SyntheticIdentity,
  workspaceId = identity.workspaceId,
): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      return {
        authIssuer: identity.authIssuer,
        authSubject: identity.authSubject,
        workspaceId,
      };
    },
  });
}

function uniqueId(label: string): string {
  return `p2_test_${label}_${crypto.randomUUID()}`;
}

function resolveContextForTest(resolver: P2WorkspacePrincipalResolver) {
  return withP2WorkspaceMembershipScope(
    database,
    async (_transaction, context) => context,
    resolver,
  );
}
