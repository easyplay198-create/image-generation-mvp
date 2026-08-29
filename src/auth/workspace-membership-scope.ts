import { Prisma } from "@/src/generated/prisma/client";
import type {
  DatabaseClient,
  TransactionClient,
} from "@/src/storage/database";

export type P2AuthContextErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN_SCOPE";

export class P2AuthContextError extends Error {
  constructor(
    readonly code: P2AuthContextErrorCode,
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "P2AuthContextError";
  }
}

export type P2WorkspacePrincipal = Readonly<{
  authIssuer: string;
  authSubject: string;
  workspaceId: string;
}>;

export interface P2WorkspacePrincipalResolver {
  resolve(): Promise<unknown>;
}

export type P2AuthContext = Readonly<{
  userActorId: string;
  workspaceId: string;
  membershipId: string;
  role: "OWNER";
}>;

export const denyP2WorkspacePrincipal: P2WorkspacePrincipalResolver =
  Object.freeze({
    async resolve(): Promise<never> {
      throw authRequired();
    },
  });

export async function withP2WorkspaceMembershipScope<T>(
  database: DatabaseClient,
  operation: (
    transaction: TransactionClient,
    context: P2AuthContext,
  ) => Promise<T>,
  principalResolver: P2WorkspacePrincipalResolver = denyP2WorkspacePrincipal,
): Promise<T> {
  const principal = parseP2WorkspacePrincipal(await principalResolver.resolve());

  return database.$transaction(async (transaction) => {
    const actors = await transaction.$queryRaw<LockedActor[]>(Prisma.sql`
      SELECT
        actor."userActorId" AS "userActorId",
        actor."status"::text AS "status"
      FROM "UserActor" AS actor
      WHERE actor."authIssuer" = ${principal.authIssuer}
        AND actor."authSubject" = ${principal.authSubject}
      FOR SHARE OF actor
    `);
    const actor = actors[0];

    if (!actor) throw authRequired();
    if (actor.status !== "ACTIVE") throw forbiddenScope();

    const memberships = await transaction.$queryRaw<LockedMembership[]>(
      Prisma.sql`
        SELECT
          membership."membershipId" AS "membershipId",
          membership."workspaceId" AS "workspaceId",
          membership."userActorId" AS "userActorId",
          membership."role"::text AS "role",
          membership."status"::text AS "membershipStatus",
          workspace."status"::text AS "workspaceStatus"
        FROM "Membership" AS membership
        INNER JOIN "Workspace" AS workspace
          ON workspace."workspaceId" = membership."workspaceId"
        WHERE membership."workspaceId" = ${principal.workspaceId}
          AND membership."userActorId" = ${actor.userActorId}
        FOR SHARE OF membership, workspace
      `,
    );
    const membership = memberships[0];

    if (!membership) throw forbiddenScope();
    if (
      membership.userActorId !== actor.userActorId ||
      membership.workspaceId !== principal.workspaceId ||
      membership.role !== "OWNER" ||
      membership.membershipStatus !== "ACTIVE" ||
      membership.workspaceStatus !== "ACTIVE"
    ) {
      throw forbiddenScope();
    }

    const context = Object.freeze({
      userActorId: actor.userActorId,
      workspaceId: membership.workspaceId,
      membershipId: membership.membershipId,
      role: "OWNER" as const,
    });

    return operation(transaction, context);
  });
}

type LockedActor = {
  userActorId: string;
  status: string;
};

type LockedMembership = {
  membershipId: string;
  workspaceId: string;
  userActorId: string;
  role: string;
  membershipStatus: string;
  workspaceStatus: string;
};

function parseP2WorkspacePrincipal(value: unknown): P2WorkspacePrincipal {
  if (!isRecord(value)) throw authRequired();

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) throw authRequired();

  const keys = (ownKeys as string[]).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "authIssuer" ||
    keys[1] !== "authSubject" ||
    keys[2] !== "workspaceId"
  ) {
    throw authRequired();
  }

  const { authIssuer, authSubject, workspaceId } = value;
  if (
    !isCanonicalIdentityValue(authIssuer) ||
    !isCanonicalIdentityValue(authSubject) ||
    !isCanonicalIdentityValue(workspaceId)
  ) {
    throw authRequired();
  }

  return Object.freeze({ authIssuer, authSubject, workspaceId });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCanonicalIdentityValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function authRequired(): P2AuthContextError {
  return new P2AuthContextError(
    "AUTH_REQUIRED",
    401,
    "Authenticated workspace identity is required.",
  );
}

function forbiddenScope(): P2AuthContextError {
  return new P2AuthContextError(
    "FORBIDDEN_SCOPE",
    403,
    "The authenticated identity has no active workspace scope.",
  );
}
