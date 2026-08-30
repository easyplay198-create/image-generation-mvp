import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  createP2AuthAdapter,
  hashP2AuthVerificationToken,
  normalizeP2AuthEmail,
  P2AuthAdapterError,
  P2_AUTH_ISSUER,
} from "../../src/auth/authjs-adapter";
import {
  createP2AuthEmailProvider,
  P2AuthMailError,
  type P2AuthVerificationMessage,
} from "../../src/auth/authjs-email";
import { createAuthJsP2PrincipalResolver } from "../../src/auth/authjs-principal-resolver";
import type { DatabaseClient } from "../../src/storage/database";

const ACTOR_ID = "p2-auth-actor";
const WORKSPACE_ID = "p2-auth-workspace";
const EMAIL = "owner@example.test";

describe("P2 S1E Auth.js boundary", () => {
  it.each([
    [" OWNER@Example.TEST ", EMAIL],
    ["ｏｗｎｅｒ＠ｅｘａｍｐｌｅ．ｔｅｓｔ", EMAIL],
    [EMAIL, EMAIL],
  ])("normalizes %s deterministically", (input, expected) => {
    expect(normalizeP2AuthEmail(input)).toBe(expected);
  });

  it.each([
    "",
    "owner",
    "owner@@example.test",
    ".owner@example.test",
    "owner..name@example.test",
    "owner@example",
    "owner@-example.test",
    "owner@exämple.test",
    "owner\u0000@example.test",
    '"owner"@example.test',
  ])("rejects malformed or non-canonical address %j", (input) => {
    expect(() => normalizeP2AuthEmail(input)).toThrowError(P2AuthAdapterError);
  });

  it("hashes verification tokens with SHA-256", () => {
    const token = "opaque-verification-token";
    expect(hashP2AuthVerificationToken(token)).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(hashP2AuthVerificationToken(token)).not.toContain(token);
  });

  it("uses only an explicitly injected in-process test sink", async () => {
    const messages: P2AuthVerificationMessage[] = [];
    const provider = createP2AuthEmailProvider({
      environment: { NODE_ENV: "test" },
      sink: {
        async deliver(message) {
          messages.push(message);
        },
      },
    });
    const send = provider.sendVerificationRequest as unknown as (
      input: { identifier: string; url: string },
    ) => Promise<void>;
    const verificationUrl =
      "https://example.test/api/auth/callback/nodemailer?token=test-token&email=owner%40example.test";

    await send({ identifier: " OWNER@EXAMPLE.TEST ", url: verificationUrl });

    expect(provider.maxAge).toBe(900);
    expect(provider.server).toEqual({ jsonTransport: true });
    expect(messages).toEqual([
      { recipient: EMAIL, verificationUrl },
    ]);
  });

  it("fails before mail delivery without a sink or outside test mode", async () => {
    const provider = createP2AuthEmailProvider();
    const send = provider.sendVerificationRequest as unknown as (
      input: { identifier: string; url: string },
    ) => Promise<void>;
    await expect(
      send({
        identifier: EMAIL,
        url: "https://example.test/api/auth/callback/nodemailer?token=x&email=owner%40example.test",
      }),
    ).rejects.toBeInstanceOf(P2AuthMailError);
    expect(() =>
      createP2AuthEmailProvider({
        environment: { NODE_ENV: "production" },
        sink: { async deliver() {} },
      }),
    ).toThrowError(P2AuthMailError);
  });

  it("never provisions an unknown actor and hashes before token persistence", async () => {
    let persisted: Record<string, unknown> | undefined;
    const database = {
      userActor: {
        async findUnique() {
          return null;
        },
      },
      p2AuthVerificationToken: {
        async create(input: { data: Record<string, unknown> }) {
          persisted = input.data;
          return input.data;
        },
      },
    } as unknown as DatabaseClient;
    const adapter = createP2AuthAdapter(database);

    await expect(adapter.getUserByEmail?.(EMAIL)).resolves.toBeNull();
    await expect(
      adapter.createUser?.({
        id: "client-user",
        email: EMAIL,
        emailVerified: null,
        name: null,
        image: null,
      }),
    ).rejects.toMatchObject({ code: "PROVISIONING_FORBIDDEN" });
    await adapter.createVerificationToken?.({
      identifier: EMAIL,
      token: "raw-token",
      expires: new Date(Date.now() + 899_000),
    });

    expect(persisted).toMatchObject({
      identifier: EMAIL,
      tokenHash: hashP2AuthVerificationToken("raw-token"),
    });
    expect(persisted?.tokenHash).not.toBe("raw-token");
  });

  it("selects one active OWNER Workspace from only the server session", async () => {
    const principal = await createAuthJsP2PrincipalResolver({
      database: resolverDatabase(),
      readSession: async () => ({
        user: { id: ACTOR_ID },
        workspaceId: "client-forged-workspace",
      }),
    }).resolve();

    expect(principal).toEqual({
      authIssuer: P2_AUTH_ISSUER,
      authSubject: EMAIL,
      workspaceId: WORKSPACE_ID,
    });
  });

  it.each([
    [null, "missing session"],
    [{}, "missing user"],
    [{ user: {} }, "missing actor id"],
    [{ user: { id: " client-actor" } }, "noncanonical actor id"],
  ])("fails closed for %s (%s)", async (session, reason) => {
    expect(reason).toBeTypeOf("string");
    const database = new Proxy({}, {
      get() {
        throw new Error("DATABASE_READ_BEFORE_SESSION");
      },
    }) as DatabaseClient;
    await expect(
      createAuthJsP2PrincipalResolver({
        database,
        readSession: async () => session,
      }).resolve(),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });

  it("rejects inactive actors and ambiguous active OWNER memberships", async () => {
    await expect(
      createAuthJsP2PrincipalResolver({
        database: resolverDatabase({ actorStatus: "DISABLED" }),
        readSession: async () => ({ user: { id: ACTOR_ID } }),
      }).resolve(),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE", status: 403 });

    await expect(
      createAuthJsP2PrincipalResolver({
        database: resolverDatabase({ membershipCount: 2 }),
        readSession: async () => ({ user: { id: ACTOR_ID } }),
      }).resolve(),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE", status: 403 });
  });

  it("wires all three P2 truth routes only through the Auth.js resolver", async () => {
    const routes = [
      "app/api/p2/projects/[projectId]/truth-revisions/route.ts",
      "app/api/p2/projects/[projectId]/truth-revisions/[truthRevisionId]/route.ts",
      "app/api/p2/projects/[projectId]/truth-revisions/[truthRevisionId]/activate/route.ts",
    ];
    for (const route of routes) {
      const source = await readFile(route, "utf8");
      expect(source).toContain("createAuthJsP2PrincipalResolver");
      expect(source).toContain("readSession: () => auth()");
      expect(source).toContain("principalResolver");
      expect(source).not.toMatch(/headers\(|MVP_DEMO_USER_ID|workspaceId.*request/i);
    }

    const authSource = await readFile("auth.ts", "utf8");
    expect(authSource).toContain('strategy: "database"');
    expect(authSource).toContain("maxAge: 604800");
    expect(authSource).toContain("updateAge: 0");
    expect(authSource).toContain('sameSite: "lax"');
    const authRouteSource = await readFile(
      "app/api/auth/[...nextauth]/route.ts",
      "utf8",
    );
    expect(authRouteSource).toContain('runtime = "nodejs"');
  });
});

function resolverDatabase(options: Readonly<{
  actorStatus?: "ACTIVE" | "DISABLED";
  membershipCount?: number;
}> = {}): DatabaseClient {
  const membership = {
    workspaceId: WORKSPACE_ID,
    userActorId: ACTOR_ID,
    role: "OWNER",
    status: "ACTIVE",
    workspace: { status: "ACTIVE" },
  };
  return {
    userActor: {
      findUnique: vi.fn(async () => ({
        userActorId: ACTOR_ID,
        authIssuer: P2_AUTH_ISSUER,
        authSubject: EMAIL,
        status: options.actorStatus ?? "ACTIVE",
      })),
    },
    membership: {
      findMany: vi.fn(async () =>
        Array.from({ length: options.membershipCount ?? 1 }, () => membership),
      ),
    },
  } as unknown as DatabaseClient;
}
