import { randomUUID } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import {
  withP2WorkspaceMembershipScope,
  type P2AuthContext,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import type {
  DatabaseClient,
  TransactionClient,
} from "@/src/storage/database";

export type P2ProductProjectErrorCode =
  | "INVALID_DISPLAY_NAME"
  | "PROJECT_NOT_FOUND";

export class P2ProductProjectError extends Error {
  constructor(readonly code: P2ProductProjectErrorCode) {
    super(
      code === "INVALID_DISPLAY_NAME"
        ? "Product project display name is invalid."
        : "Product project does not exist in the active Workspace.",
    );
    this.name = "P2ProductProjectError";
  }
}

export type P2ProductProjectResource = Readonly<{
  projectId: string;
  workspaceId: string;
  displayName: string;
  status: "DRAFT" | "ACTIVE" | "BLOCKED" | "ARCHIVED";
  createdByActorId: string;
  archivedAt: Date | null;
  createdAt: Date;
}>;

export type P2ProductInformationCard = Readonly<{
  project: Readonly<{
    projectId: string;
    displayName: string;
    status: "DRAFT" | "ACTIVE" | "BLOCKED" | "ARCHIVED";
    archivedAt: Date | null;
    createdAt: Date;
  }>;
  activeTruthRevision: Readonly<{
    productTruthRevisionId: string;
    revisionNumber: number;
    truthBody: Prisma.JsonValue;
    productContinuity: "SAME_PRODUCT" | "DIFFERENT_PRODUCT" | "REVIEW_REQUIRED";
    status: "ACTIVE";
    parentRevisionId: string | null;
    activatedAt: Date;
    createdAt: Date;
  }> | null;
  sourceSummary: Readonly<{
    totalSnapshots: number;
    activeValidProductSources: number;
    activeValidReferences: number;
    actionRequiredSnapshots: number;
  }>;
}>;

export async function createP2ProductProject(
  database: DatabaseClient,
  input: Readonly<{ displayName?: string }> = Object.freeze({}),
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2ProductProjectResource> {
  return withP2WorkspaceMembershipScope(
    database,
    (transaction, context) =>
      createP2ProductProjectInScope(transaction, context, input),
    principalResolver,
  );
}

export async function createP2ProductProjectInScope(
  transaction: TransactionClient,
  context: P2AuthContext,
  input: Readonly<{ displayName?: unknown }> = Object.freeze({}),
): Promise<P2ProductProjectResource> {
  const project = await transaction.productProject.create({
    data: {
      projectId: `p2_project_${randomUUID()}`,
      workspaceId: context.workspaceId,
      skuIdentityKey: `p2_sku_${randomUUID()}`,
      displayName: normalizeP2ProductProjectDisplayName(input.displayName),
      status: "DRAFT",
      createdByActorId: context.userActorId,
    },
  });

  return toP2ProductProjectResource(project);
}

export async function getP2ProductProject(
  database: DatabaseClient,
  projectId: string,
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2ProductProjectResource> {
  return withP2WorkspaceMembershipScope(
    database,
    async (transaction, context) => {
      const project = await transaction.productProject.findFirst({
        where: {
          projectId,
          workspaceId: context.workspaceId,
        },
      });

      if (!project) {
        throw new P2ProductProjectError("PROJECT_NOT_FOUND");
      }

      return toP2ProductProjectResource(project);
    },
    principalResolver,
  );
}

export async function getP2ProductInformationCardInScope(
  transaction: TransactionClient,
  context: P2AuthContext,
  projectId: string,
): Promise<P2ProductInformationCard> {
  const project = await transaction.productProject.findFirst({
    where: {
      projectId,
      workspaceId: context.workspaceId,
    },
    select: {
      projectId: true,
      displayName: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      activeTruthRevision: {
        select: {
          productTruthRevisionId: true,
          revisionNumber: true,
          truthBody: true,
          productContinuity: true,
          status: true,
          parentRevisionId: true,
          activatedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!project) throw new P2ProductProjectError("PROJECT_NOT_FOUND");

  const snapshots = await transaction.sourceSnapshot.findMany({
    where: {
      workspaceId: context.workspaceId,
      projectId,
    },
    select: {
      sourceKind: true,
      validationStatus: true,
      lifecycleStatus: true,
    },
  });
  const isActiveValid = (snapshot: (typeof snapshots)[number]) =>
    snapshot.lifecycleStatus === "ACTIVE" &&
    snapshot.validationStatus === "VALID";

  const activeTruthRevision = project.activeTruthRevision;
  if (
    activeTruthRevision &&
    (activeTruthRevision.status !== "ACTIVE" ||
      activeTruthRevision.activatedAt === null)
  ) {
    throw new Error("Active truth revision invariant is invalid.");
  }

  return Object.freeze({
    project: Object.freeze({
      projectId: project.projectId,
      displayName: project.displayName,
      status: project.status,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
    }),
    activeTruthRevision: activeTruthRevision
      ? Object.freeze({
          productTruthRevisionId: activeTruthRevision.productTruthRevisionId,
          revisionNumber: activeTruthRevision.revisionNumber,
          truthBody: freezeJsonValue(activeTruthRevision.truthBody),
          productContinuity: activeTruthRevision.productContinuity,
          status: "ACTIVE" as const,
          parentRevisionId: activeTruthRevision.parentRevisionId,
          activatedAt: activeTruthRevision.activatedAt as Date,
          createdAt: activeTruthRevision.createdAt,
        })
      : null,
    sourceSummary: Object.freeze({
      totalSnapshots: snapshots.length,
      activeValidProductSources: snapshots.filter(
        (snapshot) =>
          snapshot.sourceKind === "PRODUCT_SOURCE" && isActiveValid(snapshot),
      ).length,
      activeValidReferences: snapshots.filter(
        (snapshot) =>
          snapshot.sourceKind !== "PRODUCT_SOURCE" && isActiveValid(snapshot),
      ).length,
      actionRequiredSnapshots: snapshots.filter(
        (snapshot) =>
          snapshot.lifecycleStatus === "ACTIVE" &&
          snapshot.validationStatus === "ACTION_REQUIRED",
      ).length,
    }),
  });
}

export function normalizeP2ProductProjectDisplayName(input: unknown): string {
  if (input === undefined) {
    return "Untitled product";
  }

  if (typeof input !== "string" || input.includes("\0")) {
    throw new P2ProductProjectError("INVALID_DISPLAY_NAME");
  }

  const displayName = input.trim();
  return displayName === "" ? "Untitled product" : displayName;
}

function freezeJsonValue(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item) => freezeJsonValue(item)),
    ) as unknown as Prisma.JsonValue;
  }
  if (typeof value === "object" && value !== null) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (item === undefined) {
            throw new Error("Persisted truth JSON cannot contain undefined.");
          }
          return [key, freezeJsonValue(item)];
        }),
      ),
    ) as Prisma.JsonValue;
  }
  return value;
}

function toP2ProductProjectResource(project: {
  projectId: string;
  workspaceId: string;
  displayName: string;
  status: "DRAFT" | "ACTIVE" | "BLOCKED" | "ARCHIVED";
  createdByActorId: string;
  archivedAt: Date | null;
  createdAt: Date;
}): P2ProductProjectResource {
  return Object.freeze({
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    displayName: project.displayName,
    status: project.status,
    createdByActorId: project.createdByActorId,
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
  });
}
