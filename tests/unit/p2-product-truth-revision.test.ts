import { describe, expect, it, vi } from "vitest";

import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import {
  activateP2ProductTruthRevision,
  createP2ProductTruthRevision,
} from "../../src/truth/product-truth-revision";
import type { DatabaseClient } from "../../src/storage/database";

const WORKSPACE_ID = "p2-unit-truth-workspace";
const ACTOR_ID = "p2-unit-truth-actor";
const MEMBERSHIP_ID = "p2-unit-truth-membership";
const PROJECT_ID = "p2-unit-truth-project";
const SOURCE_ID = "p2-unit-truth-source";
const SOURCE_COMMIT = "a".repeat(40);

describe("P2 S1C product truth revisions", () => {
  it.each([
    [{}, "empty truth body"],
    [{ name: " valid ", unexpected: "field" }, "unknown truth key"],
    [{ name: " padded " }, "non-canonical string"],
    [{ interfaces: ["USB-C", "USB-C"] }, "duplicate list value"],
    [{ parameters: { voltage: 12 } }, "non-string parameter"],
  ])("rejects %s before opening a transaction (%s)", async (truthBody, reason) => {
    expect(reason).toBeTypeOf("string");
    const harness = createHarness();

    await expect(
      createP2ProductTruthRevision(
        harness.database,
        createInput({ truthBody }),
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(harness.runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [[binding({ sourceRole: "PRODUCT_SUPPORTING" })], "missing primary"],
    [
      [binding(), binding({ sourceSnapshotId: SOURCE_ID, sortOrder: 1 })],
      "duplicate source",
    ],
    [
      [binding(), binding({ sourceSnapshotId: "source-2", sortOrder: 0 })],
      "duplicate order",
    ],
    [
      [binding({ sourceRole: "REFERENCE" })],
      "invalid role",
    ],
  ])("rejects invalid bindings (%s: %s)", async (sourceBindings, reason) => {
    expect(reason).toBeTypeOf("string");
    const harness = createHarness();

    await expect(
      createP2ProductTruthRevision(
        harness.database,
        createInput({ sourceBindings }),
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(harness.runTransaction).not.toHaveBeenCalled();
  });

  it("creates one draft and its source links without hidden activation", async () => {
    const harness = createHarness();

    const result = await createP2ProductTruthRevision(
      harness.database,
      createInput({
        truthBody: {
          name: "Portable inflator",
          interfaces: ["USB-C"],
          parameters: { voltage: "12 V" },
        },
      }),
      harness.principalResolver,
    );

    expect(result.revision).toMatchObject({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      revisionNumber: 1,
      productContinuity: "SAME_PRODUCT",
      status: "DRAFT",
      parentRevisionId: null,
      activatedAt: null,
    });
    expect(result.sourceBindings).toHaveLength(1);
    expect(result.sourceBindings[0]).toMatchObject({
      sourceSnapshotId: SOURCE_ID,
      sourceRole: "PRODUCT_PRIMARY",
      sortOrder: 0,
      linkStatus: "ACTIVE",
    });
    expect(harness.truthRevisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "DRAFT",
        createdByActorId: ACTOR_ID,
      }),
    });
    expect(harness.sourceLinkCreateMany).toHaveBeenCalledOnce();
    expect(harness.projectUpdate).not.toHaveBeenCalled();
    expect(harness.eventCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["PRODUCT_REFERENCE", "ACTIVE", "VALID", "SOURCE_REVOKED"],
    ["PRODUCT_SOURCE", "DELETED", "VALID", "SOURCE_REVOKED"],
    ["PRODUCT_SOURCE", "ACTIVE", "ACTION_REQUIRED", "SOURCE_ACTION_REQUIRED"],
  ])(
    "rejects ineligible source %s/%s/%s",
    async (sourceKind, lifecycleStatus, validationStatus, code) => {
      const harness = createHarness({
        snapshot: { sourceKind, lifecycleStatus, validationStatus },
      });

      await expect(
        createP2ProductTruthRevision(
          harness.database,
          createInput(),
          harness.principalResolver,
        ),
      ).rejects.toMatchObject({ code });
      expect(harness.truthRevisionCreate).not.toHaveBeenCalled();
      expect(harness.sourceLinkCreateMany).not.toHaveBeenCalled();
    },
  );

  it("requires exact active pointer and parent for a later draft", async () => {
    const harness = createHarness({ activeTruthRevisionId: "active-truth" });

    await expect(
      createP2ProductTruthRevision(
        harness.database,
        createInput({
          expectedCurrentRevisionId: null,
          parentRevisionId: "active-truth",
        }),
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });

    await expect(
      createP2ProductTruthRevision(
        harness.database,
        createInput({
          expectedCurrentRevisionId: "active-truth",
          parentRevisionId: "wrong-parent",
        }),
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(harness.truthRevisionCreate).not.toHaveBeenCalled();
  });

  it("atomically activates a draft, supersedes the previous revision, and records evidence", async () => {
    const harness = createHarness({
      activeTruthRevisionId: "active-truth",
      targetTruthRevisionId: "draft-truth",
      targetParentRevisionId: "active-truth",
    });

    const result = await activateP2ProductTruthRevision(
      harness.database,
      activationInput({ expectedCurrentRevisionId: "active-truth" }),
      harness.principalResolver,
    );

    expect(result.project).toEqual({
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      activeTruthRevisionId: "draft-truth",
    });
    expect(result.activatedRevision).toMatchObject({
      productTruthRevisionId: "draft-truth",
      status: "ACTIVE",
      parentRevisionId: "active-truth",
    });
    expect(result.previousRevision).toMatchObject({
      productTruthRevisionId: "active-truth",
      status: "SUPERSEDED",
    });
    expect(harness.truthRevisionUpdateMany).toHaveBeenCalledTimes(2);
    expect(harness.projectUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { activeTruthRevisionId: "draft-truth" },
    });
    expect(harness.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "truth_revision.activated.v1",
        eventSchemaVersion: 1,
        requestId: "request-1",
        correlationId: "correlation-1",
        sourceCommit: SOURCE_COMMIT,
        productVersion: "0.1.0",
        eventBody: {
          truthRevisionId: "draft-truth",
          parentRevisionId: "active-truth",
          previousActiveTruthRevisionId: "active-truth",
          projectId: PROJECT_ID,
        },
      }),
    });
  });

  it("activates when at least one active primary source remains eligible", async () => {
    const harness = createHarness({
      activationPrimarySources: [
        {
          sourceSnapshotId: "action-required-primary",
          sourceKind: "PRODUCT_SOURCE",
          lifecycleStatus: "ACTIVE",
          validationStatus: "ACTION_REQUIRED",
        },
        {
          sourceSnapshotId: "valid-primary",
          sourceKind: "PRODUCT_SOURCE",
          lifecycleStatus: "ACTIVE",
          validationStatus: "VALID",
        },
      ],
    });

    await expect(
      activateP2ProductTruthRevision(
        harness.database,
        activationInput(),
        harness.principalResolver,
      ),
    ).resolves.toMatchObject({
      activatedRevision: { status: "ACTIVE" },
    });
    expect(harness.eventCreate).toHaveBeenCalledOnce();
  });

  it.each([
    [
      [{
        sourceSnapshotId: "action-required-primary",
        sourceKind: "PRODUCT_SOURCE",
        lifecycleStatus: "ACTIVE",
        validationStatus: "ACTION_REQUIRED",
      }],
      "SOURCE_ACTION_REQUIRED",
    ],
    [
      [{
        sourceSnapshotId: "revoked-primary",
        sourceKind: "PRODUCT_SOURCE",
        lifecycleStatus: "DELETED",
        validationStatus: "VALID",
      }],
      "SOURCE_REVOKED",
    ],
    [[], "SOURCE_REVOKED"],
  ])(
    "rejects activation without an eligible primary source (%s)",
    async (activationPrimarySources, code) => {
      const harness = createHarness({ activationPrimarySources });

      await expect(
        activateP2ProductTruthRevision(
          harness.database,
          activationInput(),
          harness.principalResolver,
        ),
      ).rejects.toMatchObject({ code });
      expect(harness.truthRevisionUpdateMany).not.toHaveBeenCalled();
      expect(harness.projectUpdate).not.toHaveBeenCalled();
      expect(harness.eventCreate).not.toHaveBeenCalled();
    },
  );

  it.each(["DIFFERENT_PRODUCT", "REVIEW_REQUIRED"])(
    "does not silently activate %s continuity",
    async (productContinuity) => {
      const harness = createHarness({ productContinuity });

      await expect(
        activateP2ProductTruthRevision(
          harness.database,
          activationInput(),
          harness.principalResolver,
        ),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      expect(harness.truthRevisionUpdateMany).not.toHaveBeenCalled();
      expect(harness.projectUpdate).not.toHaveBeenCalled();
      expect(harness.eventCreate).not.toHaveBeenCalled();
    },
  );

  it("fails closed on replay and writes no duplicate event", async () => {
    const harness = createHarness({
      activeTruthRevisionId: "draft-truth",
      targetTruthRevisionId: "draft-truth",
      targetStatus: "ACTIVE",
    });

    await expect(
      activateP2ProductTruthRevision(
        harness.database,
        activationInput({ expectedCurrentRevisionId: "draft-truth" }),
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(harness.eventCreate).not.toHaveBeenCalled();
  });

  it("rejects fabricated event evidence before opening a transaction", async () => {
    const harness = createHarness();

    await expect(
      activateP2ProductTruthRevision(
        harness.database,
        activationInput({ sourceCommit: "not-a-commit" }),
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(harness.runTransaction).not.toHaveBeenCalled();
  });
});

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    expectedCurrentRevisionId: null,
    parentRevisionId: null,
    truthBody: { name: "Portable inflator" },
    productContinuity: "SAME_PRODUCT",
    sourceBindings: [binding()],
    ...overrides,
  };
}

function activationInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    truthRevisionId: "draft-truth",
    expectedCurrentRevisionId: null,
    requestId: "request-1",
    correlationId: "correlation-1",
    sourceCommit: SOURCE_COMMIT,
    productVersion: "0.1.0",
    ...overrides,
  };
}

function binding(overrides: Record<string, unknown> = {}) {
  return {
    sourceSnapshotId: SOURCE_ID,
    sourceRole: "PRODUCT_PRIMARY",
    sortOrder: 0,
    ...overrides,
  };
}

function createHarness(options: {
  activeTruthRevisionId?: string | null;
  targetTruthRevisionId?: string;
  targetParentRevisionId?: string | null;
  targetStatus?: "DRAFT" | "ACTIVE";
  productContinuity?: string;
  snapshot?: {
    sourceSnapshotId?: string;
    sourceKind: string;
    lifecycleStatus: string;
    validationStatus: string;
  };
  activationPrimarySources?: Array<{
    sourceSnapshotId: string;
    sourceKind: string;
    lifecycleStatus: string;
    validationStatus: string;
  }>;
} = {}) {
  const activeTruthRevisionId = options.activeTruthRevisionId ?? null;
  const targetTruthRevisionId = options.targetTruthRevisionId ?? "draft-truth";
  const target = truthRecord({
    productTruthRevisionId: targetTruthRevisionId,
    parentRevisionId: options.targetParentRevisionId ?? null,
    status: options.targetStatus ?? "DRAFT",
    productContinuity: options.productContinuity ?? "SAME_PRODUCT",
  });
  const previous = truthRecord({
    productTruthRevisionId: activeTruthRevisionId ?? "unused-active",
    revisionNumber: 1,
    status: "ACTIVE",
    activatedAt: new Date("2026-08-29T01:00:00.000Z"),
  });
  const defaultSource = {
    sourceSnapshotId: options.snapshot?.sourceSnapshotId ?? SOURCE_ID,
    sourceKind: options.snapshot?.sourceKind ?? "PRODUCT_SOURCE",
    validationStatus: options.snapshot?.validationStatus ?? "VALID",
    lifecycleStatus: options.snapshot?.lifecycleStatus ?? "ACTIVE",
  };
  const queryRaw = vi.fn(async (query: unknown): Promise<unknown[]> => {
    const sql =
      (query as { strings?: readonly string[] }).strings?.join(" ") ?? "";
    if (sql.includes('FROM "UserActor"')) {
      return [{ userActorId: ACTOR_ID, status: "ACTIVE" }];
    }
    if (sql.includes('FROM "Membership"')) {
      return [{
        membershipId: MEMBERSHIP_ID,
        workspaceId: WORKSPACE_ID,
        userActorId: ACTOR_ID,
        role: "OWNER",
        membershipStatus: "ACTIVE",
        workspaceStatus: "ACTIVE",
      }];
    }
    if (sql.includes('FROM "ProductProject"')) {
      return [{
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        status: "DRAFT",
        activeTruthRevisionId,
      }];
    }
    if (sql.includes('FROM "TruthRevisionSourceLink"')) {
      return options.activationPrimarySources ?? [defaultSource];
    }
    if (sql.includes('FROM "SourceSnapshot"')) {
      return [defaultSource];
    }
    throw new Error(`Unexpected unit SQL query: ${sql}`);
  });

  const truthRevisionCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    activatedAt: null,
    supersededAt: null,
    invalidatedAt: null,
    createdAt: new Date("2026-08-29T02:00:00.000Z"),
  }));
  const sourceLinkCreateMany = vi.fn(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
  const truthRevisionUpdateMany = vi.fn(async () => ({ count: 1 }));
  const projectUpdate = vi.fn(async () => undefined);
  const eventCreate = vi.fn(async () => undefined);

  const transaction = {
    $queryRaw: queryRaw,
    productTruthRevision: {
      aggregate: vi.fn(async () => ({ _max: { revisionNumber: null } })),
      create: truthRevisionCreate,
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.productTruthRevisionId === activeTruthRevisionId ? previous : target,
      ),
      updateMany: truthRevisionUpdateMany,
    },
    truthRevisionSourceLink: {
      createMany: sourceLinkCreateMany,
    },
    productProject: { update: projectUpdate },
    p2DomainEvent: { create: eventCreate },
  };
  const runTransaction = vi.fn(async (
    operation: (value: typeof transaction) => Promise<unknown>,
  ) => operation(transaction));
  const database = { $transaction: runTransaction } as unknown as DatabaseClient;
  const principalResolver: P2WorkspacePrincipalResolver = Object.freeze({
    async resolve() {
      return {
        authIssuer: "urn:p2:unit:truth",
        authSubject: "unit-truth-subject",
        workspaceId: WORKSPACE_ID,
      };
    },
  });

  return {
    database,
    eventCreate,
    principalResolver,
    projectUpdate,
    runTransaction,
    sourceLinkCreateMany,
    truthRevisionCreate,
    truthRevisionUpdateMany,
  };
}

function truthRecord(overrides: Record<string, unknown> = {}) {
  return {
    productTruthRevisionId: "draft-truth",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    revisionNumber: 2,
    truthBody: { name: "Portable inflator" },
    productContinuity: "SAME_PRODUCT",
    status: "DRAFT",
    parentRevisionId: null,
    createdByActorId: ACTOR_ID,
    activatedAt: null,
    supersededAt: null,
    invalidatedAt: null,
    createdAt: new Date("2026-08-29T02:00:00.000Z"),
    ...overrides,
  };
}
