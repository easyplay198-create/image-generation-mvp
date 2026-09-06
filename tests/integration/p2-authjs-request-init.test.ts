import { Auth, setEnvDefaults, type AuthConfig } from "@auth/core";
import { describe, expect, it } from "vitest";

import { createP2AuthAdapter } from "../../src/auth/authjs-adapter";
import { createP2AuthEmailProvider } from "../../src/auth/authjs-email";
import { createAuthJsP2PrincipalResolver } from "../../src/auth/authjs-principal-resolver";
import { createP2TruthHttpHandlers } from "../../src/http/p2-truth-api";
import type { DatabaseClient } from "../../src/storage/database";

const AUTH_ORIGIN = "https://example.test";

describe.sequential("P2 S1E Auth.js request initialization", () => {
  it.each([
    ["without AUTH_NODEMAILER_KEY", undefined],
    ["with an explicit dummy AUTH_NODEMAILER_KEY", "dummy-nodemailer-key"],
  ])("initializes real handlers %s and keeps anonymous P2 access denied", async (_label, apiKey) => {
    await withTestAuthEnvironment(apiKey, async (handleAuthRequest) => {
      const providersResponse = await handleAuthRequest(
        new Request(`${AUTH_ORIGIN}/api/auth/providers`),
      );
      expect(providersResponse.status).toBe(200);
      await expect(providersResponse.json()).resolves.toMatchObject({
        nodemailer: {
          id: "nodemailer",
          name: "Nodemailer",
          type: "email",
        },
      });

      const sessionResponse = await handleAuthRequest(
        new Request(`${AUTH_ORIGIN}/api/auth/session`),
      );
      expect(sessionResponse.status).toBe(200);
      const anonymousSession = await sessionResponse.json();
      expect(anonymousSession).toBeNull();

      const signInResponse = await handleAuthRequest(
        new Request(`${AUTH_ORIGIN}/api/auth/signin`),
      );
      expect(signInResponse.status).toBe(200);
      expect(signInResponse.headers.get("content-type")).toContain("text/html");

      const database = databaseThatMustNotBeRead();
      const principalResolver = createAuthJsP2PrincipalResolver({
        database,
        readSession: async () => anonymousSession,
      });
      const p2Response = await createP2TruthHttpHandlers({
        database,
        principalResolver,
        createRequestId: () => "authjs-request-init-anonymous",
      }).create(
        new Request(`${AUTH_ORIGIN}/api/p2/projects/project/truth-revisions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "authjs-request-init-anonymous-0001",
          },
          body: JSON.stringify({
            expectedCurrentRevisionId: null,
            parentRevisionId: null,
            truthBody: { name: "Anonymous request must remain denied" },
            productContinuity: "SAME_PRODUCT",
            sourceBindings: [
              {
                sourceSnapshotId: "source-authjs-request-init",
                sourceRole: "PRODUCT_PRIMARY",
                sortOrder: 0,
              },
            ],
          }),
        }),
        { params: Promise.resolve({ projectId: "project-authjs-request-init" }) },
      );
      expect(p2Response.status).toBe(401);
      await expect(p2Response.json()).resolves.toMatchObject({
        error: {
          code: "AUTH_REQUIRED",
          requestId: "authjs-request-init-anonymous",
        },
      });
    });
  });
});

async function withTestAuthEnvironment(
  apiKey: string | undefined,
  run: (handleAuthRequest: (request: Request) => Promise<Response>) => Promise<void>,
): Promise<void> {
  const environment: Record<string, string | undefined> = {
    AUTH_SECRET: "test-only-authjs-request-init-secret",
    AUTH_TRUST_HOST: "true",
    AUTH_URL: `${AUTH_ORIGIN}/api/auth`,
    NODE_ENV: "test",
  };
  if (apiKey !== undefined) environment.AUTH_NODEMAILER_KEY = apiKey;

  await run(async (request) => {
    const database = databaseThatMustNotBeRead();
    const adapter = createP2AuthAdapter(database);
    const config: AuthConfig = {
      adapter,
      basePath: "/api/auth",
      providers: [createP2AuthEmailProvider()],
      secret: environment.AUTH_SECRET,
      session: {
        strategy: "database",
        maxAge: 604800,
        updateAge: 0,
      },
      trustHost: true,
    };
    setEnvDefaults(environment, config, true);
    return Auth(request, config);
  });
}

function databaseThatMustNotBeRead(): DatabaseClient {
  return new Proxy({}, {
    get() {
      throw new Error("DATABASE_MUST_NOT_BE_READ_FOR_ANONYMOUS_P2_REQUEST");
    },
  }) as DatabaseClient;
}
