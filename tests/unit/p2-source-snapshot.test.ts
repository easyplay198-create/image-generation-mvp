import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import { MAX_UPLOAD_BYTES } from "../../src/domain/asset-upload";
import {
  createP2ProductProject,
  getP2ProductProject,
} from "../../src/projects/product-project";
import {
  P2SourceSnapshotCompensationError,
  registerP2SourceSnapshot,
} from "../../src/sources/source-snapshot";
import type { DatabaseClient } from "../../src/storage/database";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "../../src/storage/object-storage";

describe("P2 S1B scoped project and SourceSnapshot", () => {
  it("generates hidden project identities independently of the safe resource", async () => {
    const harness = createHarness();

    const first = await createP2ProductProject(
      harness.database,
      { displayName: "  Same visible name  " },
      harness.principalResolver,
    );
    const second = await createP2ProductProject(
      harness.database,
      { displayName: "Same visible name" },
      harness.principalResolver,
    );

    expect(first.displayName).toBe("Same visible name");
    expect(first.projectId).not.toBe(second.projectId);
    expect(first).not.toHaveProperty("skuIdentityKey");
    expect(first).not.toHaveProperty("ownerId");
    expect(first).not.toHaveProperty("activeTruthRevisionId");

    const createInputs = harness.productProjectCreate.mock.calls.map(
      ([request]) => request.data,
    );
    expect(createInputs[0].skuIdentityKey).not.toBe(
      createInputs[1].skuIdentityKey,
    );
    expect(createInputs[0].skuIdentityKey).not.toContain("Same visible name");
    expect(createInputs[0]).toMatchObject({
      workspaceId: TEST_WORKSPACE_ID,
      createdByActorId: TEST_ACTOR_ID,
      status: "DRAFT",
    });
  });

  it("uses a fixed default name and hides cross-Workspace project existence", async () => {
    const harness = createHarness();
    await expect(
      createP2ProductProject(
        harness.database,
        { displayName: "   " },
        harness.principalResolver,
      ),
    ).resolves.toMatchObject({ displayName: "Untitled product" });

    const hidden = createHarness({ projectExists: false });
    await expect(
      getP2ProductProject(
        hidden.database,
        "project-in-another-workspace",
        hidden.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });

    await expect(
      createP2ProductProject(
        harness.database,
        { displayName: "invalid\0name" },
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "INVALID_DISPLAY_NAME" });
  });

  it("rejects invalid image input before any storage or SourceSnapshot write", async () => {
    const harness = createHarness();
    const corrupt = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer],
      "corrupt.png",
      { type: "image/png" },
    );

    await expect(
      registerP2SourceSnapshot(
        harness.database,
        harness.storage,
        {
          projectId: TEST_PROJECT_ID,
          sourceKind: "PRODUCT_SOURCE",
          file: corrupt,
        },
        harness.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    expect(harness.storage.putObject).not.toHaveBeenCalled();
    expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
  });

  it("rejects empty, oversized, disguised, and invalid-kind input without writes", async () => {
    const empty = new File([], "empty.png", { type: "image/png" });
    const oversized = new File(
      [new ArrayBuffer(MAX_UPLOAD_BYTES + 1)],
      "oversized.png",
      { type: "image/png" },
    );
    const disguised = await createImageFile(
      "png",
      "disguised.jpg",
      "image/jpeg",
    );

    for (const [file, errorCode] of [
      [empty, "VALIDATION_FAILED"],
      [oversized, "FILE_TOO_LARGE"],
      [disguised, "UNSUPPORTED_FILE_TYPE"],
    ] as const) {
      const harness = createHarness();
      await expect(
        registerP2SourceSnapshot(
          harness.database,
          harness.storage,
          {
            projectId: TEST_PROJECT_ID,
            sourceKind: "PRODUCT_SOURCE",
            file,
          },
          harness.principalResolver,
        ),
      ).rejects.toMatchObject({ code: errorCode });
      expect(harness.storage.putObject).not.toHaveBeenCalled();
      expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
    }

    const invalidKind = createHarness();
    await expect(
      registerP2SourceSnapshot(
        invalidKind.database,
        invalidKind.storage,
        {
          projectId: TEST_PROJECT_ID,
          sourceKind: "GENERATED_OUTPUT",
          file: await createImageFile("png", "fixture.png", "image/png"),
        },
        invalidKind.principalResolver,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SOURCE_KIND" });
    expect(invalidKind.storage.putObject).not.toHaveBeenCalled();
    expect(invalidKind.sourceSnapshotCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["png", "fixture.png", "image/png"],
    ["jpeg", "fixture.jpeg", "image/jpeg"],
    ["webp", "fixture.webp", "image/webp"],
  ] as const)(
    "persists a verified %s with an exact private key and safe projection",
    async (format, fileName, mimeType) => {
      const harness = createHarness();
      const file = await createImageFile(format, fileName, mimeType);

      const result = await registerP2SourceSnapshot(
        harness.database,
        harness.storage,
        {
          projectId: TEST_PROJECT_ID,
          sourceKind: "PRODUCT_SOURCE",
          file,
        },
        harness.principalResolver,
      );

      expect(result).toMatchObject({
        workspaceId: TEST_WORKSPACE_ID,
        projectId: TEST_PROJECT_ID,
        sourceKind: "PRODUCT_SOURCE",
        mediaType: mimeType,
        byteSize: file.size,
        validationStatus: "VALID",
        lifecycleStatus: "ACTIVE",
        createdByActorId: TEST_ACTOR_ID,
      });
      expect(result.contentDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(result).not.toHaveProperty("storageLocator");

      const stored = harness.storage.putObject.mock.calls[0][0];
      expect(stored.key).toMatch(
        new RegExp(
          `^p2/${TEST_WORKSPACE_ID}/${TEST_PROJECT_ID}/source-snapshots/p2_source_[0-9a-f-]+\\.${format === "jpeg" ? "jpg" : format}$`,
        ),
      );
      expect(stored.contentType).toBe(mimeType);
      expect(stored.body).toHaveLength(file.size);
      expect(stored.metadata).toEqual({
        sha256: result.contentDigest,
        sourceKind: "PRODUCT_SOURCE",
      });
      expect(harness.sourceSnapshotCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storageLocator: stored.key,
          contentDigest: result.contentDigest,
          byteSize: BigInt(file.size),
          validationStatus: "VALID",
          lifecycleStatus: "ACTIVE",
        }),
      });
      expect(harness.storage.deleteObject).not.toHaveBeenCalled();
    },
  );

  it.each([
    [null, "PROJECT_NOT_FOUND"],
    ["BLOCKED", "PROJECT_NOT_WRITABLE"],
    ["ARCHIVED", "PROJECT_NOT_WRITABLE"],
  ] as const)(
    "rejects unavailable project state %s before storage",
    async (projectStatus, errorCode) => {
      const harness = createHarness({
        projectExists: projectStatus !== null,
        projectStatus: projectStatus ?? "DRAFT",
      });

      await expect(
        registerP2SourceSnapshot(
          harness.database,
          harness.storage,
          {
            projectId: TEST_PROJECT_ID,
            sourceKind: "PRODUCT_SOURCE",
            file: await createImageFile("png", "fixture.png", "image/png"),
          },
          harness.principalResolver,
        ),
      ).rejects.toMatchObject({ code: errorCode });
      expect(harness.storage.putObject).not.toHaveBeenCalled();
      expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
    },
  );

  it("does not write a row when injected storage fails", async () => {
    const harness = createHarness();
    const storageError = new Error("test storage failed");
    harness.storage.putObject.mockRejectedValue(storageError);

    await expect(
      registerP2SourceSnapshot(
        harness.database,
        harness.storage,
        {
          projectId: TEST_PROJECT_ID,
          sourceKind: "PRODUCT_SOURCE",
          file: await createImageFile("png", "fixture.png", "image/png"),
        },
        harness.principalResolver,
      ),
    ).rejects.toBe(storageError);
    expect(harness.sourceSnapshotCreate).not.toHaveBeenCalled();
    expect(harness.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("compensates the exact object key when transaction commit fails", async () => {
    const commitError = new Error("test commit failed");
    const harness = createHarness({ commitError });

    await expect(
      registerP2SourceSnapshot(
        harness.database,
        harness.storage,
        {
          projectId: TEST_PROJECT_ID,
          sourceKind: "PRODUCT_SOURCE",
          file: await createImageFile("png", "fixture.png", "image/png"),
        },
        harness.principalResolver,
      ),
    ).rejects.toBe(commitError);
    expect(harness.sourceSnapshotCreate).toHaveBeenCalledOnce();
    expect(harness.storage.deleteObject).toHaveBeenCalledWith(
      harness.storage.putObject.mock.calls[0][0].key,
    );
  });

  it("surfaces both transaction and cleanup failures", async () => {
    const commitError = new Error("test commit failed");
    const cleanupError = new Error("test cleanup failed");
    const harness = createHarness({ commitError });
    harness.storage.deleteObject.mockRejectedValue(cleanupError);

    const operation = registerP2SourceSnapshot(
      harness.database,
      harness.storage,
      {
        projectId: TEST_PROJECT_ID,
        sourceKind: "PRODUCT_SOURCE",
        file: await createImageFile("png", "fixture.png", "image/png"),
      },
      harness.principalResolver,
    );

    await expect(operation).rejects.toBeInstanceOf(
      P2SourceSnapshotCompensationError,
    );
    await expect(operation).rejects.toMatchObject({
      databaseError: commitError,
      cleanupError,
    });
  });

  it.each([
    "PRODUCT_REFERENCE",
    "BRAND_REFERENCE",
    "LOGO_REFERENCE",
    "OTHER_REFERENCE",
  ] as const)("records %s passively without generation behavior", async (sourceKind) => {
    const harness = createHarness();

    await expect(
      registerP2SourceSnapshot(
        harness.database,
        harness.storage,
        {
          projectId: TEST_PROJECT_ID,
          sourceKind,
          file: await createImageFile("png", "reference.png", "image/png"),
        },
        harness.principalResolver,
      ),
    ).resolves.toMatchObject({ sourceKind });

    expect(harness.sourceSnapshotCreate).toHaveBeenCalledOnce();
    expect(harness.storage.putObject).toHaveBeenCalledOnce();
    expect(harness.storage.deleteObject).not.toHaveBeenCalled();
    expect(Object.keys(harness.transaction).sort()).toEqual([
      "$queryRaw",
      "productProject",
      "sourceSnapshot",
    ]);
  });
});

const TEST_ACTOR_ID = "p2-unit-actor";
const TEST_WORKSPACE_ID = "p2-unit-workspace";
const TEST_MEMBERSHIP_ID = "p2-unit-membership";
const TEST_PROJECT_ID = "p2-unit-project";

function createHarness(options: {
  commitError?: Error;
  projectExists?: boolean;
  projectStatus?: "DRAFT" | "ACTIVE" | "BLOCKED" | "ARCHIVED";
} = {}) {
  let rawQueryCount = 0;
  const productProjectCreate = vi.fn(async (request: { data: Record<string, unknown> }) => ({
    ...request.data,
    archivedAt: null,
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
  }));
  const productProjectFindFirst = vi.fn(async (request: {
    select?: { status?: boolean };
  }) => {
    if (options.projectExists === false) return null;
    if (request.select) {
      return { status: options.projectStatus ?? "DRAFT" };
    }
    return {
      projectId: TEST_PROJECT_ID,
      workspaceId: TEST_WORKSPACE_ID,
      skuIdentityKey: "hidden-unit-key",
      displayName: "Unit project",
      status: options.projectStatus ?? "DRAFT",
      createdByActorId: TEST_ACTOR_ID,
      archivedAt: null,
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
    };
  });
  const sourceSnapshotCreate = vi.fn(async (request: { data: Record<string, unknown> }) => ({
    ...request.data,
    capturedAt: new Date("2026-08-29T00:01:00.000Z"),
  }));
  const transaction = {
    $queryRaw: vi.fn(async () => {
      rawQueryCount += 1;
      return rawQueryCount % 2 === 1
        ? [{ userActorId: TEST_ACTOR_ID, status: "ACTIVE" }]
        : [{
            membershipId: TEST_MEMBERSHIP_ID,
            workspaceId: TEST_WORKSPACE_ID,
            userActorId: TEST_ACTOR_ID,
            role: "OWNER",
            membershipStatus: "ACTIVE",
            workspaceStatus: "ACTIVE",
          }];
    }),
    productProject: {
      create: productProjectCreate,
      findFirst: productProjectFindFirst,
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
  const principalResolver: P2WorkspacePrincipalResolver = Object.freeze({
    async resolve() {
      return {
        authIssuer: "urn:p2:unit",
        authSubject: "unit-subject",
        workspaceId: TEST_WORKSPACE_ID,
      };
    },
  });

  return {
    database,
    principalResolver,
    productProjectCreate,
    sourceSnapshotCreate,
    storage: createStorage(),
    transaction,
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

async function createImageFile(
  format: "png" | "jpeg" | "webp",
  fileName: string,
  mimeType: string,
) {
  const bytes = await sharp({
    create: {
      width: 2,
      height: 3,
      channels: 4,
      background: { r: 30, g: 60, b: 90, alpha: 1 },
    },
  })[format]().toBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new File([body], fileName, { type: mimeType });
}
