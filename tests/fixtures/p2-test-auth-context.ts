import { createHash } from "node:crypto";

import type { DatabaseClient } from "../../src/storage/database";
import {
  withP2WorkspaceMembershipScope,
  type P2AuthContext,
  type P2WorkspacePrincipalResolver,
} from "../../src/auth/workspace-membership-scope";

type TestEnvironment = Readonly<Record<string, string | undefined>>;

const TEST_AUTH_ISSUER = "urn:image-generation-mvp:test-only";
const TEST_AUTH_SUBJECT = "p2-s1a-single-owner";

export const P2_TEST_IDENTITY = Object.freeze({
  authIssuer: TEST_AUTH_ISSUER,
  authSubject: TEST_AUTH_SUBJECT,
  userActorId: deterministicFixtureId("user_actor"),
  workspaceId: deterministicFixtureId("workspace"),
  membershipId: deterministicFixtureId("membership"),
  displayName: "P2 S1A isolated test workspace",
});

export class P2TestFixtureError extends Error {
  constructor(readonly code: "TEST_MODE_REQUIRED" | "FIXTURE_DRIFT") {
    super(
      code === "TEST_MODE_REQUIRED"
        ? "P2 test identity is unavailable outside explicit test mode."
        : "P2 test identity fixture does not match its frozen state.",
    );
    this.name = "P2TestFixtureError";
  }
}

export function createP2TestPrincipalResolver(
  environment: TestEnvironment,
): P2WorkspacePrincipalResolver {
  assertExplicitTestMode(environment);

  return Object.freeze({
    async resolve() {
      return Object.freeze({
        authIssuer: P2_TEST_IDENTITY.authIssuer,
        authSubject: P2_TEST_IDENTITY.authSubject,
        workspaceId: P2_TEST_IDENTITY.workspaceId,
      });
    },
  });
}

export async function initializeP2TestAuthContext(
  database: DatabaseClient,
  environment: TestEnvironment,
): Promise<P2AuthContext> {
  const principalResolver = createP2TestPrincipalResolver(environment);

  await database.$transaction(async (transaction) => {
    const actorById = await transaction.userActor.findUnique({
      where: { userActorId: P2_TEST_IDENTITY.userActorId },
    });
    const actorByPrincipal = await transaction.userActor.findUnique({
      where: {
        authIssuer_authSubject: {
          authIssuer: P2_TEST_IDENTITY.authIssuer,
          authSubject: P2_TEST_IDENTITY.authSubject,
        },
      },
    });

    const workspace = await transaction.workspace.findUnique({
      where: { workspaceId: P2_TEST_IDENTITY.workspaceId },
    });
    const membershipById = await transaction.membership.findUnique({
      where: { membershipId: P2_TEST_IDENTITY.membershipId },
    });
    const membershipByScope = await transaction.membership.findUnique({
      where: {
        workspaceId_userActorId: {
          workspaceId: P2_TEST_IDENTITY.workspaceId,
          userActorId: P2_TEST_IDENTITY.userActorId,
        },
      },
    });

    const fixtureRecords = [
      actorById,
      actorByPrincipal,
      workspace,
      membershipById,
      membershipByScope,
    ];
    const isFirstInitialization = fixtureRecords.every(
      (record) => record === null,
    );

    if (isFirstInitialization) {
      await transaction.userActor.create({
        data: {
          userActorId: P2_TEST_IDENTITY.userActorId,
          authIssuer: P2_TEST_IDENTITY.authIssuer,
          authSubject: P2_TEST_IDENTITY.authSubject,
          status: "ACTIVE",
        },
      });
      await transaction.workspace.create({
        data: {
          workspaceId: P2_TEST_IDENTITY.workspaceId,
          displayName: P2_TEST_IDENTITY.displayName,
          status: "ACTIVE",
          createdByActorId: P2_TEST_IDENTITY.userActorId,
        },
      });
      await transaction.membership.create({
        data: {
          membershipId: P2_TEST_IDENTITY.membershipId,
          workspaceId: P2_TEST_IDENTITY.workspaceId,
          userActorId: P2_TEST_IDENTITY.userActorId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });
    } else if (
      !actorById ||
      !actorByPrincipal ||
      !workspace ||
      !membershipById ||
      !membershipByScope ||
      actorById.userActorId !== actorByPrincipal.userActorId ||
      actorById.authIssuer !== P2_TEST_IDENTITY.authIssuer ||
      actorById.authSubject !== P2_TEST_IDENTITY.authSubject ||
      actorById.status !== "ACTIVE" ||
      actorById.disabledAt !== null ||
      workspace.displayName !== P2_TEST_IDENTITY.displayName ||
      workspace.status !== "ACTIVE" ||
      workspace.createdByActorId !== P2_TEST_IDENTITY.userActorId ||
      workspace.suspendedAt !== null ||
      workspace.archivedAt !== null ||
      membershipById.membershipId !== membershipByScope.membershipId ||
      membershipById.workspaceId !== P2_TEST_IDENTITY.workspaceId ||
      membershipById.userActorId !== P2_TEST_IDENTITY.userActorId ||
      membershipById.role !== "OWNER" ||
      membershipById.status !== "ACTIVE" ||
      membershipById.revokedAt !== null ||
      membershipById.revokedByActorId !== null
    ) {
      throw fixtureDrift();
    }

    const activeMembershipCount = await transaction.membership.count({
      where: {
        workspaceId: P2_TEST_IDENTITY.workspaceId,
        status: "ACTIVE",
      },
    });
    if (activeMembershipCount !== 1) throw fixtureDrift();
  });

  return withP2WorkspaceMembershipScope(
    database,
    async (_transaction, context) => context,
    principalResolver,
  );
}

function assertExplicitTestMode(environment: TestEnvironment): void {
  if (environment.NODE_ENV !== "test") {
    throw new P2TestFixtureError("TEST_MODE_REQUIRED");
  }
}

function fixtureDrift(): P2TestFixtureError {
  return new P2TestFixtureError("FIXTURE_DRIFT");
}

function deterministicFixtureId(kind: string): string {
  const digest = createHash("sha256")
    .update(`${TEST_AUTH_ISSUER}\0${TEST_AUTH_SUBJECT}\0${kind}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  return `p2_test_${kind}_${digest}`;
}
