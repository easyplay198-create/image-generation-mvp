import { describe, expect, it } from "vitest";

import { Prisma } from "../../src/generated/prisma/client";
import {
  P2AuthContextError,
  type P2WorkspacePrincipalResolver,
} from "../../src/auth/workspace-membership-scope";
import { createP2ProductProjectHttpHandlers } from "../../src/http/p2-product-project-api";
import type { DatabaseClient } from "../../src/storage/database";

const PRINCIPAL = Object.freeze({
  authIssuer: "urn:test:unit",
  authSubject: "owner@example.test",
  workspaceId: "workspace-unit",
});

describe("P2 S1G ProductProject HTTP boundary", () => {
  it("fails authentication before reading the body or business database", async () => {
    let bodyRead = false;
    const request = Object.freeze({
      headers: new Headers({
        "content-type": "application/json",
        "Idempotency-Key": "unit-key-0001",
      }),
      async text() {
        bodyRead = true;
        throw new Error("BODY_MUST_NOT_BE_READ");
      },
    }) as unknown as Request;

    const response = await createP2ProductProjectHttpHandlers({
      database: databaseThatMustNotBeRead(),
      createRequestId: () => "unit-request-auth",
    }).post(request);

    expect(response.status).toBe(401);
    expect(bodyRead).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED", requestId: "unit-request-auth" },
    });
  });

  it("fails authorization before reading the body or starting a transaction", async () => {
    let bodyRead = false;
    const response = await createP2ProductProjectHttpHandlers({
      database: databaseThatMustNotBeRead(),
      principalResolver: Object.freeze({
        async resolve() {
          throw new P2AuthContextError(
            "FORBIDDEN_SCOPE",
            403,
            "Forbidden unit scope.",
          );
        },
      }),
      createRequestId: () => "unit-request-forbidden",
    }).post({
      headers: new Headers({
        "content-type": "application/json",
        "Idempotency-Key": "unit-key-0002",
      }),
      async text() {
        bodyRead = true;
        return "{}";
      },
    } as Request);

    expect(response.status).toBe(403);
    expect(bodyRead).toBe(false);
  });

  it.each([
    ["missing content type", rawRequest("{}", "unit-key-0003", false)],
    ["missing idempotency key", rawRequest("{}", undefined)],
    ["unknown field", rawRequest('{"workspaceId":"forged"}', "unit-key-0004")],
    [
      "duplicate displayName",
      rawRequest(
        '{"displayName":"first","displayName":"second"}',
        "unit-key-0005",
      ),
    ],
    [
      "embedded NUL",
      rawRequest(JSON.stringify({ displayName: "bad\0name" }), "unit-key-0006"),
    ],
    ["non-object JSON", rawRequest("[]", "unit-key-0007")],
  ])("rejects %s before business database access", async (_label, request) => {
    const response = await createP2ProductProjectHttpHandlers({
      database: databaseThatMustNotBeRead(),
      principalResolver: principalResolver(),
      createRequestId: () => "unit-request-invalid",
    }).post(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("normalizes, safely projects, and exactly replays the original response", async () => {
    const harness = createDatabaseHarness();
    let requestSequence = 0;
    const api = createP2ProductProjectHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => `unit-request-${++requestSequence}`,
    });

    const first = await api.post(
      jsonRequest({ displayName: "  Product card  " }, "unit-key-0008"),
    );
    const firstBody = await first.json();
    const replay = await api.post(
      jsonRequest({ displayName: "Product card" }, "unit-key-0008"),
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(firstBody).toMatchObject({
      requestId: "unit-request-1",
      result: {
        displayName: "Product card",
        status: "DRAFT",
        archivedAt: null,
      },
    });
    expect(Object.keys(firstBody.result).sort()).toEqual([
      "archivedAt",
      "createdAt",
      "displayName",
      "projectId",
      "status",
    ]);
    expect(harness.projects).toHaveLength(1);
    expect(harness.records).toHaveLength(1);
  });

  it("replays a concurrent winner after a P2002 without meta.target", async () => {
    const winnerBody = {
      result: {
        projectId: "p2_project_concurrent_winner",
        displayName: "Concurrent project",
        status: "DRAFT",
        archivedAt: null,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      requestId: "unit-request-concurrent-winner",
    };
    const harness = createConcurrentConflictHarness(winnerBody);
    const response = await createP2ProductProjectHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "unit-request-concurrent-loser",
    }).post(
      jsonRequest(
        { displayName: "Concurrent project" },
        "unit-key-concurrent-0001",
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(winnerBody);
    expect(harness.transactionCount()).toBe(2);
  });

  it("does not replay a P2002 raised before the idempotency insert", async () => {
    const harness = createConcurrentConflictHarness(
      {},
      "product-project-create",
    );
    const response = await createP2ProductProjectHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "unit-request-unrelated-p2002",
    }).post(jsonRequest({}, "unit-key-unrelated-p2002"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    expect(harness.transactionCount()).toBe(1);
  });

  it("uses the frozen default display name for omitted or blank input", async () => {
    const harness = createDatabaseHarness();
    const api = createP2ProductProjectHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "unit-request-default",
    });

    const omitted = await api.post(jsonRequest({}, "unit-key-0009"));
    const blank = await api.post(
      jsonRequest({ displayName: "   " }, "unit-key-0010"),
    );

    expect((await omitted.json()).result.displayName).toBe("Untitled product");
    expect((await blank.json()).result.displayName).toBe("Untitled product");
  });

  it("returns a safe card and validates the route identifier after auth", async () => {
    const harness = createDatabaseHarness({
      snapshots: [
        {
          sourceKind: "PRODUCT_SOURCE",
          validationStatus: "VALID",
          lifecycleStatus: "ACTIVE",
        },
        {
          sourceKind: "PRODUCT_REFERENCE",
          validationStatus: "ACTION_REQUIRED",
          lifecycleStatus: "ACTIVE",
        },
      ],
    });
    const api = createP2ProductProjectHttpHandlers({
      database: harness.database,
      principalResolver: principalResolver(),
      createRequestId: () => "unit-request-card",
    });
    const created = await api.post(jsonRequest({}, "unit-key-0011"));
    const projectId = (await created.json()).result.projectId as string;

    const cardResponse = await api.get(
      new Request("https://example.test/api/p2/projects/item"),
      { params: Promise.resolve({ projectId }) },
    );
    expect(cardResponse.status).toBe(200);
    await expect(cardResponse.json()).resolves.toMatchObject({
      card: {
        project: { projectId, displayName: "Untitled product" },
        activeTruthRevision: null,
        sourceSummary: {
          totalSnapshots: 2,
          activeValidProductSources: 1,
          activeValidReferences: 0,
          actionRequiredSnapshots: 1,
        },
      },
    });

    const invalid = await api.get(new Request("https://example.test"), {
      params: Promise.resolve({ projectId: " invalid " }),
    });
    expect(invalid.status).toBe(400);
  });

  it("maps unexpected failures to a generic internal error", async () => {
    const response = await createP2ProductProjectHttpHandlers({
      database: {
        async $transaction() {
          throw new Error("sensitive database detail");
        },
      } as unknown as DatabaseClient,
      principalResolver: principalResolver(),
      createRequestId: () => "unit-request-internal",
    }).post(jsonRequest({}, "unit-key-0012"));

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("sensitive database detail");
  });
});

function principalResolver(): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      return PRINCIPAL;
    },
  });
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
  return new Request("https://example.test/api/p2/projects", {
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

function createConcurrentConflictHarness(
  winnerBody: Record<string, unknown>,
  failurePoint: "idempotency-create" | "product-project-create" =
    "idempotency-create",
) {
  let transactionCount = 0;
  let rawQueryCount = 0;
  const p2002 = new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the (not available)",
    {
      code: "P2002",
      clientVersion: "7.9.1",
      meta: {
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            kind: "UniqueConstraintViolation",
            originalCode: "23505",
          },
        },
      },
    },
  );
  const requestFingerprint =
    "70acf99d3e294d37022bac8e5cfd2b0355220948601f32ae73e81516fc3a05db";
  const replayRecord = {
    requestFingerprint,
    status: "SUCCEEDED" as const,
    responseStatus: 201,
    responseBody: winnerBody,
  };

  const transaction = {
    async $queryRaw() {
      const result =
        rawQueryCount++ % 2 === 0
          ? [{ userActorId: "actor-unit", status: "ACTIVE" }]
          : [
              {
                membershipId: "membership-unit",
                workspaceId: PRINCIPAL.workspaceId,
                userActorId: "actor-unit",
                role: "OWNER",
                membershipStatus: "ACTIVE",
                workspaceStatus: "ACTIVE",
              },
            ];
      return result;
    },
    productProject: {
      async create({ data }: { data: Record<string, unknown> }) {
        if (failurePoint === "product-project-create") throw p2002;
        return {
          ...data,
          archivedAt: null,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        };
      },
    },
    p2IdempotencyRecord: {
      async findUnique() {
        return transactionCount === 1 ? null : replayRecord;
      },
      async create() {
        throw p2002;
      },
      async update() {
        throw new Error("UNIT_IDEMPOTENCY_UPDATE_MUST_NOT_RUN");
      },
    },
  };
  const database = {
    async $transaction(
      operation: (value: typeof transaction) => Promise<unknown>,
    ) {
      transactionCount += 1;
      rawQueryCount = 0;
      return operation(transaction);
    },
  } as unknown as DatabaseClient;

  return {
    database,
    transactionCount: () => transactionCount,
  };
}

type SnapshotSummaryRecord = {
  sourceKind:
    | "PRODUCT_SOURCE"
    | "PRODUCT_REFERENCE"
    | "BRAND_REFERENCE"
    | "LOGO_REFERENCE"
    | "OTHER_REFERENCE";
  validationStatus: "PENDING" | "VALID" | "ACTION_REQUIRED" | "INVALID";
  lifecycleStatus: "ACTIVE" | "DELETED";
};

function createDatabaseHarness(
  options: Readonly<{ snapshots?: SnapshotSummaryRecord[] }> = {},
) {
  const projects: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  let rawQueryCount = 0;
  const transaction = {
    async $queryRaw() {
      const result =
        rawQueryCount++ % 2 === 0
          ? [{ userActorId: "actor-unit", status: "ACTIVE" }]
          : [
              {
                membershipId: "membership-unit",
                workspaceId: PRINCIPAL.workspaceId,
                userActorId: "actor-unit",
                role: "OWNER",
                membershipStatus: "ACTIVE",
                workspaceStatus: "ACTIVE",
              },
            ];
      return result;
    },
    productProject: {
      async create({ data }: { data: Record<string, unknown> }) {
        const project = {
          ...data,
          archivedAt: null,
          createdAt: new Date("2026-08-31T00:00:00.000Z"),
          activeTruthRevision: null,
        };
        projects.push(project);
        return project;
      },
      async findFirst({ where }: { where: { projectId: string } }) {
        return (
          projects.find((project) => project.projectId === where.projectId) ??
          null
        );
      },
    },
    sourceSnapshot: {
      async findMany() {
        return options.snapshots ?? [];
      },
    },
    p2IdempotencyRecord: {
      async findUnique({
        where,
      }: {
        where: {
          workspaceId_operation_idempotencyKey: {
            idempotencyKey: string;
          };
        };
      }) {
        const key =
          where.workspaceId_operation_idempotencyKey.idempotencyKey;
        return records.find((record) => record.idempotencyKey === key) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        records.push({
          ...data,
          responseStatus: null,
          responseBody: null,
        });
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
        if (!record) throw new Error("UNIT_RECORD_NOT_FOUND");
        Object.assign(record, data);
        return record;
      },
    },
  };
  const database = {
    async $transaction(
      operation: (value: typeof transaction) => Promise<unknown>,
    ) {
      rawQueryCount = 0;
      return operation(transaction);
    },
  } as unknown as DatabaseClient;

  return { database, projects, records };
}
