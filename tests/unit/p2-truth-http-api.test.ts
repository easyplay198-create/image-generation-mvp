import { describe, expect, it } from "vitest";

import { createP2TruthHttpHandlers } from "../../src/http/p2-truth-api";
import type { DatabaseClient } from "../../src/storage/database";

const PROJECT_ID = "p2-project-http-unit";
const TRUTH_ID = "p2-truth-http-unit";

describe("P2 S1D truth HTTP boundary", () => {
  it("defaults to AUTH_REQUIRED before database access", async () => {
    const response = await handlers(databaseThatMustNotBeRead()).create(
      jsonRequest("https://example.test/api", createBody(), "unit-key-0001"),
      context(PROJECT_ID),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED", requestId: "unit-request" },
    });
  });

  it.each([
    [undefined, "missing idempotency key"],
    ["short", "short idempotency key"],
  ])("rejects %s before identity or database access (%s)", async (key, reason) => {
    expect(reason).toBeTypeOf("string");
    const response = await handlers(databaseThatMustNotBeRead()).create(
      jsonRequest("https://example.test/api", createBody(), key),
      context(PROJECT_ID),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("requires application/json and an exact request shape", async () => {
    const api = handlers(databaseThatMustNotBeRead());
    const wrongContentType = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Idempotency-Key": "unit-key-0002" },
      body: JSON.stringify(createBody()),
    });
    expect((await api.create(wrongContentType, context(PROJECT_ID))).status).toBe(400);

    const extended = { ...createBody(), workspaceId: "client-forged" };
    const response = await api.create(
      jsonRequest("https://example.test/api", extended, "unit-key-0003"),
      context(PROJECT_ID),
    );
    expect(response.status).toBe(400);
  });

  it("refuses to fabricate activation build evidence", async () => {
    const originalGithubSha = process.env.GITHUB_SHA;
    const originalVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
    const originalVersion = process.env.npm_package_version;
    delete process.env.GITHUB_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.npm_package_version;
    try {
      const response = await handlers(databaseThatMustNotBeRead()).activate(
        jsonRequest(
          "https://example.test/api",
          { expectedCurrentRevisionId: null, correlationId: "unit-correlation" },
          "unit-key-0004",
        ),
        context(PROJECT_ID, TRUTH_ID),
      );
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INTERNAL_ERROR" },
      });
    } finally {
      restore("GITHUB_SHA", originalGithubSha);
      restore("VERCEL_GIT_COMMIT_SHA", originalVercelSha);
      restore("npm_package_version", originalVersion);
    }
  });
});

function handlers(database: DatabaseClient) {
  return createP2TruthHttpHandlers({
    database,
    createRequestId: () => "unit-request",
  });
}

function createBody() {
  return {
    expectedCurrentRevisionId: null,
    parentRevisionId: null,
    truthBody: { name: "Portable inflator" },
    productContinuity: "SAME_PRODUCT",
    sourceBindings: [
      { sourceSnapshotId: "source-1", sourceRole: "PRODUCT_PRIMARY", sortOrder: 0 },
    ],
  };
}

function jsonRequest(url: string, body: unknown, idempotencyKey?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function context(projectId: string, truthRevisionId?: string) {
  return { params: Promise.resolve({ projectId, truthRevisionId }) };
}

function databaseThatMustNotBeRead(): DatabaseClient {
  return new Proxy({}, { get() { throw new Error("DATABASE_MUST_NOT_BE_READ"); } }) as DatabaseClient;
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
