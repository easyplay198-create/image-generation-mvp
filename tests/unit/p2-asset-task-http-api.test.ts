import { describe, expect, it } from "vitest";

import { Prisma } from "../../src/generated/prisma/client";
import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import { createP2AssetTaskHttpHandlers } from "../../src/http/p2-asset-task-api";
import type { DatabaseClient } from "../../src/storage/database";

const PRINCIPAL = Object.freeze({
  authIssuer: "urn:test:p2-s1h",
  authSubject: "owner@example.test",
  workspaceId: "workspace-unit-s1h",
});

const CREATE_BODY = Object.freeze({
  taskType: "INTERNAL_SINGLE_IMAGE",
  assetClass: "IMAGE",
  outputPurpose: "INTERNAL_TEST",
  truthRevisionId: "truth-unit-active",
  productSourceSnapshotId: "source-unit-product",
});

describe("P2 S1H internal single-image AssetTask HTTP boundary", () => {
  it("authenticates before reading the body or business database", async () => {
    let bodyRead = false;
    const request = Object.freeze({
      headers: new Headers({
        "content-type": "application/json",
        "Idempotency-Key": "s1h-unit-auth-0001",
      }),
      async text() {
        bodyRead = true;
        throw new Error("BODY_MUST_NOT_BE_READ");
      },
    }) as unknown as Request;

    const response = await createP2AssetTaskHttpHandlers({
      database: databaseThatMustNotBeRead(),
      createRequestId: () => "s1h-unit-request-auth",
    }).post(request, projectContext("project-unit"));

    expect(response.status).toBe(401);
    expect(bodyRead).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED", requestId: "s1h-unit-request-auth" },
    });
  });

  it.each([
    ["missing content type", rawRequest(JSON.stringify(CREATE_BODY), "s1h-unit-invalid-0001", false)],
    ["missing idempotency key", rawRequest(JSON.stringify(CREATE_BODY))],
    ["unknown field", jsonRequest({ ...CREATE_BODY, workspaceId: "forged" }, "s1h-unit-invalid-0002")],
    [
      "duplicate taskType",
      rawRequest(
        '{"taskType":"INTERNAL_SINGLE_IMAGE","taskType":"INTERNAL_SINGLE_IMAGE","assetClass":"IMAGE","outputPurpose":"INTERNAL_TEST","truthRevisionId":"truth-unit-active","productSourceSnapshotId":"source-unit-product"}',
        "s1h-unit-invalid-0003",
      ),
    ],
    ["wrong task type", jsonRequest({ ...CREATE_BODY, taskType: "PUBLIC_IMAGE" }, "s1h-unit-invalid-0004")],
    ["wrong asset class", jsonRequest({ ...CREATE_BODY, assetClass: "VIDEO" }, "s1h-unit-invalid-0005")],
    ["wrong output purpose", jsonRequest({ ...CREATE_BODY, outputPurpose: "PUBLIC" }, "s1h-unit-invalid-0006")],
    ["non-object JSON", rawRequest("[]", "s1h-unit-invalid-0007")],
  ])("rejects %s before starting a transaction", async (_label, request) => {
    const response = await createP2AssetTaskHttpHandlers({
      database: databaseThatMustNotBeRead(),
      principalResolver: principalResolver(),
      createRequestId: () => "s1h-unit-request-invalid",
    }).post(request, projectContext("project-unit"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("creates one QUEUED task, safely projects it, and exactly replays 202", async () => {
    const harness = createDatabaseHarness();
    let requestSequence = 0;
    const api = createP2AssetTaskHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => `s1h-unit-request-${++requestSequence}`,
    });

    const first = await api.post(
      jsonRequest(CREATE_BODY, "s1h-unit-create-0001"),
      projectContext("project-unit"),
    );
    const firstBody = await first.json();
    const replay = await api.post(
      jsonRequest(CREATE_BODY, "s1h-unit-create-0001"),
      projectContext("project-unit"),
    );

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(firstBody).toMatchObject({
      requestId: "s1h-unit-request-1",
      assetTask: {
        projectId: "project-unit",
        taskType: "INTERNAL_SINGLE_IMAGE",
        assetClass: "IMAGE",
        outputPurpose: "INTERNAL_TEST",
        truthRevisionId: "truth-unit-active",
        productSourceSnapshotId: "source-unit-product",
        status: "QUEUED",
        generationAttemptSummary: null,
        artifactRevisionSummary: null,
      },
    });
    expect(Object.keys(firstBody.assetTask).sort()).toEqual([
      "artifactRevisionSummary",
      "assetClass",
      "assetTaskId",
      "createdAt",
      "generationAttemptSummary",
      "outputPurpose",
      "productSourceSnapshotId",
      "projectId",
      "status",
      "taskType",
      "truthRevisionId",
    ]);
    expect(JSON.stringify(firstBody)).not.toContain("workspaceId");
    expect(JSON.stringify(firstBody)).not.toContain("createdByActorId");
    expect(harness.tasks).toHaveLength(1);
    expect(harness.records).toHaveLength(1);

    const conflict = await api.post(
      jsonRequest(
        { ...CREATE_BODY, truthRevisionId: "truth-unit-different" },
        "s1h-unit-create-0001",
      ),
      projectContext("project-unit"),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(harness.tasks).toHaveLength(1);
  });

  it("returns the same safe task resource from GET and hides missing tasks", async () => {
    const harness = createDatabaseHarness();
    const api = createP2AssetTaskHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "s1h-unit-get-request",
    });
    const created = await api.post(
      jsonRequest(CREATE_BODY, "s1h-unit-get-0001"),
      projectContext("project-unit"),
    );
    const createdBody = await created.json();
    const assetTaskId = createdBody.assetTask.assetTaskId as string;

    const found = await api.get(
      new Request("https://example.test"),
      taskContext("project-unit", assetTaskId),
    );
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toMatchObject({
      assetTask: createdBody.assetTask,
      requestId: "s1h-unit-get-request",
    });

    const missing = await api.get(
      new Request("https://example.test"),
      taskContext("project-unit", "p2_asset_task_missing"),
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "ASSET_TASK_NOT_FOUND" },
    });
  });

  it("rolls back and replays the concurrent winner only for idempotency-insert P2002", async () => {
    const harness = createP2002Harness("idempotency-create");
    const response = await createP2AssetTaskHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "s1h-unit-concurrent-loser",
    }).post(
      jsonRequest(CREATE_BODY, "s1h-unit-concurrent-0001"),
      projectContext("project-unit"),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "s1h-unit-concurrent-winner",
      assetTask: { assetTaskId: "p2_asset_task_concurrent_winner" },
    });
    expect(harness.transactionCount()).toBe(2);
  });

  it("does not reinterpret a business-create P2002 as an idempotency race", async () => {
    const harness = createP2002Harness("asset-task-create");
    const response = await createP2AssetTaskHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "s1h-unit-unrelated-p2002",
    }).post(
      jsonRequest(CREATE_BODY, "s1h-unit-unrelated-0001"),
      projectContext("project-unit"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    expect(harness.transactionCount()).toBe(1);
  });
});

function principalResolver(): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      return PRINCIPAL;
    },
  });
}

function projectContext(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function taskContext(projectId: string, assetTaskId: string) {
  return { params: Promise.resolve({ projectId, assetTaskId }) };
}

function jsonRequest(body: unknown, idempotencyKey: string): Request {
  return rawRequest(JSON.stringify(body), idempotencyKey);
}

function rawRequest(
  body: string,
  idempotencyKey?: string,
  includeContentType = true,
): Request {
  const headers = new Headers();
  if (includeContentType) headers.set("content-type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return new Request("https://example.test/api/p2/projects/project-unit/asset-tasks", {
    method: "POST",
    headers,
    body,
  });
}

function databaseThatMustNotBeRead(): DatabaseClient {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("DATABASE_MUST_NOT_BE_READ");
      },
    },
  ) as DatabaseClient;
}

function createDatabaseHarness() {
  const tasks: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  let rawQueryCount = 0;
  const transaction = {
    async $queryRaw() {
      return scopedRawQuery(++rawQueryCount);
    },
    assetTask: {
      async create({ data }: { data: Record<string, unknown> }) {
        const task = {
          ...data,
          createdAt: new Date("2026-09-02T00:00:00.000Z"),
        };
        tasks.push(task);
        return task;
      },
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return (
          tasks.find(
            (task) =>
              task.assetTaskId === where.assetTaskId &&
              task.workspaceId === where.workspaceId &&
              task.projectId === where.projectId,
          ) ?? null
        );
      },
    },
    p2IdempotencyRecord: {
      async findUnique({ where }: { where: Record<string, Record<string, string>> }) {
        const key = where.workspaceId_operation_idempotencyKey.idempotencyKey;
        return records.find((record) => record.idempotencyKey === key) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        records.push({ ...data, responseStatus: null, responseBody: null });
        return data;
      },
      async update({
        where,
        data,
      }: {
        where: { idempotencyRecordId: string };
        data: Record<string, unknown>;
      }) {
        const record = records.find(
          (candidate) =>
            candidate.idempotencyRecordId === where.idempotencyRecordId,
        );
        if (!record) throw new Error("UNIT_IDEMPOTENCY_RECORD_NOT_FOUND");
        Object.assign(record, data);
        return record;
      },
    },
  };
  const database = {
    async $transaction(operation: (value: typeof transaction) => Promise<unknown>) {
      rawQueryCount = 0;
      return operation(transaction);
    },
  } as unknown as DatabaseClient;

  return { database, tasks, records };
}

function createP2002Harness(
  failurePoint: "idempotency-create" | "asset-task-create",
) {
  let transactionCount = 0;
  let rawQueryCount = 0;
  let requestFingerprint = "";
  const p2002 = new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed without a stable target",
    { code: "P2002", clientVersion: "7.9.1" },
  );
  const winnerBody = {
    assetTask: {
      assetTaskId: "p2_asset_task_concurrent_winner",
      projectId: "project-unit",
      taskType: "INTERNAL_SINGLE_IMAGE",
      assetClass: "IMAGE",
      outputPurpose: "INTERNAL_TEST",
      truthRevisionId: "truth-unit-active",
      productSourceSnapshotId: "source-unit-product",
      status: "QUEUED",
      createdAt: "2026-09-02T00:00:00.000Z",
      generationAttemptSummary: null,
      artifactRevisionSummary: null,
    },
    requestId: "s1h-unit-concurrent-winner",
  };
  const transaction = {
    async $queryRaw() {
      return scopedRawQuery(++rawQueryCount);
    },
    assetTask: {
      async create({ data }: { data: Record<string, unknown> }) {
        if (failurePoint === "asset-task-create") throw p2002;
        return {
          ...data,
          createdAt: new Date("2026-09-02T00:00:00.000Z"),
        };
      },
    },
    p2IdempotencyRecord: {
      async findUnique() {
        if (transactionCount === 1) return null;
        return {
          requestFingerprint,
          status: "SUCCEEDED" as const,
          responseStatus: 202,
          responseBody: winnerBody,
        };
      },
      async create({ data }: { data: { requestFingerprint: string } }) {
        requestFingerprint = data.requestFingerprint;
        throw p2002;
      },
      async update() {
        throw new Error("UNIT_IDEMPOTENCY_UPDATE_MUST_NOT_RUN");
      },
    },
  };
  const database = {
    async $transaction(operation: (value: typeof transaction) => Promise<unknown>) {
      transactionCount += 1;
      rawQueryCount = 0;
      return operation(transaction);
    },
  } as unknown as DatabaseClient;
  return { database, transactionCount: () => transactionCount };
}

function scopedRawQuery(call: number) {
  if (call === 1) {
    return [{ userActorId: "actor-unit-s1h", status: "ACTIVE" }];
  }
  if (call === 2) {
    return [
      {
        membershipId: "membership-unit-s1h",
        workspaceId: PRINCIPAL.workspaceId,
        userActorId: "actor-unit-s1h",
        role: "OWNER",
        membershipStatus: "ACTIVE",
        workspaceStatus: "ACTIVE",
      },
    ];
  }
  return [
    {
      projectStatus: "DRAFT",
      activeTruthRevisionId: CREATE_BODY.truthRevisionId,
      truthRevisionStatus: "ACTIVE",
      linkStatus: "ACTIVE",
      sourceKind: "PRODUCT_SOURCE",
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
    },
  ];
}
