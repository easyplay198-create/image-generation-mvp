import { describe, expect, it } from "vitest";

import type { DatabaseClient } from "../../src/storage/database";
import {
  P2AuthContextError,
  withP2WorkspaceMembershipScope,
  type P2WorkspacePrincipalResolver,
} from "../../src/auth/workspace-membership-scope";
import {
  createP2TestPrincipalResolver,
  initializeP2TestAuthContext,
  P2_TEST_IDENTITY,
  P2TestFixtureError,
} from "../fixtures/p2-test-auth-context";

describe("P2 S1A auth context boundary", () => {
  it("denies a missing principal before touching the database", async () => {
    const database = databaseThatMustNotBeRead();

    await expect(
      resolveContextForTest(database),
    ).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      status: 401,
    });
  });

  it.each([
    null,
    {},
    {
      authIssuer: P2_TEST_IDENTITY.authIssuer,
      authSubject: P2_TEST_IDENTITY.authSubject,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      ownerId: "client-forged-owner",
    },
    {
      authIssuer: ` ${P2_TEST_IDENTITY.authIssuer}`,
      authSubject: P2_TEST_IDENTITY.authSubject,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
    },
    principalWithHiddenOwner(),
    {
      authIssuer: P2_TEST_IDENTITY.authIssuer,
      authSubject: P2_TEST_IDENTITY.authSubject,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      [Symbol("client-identity")]: "client-controlled",
    },
    Object.assign(Object.create({ ownerId: "inherited-owner" }), {
      authIssuer: P2_TEST_IDENTITY.authIssuer,
      authSubject: P2_TEST_IDENTITY.authSubject,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
    }),
  ])("rejects a malformed or client-extended principal before database access", async (principal) => {
    const resolver: P2WorkspacePrincipalResolver = {
      async resolve() {
        return principal;
      },
    };

    await expect(
      resolveContextForTest(databaseThatMustNotBeRead(), resolver),
    ).rejects.toBeInstanceOf(P2AuthContextError);
  });

  it.each([undefined, "development", "production"])(
    "keeps the deterministic fixture disabled when NODE_ENV=%s",
    (nodeEnvironment) => {
      expect(() =>
        createP2TestPrincipalResolver({ NODE_ENV: nodeEnvironment }),
      ).toThrowError(P2TestFixtureError);
    },
  );

  it("rejects non-test fixture initialization before database access", async () => {
    await expect(
      initializeP2TestAuthContext(databaseThatMustNotBeRead(), {
        NODE_ENV: "production",
      }),
    ).rejects.toMatchObject({ code: "TEST_MODE_REQUIRED" });
  });

  it("treats partially existing deterministic state as drift without filling gaps", async () => {
    let writeCount = 0;
    const actor = {
      userActorId: P2_TEST_IDENTITY.userActorId,
      authIssuer: P2_TEST_IDENTITY.authIssuer,
      authSubject: P2_TEST_IDENTITY.authSubject,
      status: "ACTIVE",
      disabledAt: null,
      createdAt: new Date(),
    };
    const database = {
      async $transaction(operation: (transaction: unknown) => Promise<unknown>) {
        return operation({
          userActor: {
            async findUnique() {
              return actor;
            },
            async create() {
              writeCount += 1;
            },
          },
          workspace: {
            async findUnique() {
              return null;
            },
            async create() {
              writeCount += 1;
            },
          },
          membership: {
            async findUnique() {
              return null;
            },
            async create() {
              writeCount += 1;
            },
            async count() {
              return 0;
            },
          },
        });
      },
    } as unknown as DatabaseClient;

    await expect(
      initializeP2TestAuthContext(database, { NODE_ENV: "test" }),
    ).rejects.toMatchObject({ code: "FIXTURE_DRIFT" });
    expect(writeCount).toBe(0);
  });

  it("does not use Demo owner or request-like fields as identity authority", async () => {
    const resolver = createP2TestPrincipalResolver({
      NODE_ENV: "test",
      MVP_DEMO_USER_ID: "legacy-demo-owner-must-be-ignored",
      Authorization: "Bearer client-controlled",
      workspaceId: "client-controlled-workspace",
      actorId: "client-controlled-actor",
    });

    await expect(resolver.resolve()).resolves.toEqual({
      authIssuer: P2_TEST_IDENTITY.authIssuer,
      authSubject: P2_TEST_IDENTITY.authSubject,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
    });
  });

  it("maps a valid but unknown server principal to AUTH_REQUIRED", async () => {
    const database = databaseWithQueryResults([[]]);

    await expect(
      resolveContextForTest(
        database,
        createP2TestPrincipalResolver({ NODE_ENV: "test" }),
      ),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });

  it("returns only the frozen active OWNER context", async () => {
    const database = databaseWithQueryResults([
      [
        {
          userActorId: P2_TEST_IDENTITY.userActorId,
          status: "ACTIVE",
        },
      ],
      [
        {
          membershipId: P2_TEST_IDENTITY.membershipId,
          workspaceId: P2_TEST_IDENTITY.workspaceId,
          userActorId: P2_TEST_IDENTITY.userActorId,
          role: "OWNER",
          membershipStatus: "ACTIVE",
          workspaceStatus: "ACTIVE",
        },
      ],
    ]);

    const context = await resolveContextForTest(
      database,
      createP2TestPrincipalResolver({ NODE_ENV: "test" }),
    );

    expect(context).toEqual({
      userActorId: P2_TEST_IDENTITY.userActorId,
      workspaceId: P2_TEST_IDENTITY.workspaceId,
      membershipId: P2_TEST_IDENTITY.membershipId,
      role: "OWNER",
    });
    expect(context).not.toHaveProperty("ownerId");
    expect(Object.isFrozen(context)).toBe(true);
  });
});

function databaseThatMustNotBeRead(): DatabaseClient {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("DATABASE_ACCESSED_BEFORE_AUTHORIZATION");
      },
    },
  ) as DatabaseClient;
}

function resolveContextForTest(
  database: DatabaseClient,
  resolver?: P2WorkspacePrincipalResolver,
) {
  return withP2WorkspaceMembershipScope(
    database,
    async (_transaction, context) => context,
    resolver,
  );
}

function databaseWithQueryResults(results: unknown[][]): DatabaseClient {
  return {
    async $transaction(operation: (transaction: unknown) => Promise<unknown>) {
      let queryIndex = 0;
      return operation({
        async $queryRaw() {
          return results[queryIndex++] ?? [];
        },
      });
    },
  } as unknown as DatabaseClient;
}

function principalWithHiddenOwner(): Record<PropertyKey, unknown> {
  const principal: Record<PropertyKey, unknown> = {
    authIssuer: P2_TEST_IDENTITY.authIssuer,
    authSubject: P2_TEST_IDENTITY.authSubject,
    workspaceId: P2_TEST_IDENTITY.workspaceId,
  };
  Object.defineProperty(principal, "ownerId", {
    configurable: false,
    enumerable: false,
    value: "hidden-client-owner",
    writable: false,
  });
  return principal;
}
