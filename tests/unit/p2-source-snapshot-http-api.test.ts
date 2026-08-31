import { readFile } from "node:fs/promises";

import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  P2AuthContextError,
  type P2WorkspacePrincipalResolver,
} from "../../src/auth/workspace-membership-scope";
import { createP2SourceSnapshotHttpHandlers } from "../../src/http/p2-source-snapshot-api";
import type { DatabaseClient } from "../../src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "../../src/storage/object-storage";

describe("P2 S1F SourceSnapshot HTTP boundary", () => {
  it("fails authentication before multipart parsing, database, or storage", async () => {
    const response = await createP2SourceSnapshotHttpHandlers({
      database: databaseThatMustNotBeRead(),
      createObjectStorage: () => { throw new Error("STORAGE_CREATED"); },
      createRequestId: () => "request-auth",
    }).post(
      new Request("https://example.test/api", { method: "POST", body: "not multipart" }),
      context(PROJECT_ID),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authenticated workspace identity is required.",
        requestId: "request-auth",
      },
    });
  });

  it("fails inactive scope before multipart parsing or storage", async () => {
    const response = await createP2SourceSnapshotHttpHandlers({
      database: databaseThatMustNotBeRead(),
      principalResolver: {
        async resolve() {
          throw new P2AuthContextError(
            "FORBIDDEN_SCOPE",
            403,
            "Inactive Workspace.",
          );
        },
      },
      createObjectStorage: () => { throw new Error("STORAGE_CREATED"); },
      createRequestId: () => "request-forbidden",
    }).post(
      new Request("https://example.test/api", { method: "POST", body: "not multipart" }),
      context(PROJECT_ID),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN_SCOPE", requestId: "request-forbidden" },
    });
  });

  it.each([
    ["missing file", (form: FormData) => form.delete("file")],
    ["duplicate kind", (form: FormData) => form.append("sourceKind", "PRODUCT_SOURCE")],
    ["extra field", (form: FormData) => form.append("workspaceId", "client-forged")],
  ])("rejects %s as a non-exact multipart shape before storage", async (_label, mutate) => {
    const harness = createHarness();
    const form = await validFormData();
    mutate(form);

    const response = await harness.api.post(request(form), context(PROJECT_ID));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(harness.storageFactory).not.toHaveBeenCalled();
    expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
  });

  it("persists one upload and returns only the safe projection", async () => {
    const harness = createHarness();
    const response = await harness.api.post(
      request(await validFormData()),
      context(PROJECT_ID),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      requestId: "request-unit",
      result: {
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        sourceKind: "PRODUCT_SOURCE",
        mediaType: "image/png",
        validationStatus: "VALID",
        lifecycleStatus: "ACTIVE",
        createdByActorId: ACTOR_ID,
        capturedAt: "2026-08-30T00:00:00.000Z",
      },
    });
    expect(body.result.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(body.result).not.toHaveProperty("storageLocator");
    expect(body.result).not.toHaveProperty("body");
    expect(harness.storageFactory).toHaveBeenCalledOnce();
    expect(harness.storage.putObject).toHaveBeenCalledOnce();
    expect(harness.sourceSnapshotCreate).toHaveBeenCalledOnce();
  });

  it("hides a cross-Workspace project without writing storage", async () => {
    const harness = createHarness({ projectExists: false });
    const response = await harness.api.post(
      request(await validFormData()),
      context("project-in-another-workspace"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND" },
    });
    expect(harness.storage.putObject).not.toHaveBeenCalled();
    expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
  });

  it("maps invalid input and unavailable projects without leaking internals", async () => {
    const invalidKind = createHarness();
    const invalidForm = await validFormData();
    invalidForm.set("sourceKind", "GENERATED_OUTPUT");
    const invalidResponse = await invalidKind.api.post(
      request(invalidForm),
      context(PROJECT_ID),
    );
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: { code: "INVALID_SOURCE_KIND" },
    });

    const blocked = createHarness({ projectStatus: "BLOCKED" });
    const blockedResponse = await blocked.api.post(
      request(await validFormData()),
      context(PROJECT_ID),
    );
    expect(blockedResponse.status).toBe(409);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_WRITABLE" },
    });
  });

  it("does not compensate when object storage itself fails", async () => {
    const harness = createHarness();
    harness.storage.putObject.mockRejectedValue(new Error("test storage failure"));

    const response = await harness.api.post(
      request(await validFormData()),
      context(PROJECT_ID),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Service temporarily unavailable.",
        requestId: "request-unit",
      },
    });
    expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
    expect(harness.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("compensates the exact object when database commit fails", async () => {
    const harness = createHarness({ commitError: new Error("test commit failure") });
    const response = await harness.api.post(
      request(await validFormData()),
      context(PROJECT_ID),
    );

    expect(response.status).toBe(500);
    expect(harness.storage.putObject).toHaveBeenCalledOnce();
    expect(harness.sourceSnapshotCreate).toHaveBeenCalledOnce();
    expect(harness.storage.deleteObject).toHaveBeenCalledWith(
      harness.storage.putObject.mock.calls[0][0].key,
    );
  });

  it("wires the App Router only through Auth.js and deferred S3 construction", async () => {
    const source = await readFile(
      "app/api/p2/projects/[projectId]/source-snapshots/route.ts",
      "utf8",
    );
    expect(source).toContain("createAuthJsP2PrincipalResolver");
    expect(source).toContain("readSession: () => auth()");
    expect(source).toContain("createObjectStorage: () => createS3ObjectStorage()");
    expect(source).toContain('runtime = "nodejs"');
    expect(source).not.toMatch(/headers\(|MVP_DEMO_USER_ID|workspaceId.*request/i);
  });
});

const ACTOR_ID = "p2-s1f-unit-actor";
const WORKSPACE_ID = "p2-s1f-unit-workspace";
const MEMBERSHIP_ID = "p2-s1f-unit-membership";
const PROJECT_ID = "p2-s1f-unit-project";

function createHarness(options: Readonly<{
  commitError?: Error;
  projectExists?: boolean;
  projectStatus?: "DRAFT" | "ACTIVE" | "BLOCKED" | "ARCHIVED";
}> = {}) {
  let rawQueryCount = 0;
  const sourceSnapshotCreate = vi.fn(async (input: { data: Record<string, unknown> }) => ({
    ...input.data,
    capturedAt: new Date("2026-08-30T00:00:00.000Z"),
  }));
  const transaction = {
    $queryRaw: vi.fn(async () => {
      rawQueryCount += 1;
      return rawQueryCount % 2 === 1
        ? [{ userActorId: ACTOR_ID, status: "ACTIVE" }]
        : [{
            membershipId: MEMBERSHIP_ID,
            workspaceId: WORKSPACE_ID,
            userActorId: ACTOR_ID,
            role: "OWNER",
            membershipStatus: "ACTIVE",
            workspaceStatus: "ACTIVE",
          }];
    }),
    productProject: {
      findFirst: vi.fn(async () => options.projectExists === false
        ? null
        : { status: options.projectStatus ?? "DRAFT" }),
    },
    sourceSnapshot: { create: sourceSnapshotCreate },
  };
  const database = {
    $transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => {
      const result = await operation(transaction);
      if (options.commitError) throw options.commitError;
      return result;
    }),
  } as unknown as DatabaseClient;
  const storage = createStorage();
  const storageFactory = vi.fn(() => storage);
  const principalResolver: P2WorkspacePrincipalResolver = Object.freeze({
    async resolve() {
      return {
        authIssuer: "urn:p2:s1f:unit",
        authSubject: "owner@example.test",
        workspaceId: WORKSPACE_ID,
      };
    },
  });

  return {
    api: createP2SourceSnapshotHttpHandlers({
      database,
      principalResolver,
      createObjectStorage: storageFactory,
      createRequestId: () => "request-unit",
    }),
    sourceSnapshotCreate,
    storage,
    storageFactory,
  };
}

function createStorage() {
  return {
    putObject: vi.fn<(object: StoredObject) => Promise<void>>(async () => undefined),
    getObject: vi.fn<(key: string) => Promise<RetrievedObject>>(async () => ({
      body: new Uint8Array(),
      contentType: "application/octet-stream",
    })),
    deleteObject: vi.fn<(key: string) => Promise<void>>(async () => undefined),
    checkConnection: vi.fn(async () => undefined),
  } satisfies ObjectStorage;
}

async function validFormData(): Promise<FormData> {
  const bytes = await sharp({
    create: {
      width: 2,
      height: 3,
      channels: 4,
      background: { r: 12, g: 34, b: 56, alpha: 1 },
    },
  }).png().toBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const form = new FormData();
  form.set("sourceKind", "PRODUCT_SOURCE");
  form.set("file", new File([body], "product.png", { type: "image/png" }));
  return form;
}

function request(form: FormData): Request {
  return new Request("https://example.test/api/p2/source-snapshots", {
    method: "POST",
    body: form,
  });
}

function context(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function databaseThatMustNotBeRead(): DatabaseClient {
  return new Proxy({}, {
    get() { throw new Error("DATABASE_MUST_NOT_BE_READ"); },
  }) as DatabaseClient;
}
