import {
  P2AuthContextError,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import {
  normalizeP2AuthEmail,
  P2_AUTH_ISSUER,
} from "@/src/auth/authjs-adapter";
import type { DatabaseClient } from "@/src/storage/database";

type Dependencies = Readonly<{
  database: DatabaseClient;
  readSession: () => Promise<unknown>;
}>;

export function createAuthJsP2PrincipalResolver(
  dependencies: Dependencies,
): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      const userActorId = parseSessionUserId(await dependencies.readSession());
      const actor = await dependencies.database.userActor.findUnique({
        where: { userActorId },
        select: {
          userActorId: true,
          authIssuer: true,
          authSubject: true,
          status: true,
        },
      });

      if (!actor || actor.authIssuer !== P2_AUTH_ISSUER) throw authRequired();
      if (actor.status !== "ACTIVE") throw forbiddenScope();
      try {
        if (normalizeP2AuthEmail(actor.authSubject) !== actor.authSubject) {
          throw forbiddenScope();
        }
      } catch {
        throw forbiddenScope();
      }

      const memberships = await dependencies.database.membership.findMany({
        where: {
          userActorId: actor.userActorId,
          role: "OWNER",
          status: "ACTIVE",
          workspace: { status: "ACTIVE" },
        },
        select: {
          workspaceId: true,
          userActorId: true,
          role: true,
          status: true,
          workspace: { select: { status: true } },
        },
        take: 2,
      });
      if (memberships.length !== 1) throw forbiddenScope();
      const membership = memberships[0];
      if (
        membership.userActorId !== actor.userActorId ||
        membership.role !== "OWNER" ||
        membership.status !== "ACTIVE" ||
        membership.workspace.status !== "ACTIVE"
      ) {
        throw forbiddenScope();
      }

      return Object.freeze({
        authIssuer: actor.authIssuer,
        authSubject: actor.authSubject,
        workspaceId: membership.workspaceId,
      });
    },
  });
}

function parseSessionUserId(session: unknown): string {
  if (!isRecord(session) || !isRecord(session.user)) throw authRequired();
  const id = session.user.id;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id !== id.trim() ||
    /[\u0000-\u001f\u007f-\u009f]/.test(id)
  ) {
    throw authRequired();
  }
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authRequired(): P2AuthContextError {
  return new P2AuthContextError(
    "AUTH_REQUIRED",
    401,
    "Authenticated Auth.js session is required.",
  );
}

function forbiddenScope(): P2AuthContextError {
  return new P2AuthContextError(
    "FORBIDDEN_SCOPE",
    403,
    "The authenticated identity has no unique active OWNER Workspace.",
  );
}
