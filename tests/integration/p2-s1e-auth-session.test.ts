import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createP2AuthAdapter,
  hashP2AuthVerificationToken,
  P2AuthAdapterError,
  P2_AUTH_ISSUER,
} from "../../src/auth/authjs-adapter";
import { createAuthJsP2PrincipalResolver } from "../../src/auth/authjs-principal-resolver";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/storage/database";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for integration tests.");

let database: DatabaseClient;

beforeAll(() => {
  database = createDatabaseClient(connectionString);
});

afterAll(async () => {
  await database.$disconnect();
});

describe.sequential("P2 S1E Auth.js database session", () => {
  it("maps only a pre-provisioned canonical email and never creates a user", async () => {
    const identity = await createIdentity("adapter-user");
    const adapter = createP2AuthAdapter(database);

    await expect(adapter.getUserByEmail?.(identity.email.toUpperCase())).resolves.toMatchObject({
      id: identity.userActorId,
      email: identity.email,
    });
    await expect(adapter.getUserByEmail?.("unknown@example.test")).resolves.toBeNull();
    await expect(
      adapter.createUser?.({
        id: uniqueId("forbidden-user"),
        email: "unknown@example.test",
        emailVerified: null,
        name: null,
        image: null,
      }),
    ).rejects.toBeInstanceOf(P2AuthAdapterError);
  });

  it("persists only a SHA-256 token hash and consumes it atomically once", async () => {
    const adapter = createP2AuthAdapter(database);
    const token = `verification-${crypto.randomUUID()}`;
    const identifier = `token-${crypto.randomUUID()}@example.test`;
    const expires = new Date(Date.now() + 899_000);

    await adapter.createVerificationToken?.({ identifier, token, expires });
    const stored = await database.p2AuthVerificationToken.findUniqueOrThrow({
      where: {
        identifier_tokenHash: {
          identifier,
          tokenHash: hashP2AuthVerificationToken(token),
        },
      },
    });
    expect(stored.tokenHash).toBe(hashP2AuthVerificationToken(token));
    expect(stored.tokenHash).not.toBe(token);

    await expect(
      adapter.useVerificationToken?.({ identifier, token }),
    ).resolves.toEqual({ identifier, token, expires });
    await expect(
      adapter.useVerificationToken?.({ identifier, token }),
    ).resolves.toBeNull();

    const expiredToken = `expired-${crypto.randomUUID()}`;
    await database.p2AuthVerificationToken.create({
      data: {
        identifier,
        tokenHash: hashP2AuthVerificationToken(expiredToken),
        expires: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      adapter.useVerificationToken?.({ identifier, token: expiredToken }),
    ).resolves.toBeNull();
    await expect(
      database.p2AuthVerificationToken.findUnique({
        where: {
          identifier_tokenHash: {
            identifier,
            tokenHash: hashP2AuthVerificationToken(expiredToken),
          },
        },
      }),
    ).resolves.toBeNull();
  });

  it("creates an absolute seven-day session and supports expiry and revocation", async () => {
    const identity = await createIdentity("session");
    const adapter = createP2AuthAdapter(database);
    const sessionToken = `session-${crypto.randomUUID()}`;
    const expires = new Date(Date.now() + 604_799_000);

    await expect(
      adapter.createSession?.({
        sessionToken,
        userId: identity.userActorId,
        expires,
      }),
    ).resolves.toEqual({ sessionToken, userId: identity.userActorId, expires });
    await expect(adapter.getSessionAndUser?.(sessionToken)).resolves.toMatchObject({
      session: { sessionToken, userId: identity.userActorId, expires },
      user: { id: identity.userActorId, email: identity.email },
    });

    const attemptedExtension = new Date(Date.now() + 604_799_500);
    await expect(
      adapter.updateSession?.({ sessionToken, expires: attemptedExtension }),
    ).resolves.toEqual({ sessionToken, userId: identity.userActorId, expires });
    await expect(
      database.p2AuthSession.findUniqueOrThrow({ where: { sessionToken } }),
    ).resolves.toMatchObject({ expires });

    await adapter.deleteSession?.(sessionToken);
    await expect(adapter.getSessionAndUser?.(sessionToken)).resolves.toBeNull();

    const expiredSessionToken = `expired-session-${crypto.randomUUID()}`;
    await database.p2AuthSession.create({
      data: {
        sessionToken: expiredSessionToken,
        userActorId: identity.userActorId,
        expires: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      adapter.getSessionAndUser?.(expiredSessionToken),
    ).resolves.toBeNull();
    await expect(
      database.p2AuthSession.findUnique({ where: { sessionToken: expiredSessionToken } }),
    ).resolves.toBeNull();

    await expect(
      adapter.createSession?.({
        sessionToken: `too-long-${crypto.randomUUID()}`,
        userId: identity.userActorId,
        expires: new Date(Date.now() + 604_801_000),
      }),
    ).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });

  it("selects server-side Workspace authority and rejects ambiguity or inactive state", async () => {
    const identity = await createIdentity("resolver");
    const resolver = createAuthJsP2PrincipalResolver({
      database,
      readSession: async () => ({
        user: { id: identity.userActorId },
        workspaceId: "client-forged-workspace",
      }),
    });
    await expect(resolver.resolve()).resolves.toEqual({
      authIssuer: P2_AUTH_ISSUER,
      authSubject: identity.email,
      workspaceId: identity.workspaceId,
    });

    const secondWorkspaceId = uniqueId("ambiguous-workspace");
    await database.workspace.create({
      data: {
        workspaceId: secondWorkspaceId,
        displayName: "Ambiguous active Workspace",
        status: "ACTIVE",
        createdByActorId: identity.userActorId,
      },
    });
    await database.membership.create({
      data: {
        membershipId: uniqueId("ambiguous-membership"),
        workspaceId: secondWorkspaceId,
        userActorId: identity.userActorId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    await expect(resolver.resolve()).rejects.toMatchObject({
      code: "FORBIDDEN_SCOPE",
      status: 403,
    });

    const inactive = await createIdentity("inactive");
    await database.userActor.update({
      where: { userActorId: inactive.userActorId },
      data: { status: "DISABLED", disabledAt: new Date() },
    });
    await expect(
      createAuthJsP2PrincipalResolver({
        database,
        readSession: async () => ({ user: { id: inactive.userActorId } }),
      }).resolve(),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE" });
  });

  it("does not write legacy Project, Asset or Job records", async () => {
    const [projects, assets, jobs] = await Promise.all([
      database.project.count(),
      database.asset.count(),
      database.job.count(),
    ]);
    const identity = await createIdentity("no-legacy-write");
    const adapter = createP2AuthAdapter(database);
    const sessionToken = `no-legacy-${crypto.randomUUID()}`;
    await adapter.createSession?.({
      sessionToken,
      userId: identity.userActorId,
      expires: new Date(Date.now() + 60_000),
    });
    await adapter.deleteSession?.(sessionToken);
    await expect(
      Promise.all([
        database.project.count(),
        database.asset.count(),
        database.job.count(),
      ]),
    ).resolves.toEqual([projects, assets, jobs]);
  });
});

async function createIdentity(label: string) {
  const suffix = crypto.randomUUID();
  const identity = {
    userActorId: `p2_auth_actor_${label}_${suffix}`,
    workspaceId: `p2_auth_workspace_${label}_${suffix}`,
    membershipId: `p2_auth_membership_${label}_${suffix}`,
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
        displayName: `P2 S1E ${label}`,
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

function uniqueId(label: string): string {
  return `p2_auth_${label}_${crypto.randomUUID()}`;
}
