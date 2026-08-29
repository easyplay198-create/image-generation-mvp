import { randomUUID } from "node:crypto";

import {
  withP2WorkspaceMembershipScope,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import { validateImageUpload } from "@/src/domain/asset-upload";
import type { DatabaseClient } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

const SOURCE_KINDS = [
  "PRODUCT_SOURCE",
  "PRODUCT_REFERENCE",
  "BRAND_REFERENCE",
  "LOGO_REFERENCE",
  "OTHER_REFERENCE",
] as const;

export type P2SourceSnapshotKind = (typeof SOURCE_KINDS)[number];

export type P2SourceSnapshotErrorCode =
  | "INVALID_SOURCE_KIND"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_NOT_WRITABLE";

export class P2SourceSnapshotError extends Error {
  constructor(readonly code: P2SourceSnapshotErrorCode) {
    super(
      code === "INVALID_SOURCE_KIND"
        ? "Source kind is invalid."
        : code === "PROJECT_NOT_WRITABLE"
          ? "Product project does not accept SourceSnapshots in its current state."
          : "Product project does not exist in the active Workspace.",
    );
    this.name = "P2SourceSnapshotError";
  }
}

export class P2SourceSnapshotCompensationError extends Error {
  constructor(
    readonly databaseError: unknown,
    readonly cleanupError: unknown,
  ) {
    super("SourceSnapshot persistence failed and test-storage cleanup also failed.");
    this.name = "P2SourceSnapshotCompensationError";
  }
}

export type P2SourceSnapshotResource = Readonly<{
  sourceSnapshotId: string;
  workspaceId: string;
  projectId: string;
  sourceKind: P2SourceSnapshotKind;
  mediaType: string;
  byteSize: number;
  contentDigest: string;
  validationStatus: "VALID";
  lifecycleStatus: "ACTIVE";
  capturedAt: Date;
  createdByActorId: string;
}>;

export async function registerP2SourceSnapshot(
  database: DatabaseClient,
  storage: ObjectStorage,
  input: Readonly<{
    projectId: string;
    sourceKind: unknown;
    file: FormDataEntryValue | null;
  }>,
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2SourceSnapshotResource> {
  let storedKey: string | undefined;

  try {
    return await withP2WorkspaceMembershipScope(
      database,
      async (transaction, context) => {
        const project = await transaction.productProject.findFirst({
          where: {
            projectId: input.projectId,
            workspaceId: context.workspaceId,
          },
          select: { status: true },
        });

        if (!project) {
          throw new P2SourceSnapshotError("PROJECT_NOT_FOUND");
        }
        if (project.status !== "DRAFT" && project.status !== "ACTIVE") {
          throw new P2SourceSnapshotError("PROJECT_NOT_WRITABLE");
        }

        const sourceKind = parseSourceKind(input.sourceKind);
        const image = await validateImageUpload(input.file);
        const sourceSnapshotId = `p2_source_${randomUUID()}`;
        const storageLocator = [
          "p2",
          context.workspaceId,
          input.projectId,
          "source-snapshots",
          `${sourceSnapshotId}.${image.extension}`,
        ].join("/");

        await storage.putObject({
          key: storageLocator,
          body: image.body,
          contentType: image.mimeType,
          metadata: {
            sha256: image.sha256,
            sourceKind,
          },
        });
        storedKey = storageLocator;

        const snapshot = await transaction.sourceSnapshot.create({
          data: {
            sourceSnapshotId,
            workspaceId: context.workspaceId,
            projectId: input.projectId,
            sourceKind,
            mediaType: image.mimeType,
            byteSize: BigInt(image.byteSize),
            contentDigest: image.sha256,
            storageLocator,
            validationStatus: "VALID",
            lifecycleStatus: "ACTIVE",
            createdByActorId: context.userActorId,
          },
        });

        return toP2SourceSnapshotResource(snapshot);
      },
      principalResolver,
    );
  } catch (databaseError) {
    if (!storedKey) throw databaseError;

    try {
      await storage.deleteObject(storedKey);
    } catch (cleanupError) {
      throw new P2SourceSnapshotCompensationError(
        databaseError,
        cleanupError,
      );
    }

    throw databaseError;
  }
}

function parseSourceKind(input: unknown): P2SourceSnapshotKind {
  if (
    typeof input !== "string" ||
    !(SOURCE_KINDS as readonly string[]).includes(input)
  ) {
    throw new P2SourceSnapshotError("INVALID_SOURCE_KIND");
  }

  return input as P2SourceSnapshotKind;
}

function toP2SourceSnapshotResource(snapshot: {
  sourceSnapshotId: string;
  workspaceId: string;
  projectId: string;
  sourceKind: P2SourceSnapshotKind;
  mediaType: string;
  byteSize: bigint;
  contentDigest: string;
  validationStatus: "PENDING" | "VALID" | "ACTION_REQUIRED" | "INVALID";
  lifecycleStatus: "ACTIVE" | "DELETED";
  capturedAt: Date;
  createdByActorId: string;
}): P2SourceSnapshotResource {
  if (
    snapshot.validationStatus !== "VALID" ||
    snapshot.lifecycleStatus !== "ACTIVE"
  ) {
    throw new Error("S1B registration must create a VALID and ACTIVE snapshot.");
  }

  return Object.freeze({
    sourceSnapshotId: snapshot.sourceSnapshotId,
    workspaceId: snapshot.workspaceId,
    projectId: snapshot.projectId,
    sourceKind: snapshot.sourceKind,
    mediaType: snapshot.mediaType,
    byteSize: Number(snapshot.byteSize),
    contentDigest: snapshot.contentDigest,
    validationStatus: snapshot.validationStatus,
    lifecycleStatus: snapshot.lifecycleStatus,
    capturedAt: snapshot.capturedAt,
    createdByActorId: snapshot.createdByActorId,
  });
}
