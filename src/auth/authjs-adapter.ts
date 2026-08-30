import { createHash } from "node:crypto";

import type {
  Adapter,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "@auth/core/adapters";

import { Prisma } from "@/src/generated/prisma/client";
import type { DatabaseClient } from "@/src/storage/database";

export const P2_AUTH_ISSUER = "urn:image-generation-mvp:authjs-email-v1";
export const P2_AUTH_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const P2_AUTH_VERIFICATION_MAX_AGE_SECONDS = 15 * 60;

export class P2AuthAdapterError extends Error {
  constructor(
    readonly code:
      | "IDENTITY_INVALID"
      | "PROVISIONING_FORBIDDEN"
      | "SESSION_INVALID"
      | "TOKEN_INVALID",
  ) {
    super(code);
    this.name = "P2AuthAdapterError";
  }
}

export function normalizeP2AuthEmail(input: string): string {
  if (typeof input !== "string" || hasControlCharacter(input)) {
    throw new P2AuthAdapterError("IDENTITY_INVALID");
  }

  const normalized = asciiLowercase(input.normalize("NFKC").trim());
  if (
    normalized.length === 0 ||
    normalized.length > 254 ||
    !isAscii(normalized) ||
    hasControlCharacter(normalized)
  ) {
    throw new P2AuthAdapterError("IDENTITY_INVALID");
  }

  const parts = normalized.split("@");
  if (parts.length !== 2) throw new P2AuthAdapterError("IDENTITY_INVALID");
  const [local, domain] = parts;
  if (
    local.length === 0 ||
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    !isCanonicalDomain(domain)
  ) {
    throw new P2AuthAdapterError("IDENTITY_INVALID");
  }

  return normalized;
}

export function hashP2AuthVerificationToken(token: string): string {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token !== token.trim() ||
    hasControlCharacter(token)
  ) {
    throw new P2AuthAdapterError("TOKEN_INVALID");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createP2AuthAdapter(database: DatabaseClient): Adapter {
  return {
    async createUser(): Promise<never> {
      throw new P2AuthAdapterError("PROVISIONING_FORBIDDEN");
    },

    async getUser(id): Promise<AdapterUser | null> {
      const actor = await database.userActor.findFirst({
        where: { userActorId: id, authIssuer: P2_AUTH_ISSUER, status: "ACTIVE" },
      });
      return actor ? adapterUser(actor) : null;
    },

    async getUserByEmail(email): Promise<AdapterUser | null> {
      const authSubject = normalizeP2AuthEmail(email);
      const actor = await database.userActor.findUnique({
        where: {
          authIssuer_authSubject: {
            authIssuer: P2_AUTH_ISSUER,
            authSubject,
          },
        },
      });
      return actor?.status === "ACTIVE" ? adapterUser(actor) : null;
    },

    async getUserByAccount(): Promise<null> {
      return null;
    },

    async updateUser(update): Promise<AdapterUser> {
      if (
        update.name != null ||
        update.image != null ||
        (update.email !== undefined && normalizeP2AuthEmail(update.email) === "") ||
        (update.emailVerified !== undefined &&
          update.emailVerified !== null &&
          !(update.emailVerified instanceof Date))
      ) {
        throw new P2AuthAdapterError("PROVISIONING_FORBIDDEN");
      }

      const actor = await database.userActor.findFirst({
        where: {
          userActorId: update.id,
          authIssuer: P2_AUTH_ISSUER,
          status: "ACTIVE",
        },
      });
      if (!actor) throw new P2AuthAdapterError("IDENTITY_INVALID");
      if (
        update.email !== undefined &&
        normalizeP2AuthEmail(update.email) !== actor.authSubject
      ) {
        throw new P2AuthAdapterError("PROVISIONING_FORBIDDEN");
      }
      return adapterUser(actor, update.emailVerified ?? new Date());
    },

    async linkAccount(): Promise<never> {
      throw new P2AuthAdapterError("PROVISIONING_FORBIDDEN");
    },

    async createSession(session): Promise<AdapterSession> {
      assertCanonicalSessionToken(session.sessionToken);
      assertFutureWithin(
        session.expires,
        P2_AUTH_SESSION_MAX_AGE_SECONDS,
        "SESSION_INVALID",
      );
      const actor = await database.userActor.findFirst({
        where: {
          userActorId: session.userId,
          authIssuer: P2_AUTH_ISSUER,
          status: "ACTIVE",
        },
        select: { userActorId: true },
      });
      if (!actor) throw new P2AuthAdapterError("SESSION_INVALID");

      const created = await database.p2AuthSession.create({
        data: {
          sessionToken: session.sessionToken,
          userActorId: actor.userActorId,
          expires: session.expires,
        },
      });
      return adapterSession(created);
    },

    async getSessionAndUser(sessionToken) {
      assertCanonicalSessionToken(sessionToken);
      const record = await database.p2AuthSession.findUnique({
        where: { sessionToken },
        include: { userActor: true },
      });
      if (!record) return null;
      if (record.expires.getTime() <= Date.now()) {
        await database.p2AuthSession.delete({ where: { sessionToken } });
        return null;
      }
      if (
        record.userActor.status !== "ACTIVE" ||
        record.userActor.authIssuer !== P2_AUTH_ISSUER ||
        normalizeP2AuthEmail(record.userActor.authSubject) !==
          record.userActor.authSubject
      ) {
        return null;
      }
      return {
        session: adapterSession(record),
        user: adapterUser(record.userActor),
      };
    },

    async updateSession(update) {
      assertCanonicalSessionToken(update.sessionToken);
      const record = await database.p2AuthSession.findUnique({
        where: { sessionToken: update.sessionToken },
      });
      if (!record) return null;
      if (record.expires.getTime() <= Date.now()) {
        await database.p2AuthSession.delete({
          where: { sessionToken: update.sessionToken },
        });
        return null;
      }
      if (update.userId !== undefined && update.userId !== record.userActorId) {
        throw new P2AuthAdapterError("SESSION_INVALID");
      }

      // Auth.js asks adapters to refresh database sessions. S1E sessions are
      // absolute, so the stored expiry is intentionally never extended.
      return adapterSession(record);
    },

    async deleteSession(sessionToken) {
      assertCanonicalSessionToken(sessionToken);
      try {
        const deleted = await database.p2AuthSession.delete({
          where: { sessionToken },
        });
        return adapterSession(deleted);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return null;
        }
        throw error;
      }
    },

    async createVerificationToken(token): Promise<VerificationToken> {
      const identifier = normalizeP2AuthEmail(token.identifier);
      assertFutureWithin(
        token.expires,
        P2_AUTH_VERIFICATION_MAX_AGE_SECONDS,
        "TOKEN_INVALID",
      );
      await database.p2AuthVerificationToken.create({
        data: {
          identifier,
          tokenHash: hashP2AuthVerificationToken(token.token),
          expires: token.expires,
        },
      });
      return { identifier, token: token.token, expires: token.expires };
    },

    async useVerificationToken(input): Promise<VerificationToken | null> {
      const identifier = normalizeP2AuthEmail(input.identifier);
      const tokenHash = hashP2AuthVerificationToken(input.token);
      const rows = await database.$queryRaw<ConsumedVerificationToken[]>(Prisma.sql`
        DELETE FROM "P2AuthVerificationToken"
        WHERE "identifier" = ${identifier}
          AND "tokenHash" = ${tokenHash}
        RETURNING
          "identifier",
          "tokenHash",
          "expires"
      `);
      const consumed = rows[0];
      if (!consumed || consumed.expires.getTime() <= Date.now()) return null;
      return { identifier, token: input.token, expires: consumed.expires };
    },
  } satisfies Adapter;
}

type ActorRecord = Readonly<{
  userActorId: string;
  authIssuer: string;
  authSubject: string;
}>;

type SessionRecord = Readonly<{
  sessionToken: string;
  userActorId: string;
  expires: Date;
}>;

type ConsumedVerificationToken = Readonly<{
  identifier: string;
  tokenHash: string;
  expires: Date;
}>;

function adapterUser(
  actor: ActorRecord,
  emailVerified: Date | null = null,
): AdapterUser {
  return {
    id: actor.userActorId,
    email: actor.authSubject,
    emailVerified,
    name: null,
    image: null,
  };
}

function adapterSession(session: SessionRecord): AdapterSession {
  return {
    sessionToken: session.sessionToken,
    userId: session.userActorId,
    expires: session.expires,
  };
}

function assertCanonicalSessionToken(token: string): void {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token !== token.trim() ||
    hasControlCharacter(token)
  ) {
    throw new P2AuthAdapterError("SESSION_INVALID");
  }
}

function assertFutureWithin(
  expires: Date,
  maxAgeSeconds: number,
  code: "SESSION_INVALID" | "TOKEN_INVALID",
): void {
  const remaining = expires instanceof Date ? expires.getTime() - Date.now() : NaN;
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > maxAgeSeconds * 1000) {
    throw new P2AuthAdapterError(code);
  }
}

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32),
  );
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7e]+$/.test(value);
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function isCanonicalDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253 || domain.endsWith(".")) {
    return false;
  }
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    !label.startsWith("-") &&
    !label.endsWith("-") &&
    /^[a-z0-9-]+$/.test(label),
  );
}
