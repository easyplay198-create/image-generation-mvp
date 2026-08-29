import { randomUUID } from "node:crypto";

import {
  withP2WorkspaceMembershipScope,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import type { DatabaseClient } from "@/src/storage/database";

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

export async function createP2ProductProject(
  database: DatabaseClient,
  input: Readonly<{ displayName?: string }> = Object.freeze({}),
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2ProductProjectResource> {
  const displayName = normalizeDisplayName(input.displayName);

  return withP2WorkspaceMembershipScope(
    database,
    async (transaction, context) => {
      const project = await transaction.productProject.create({
        data: {
          projectId: `p2_project_${randomUUID()}`,
          workspaceId: context.workspaceId,
          skuIdentityKey: `p2_sku_${randomUUID()}`,
          displayName,
          status: "DRAFT",
          createdByActorId: context.userActorId,
        },
      });

      return toP2ProductProjectResource(project);
    },
    principalResolver,
  );
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

function normalizeDisplayName(input: string | undefined): string {
  if (input === undefined) {
    return "Untitled product";
  }

  if (typeof input !== "string" || input.includes("\0")) {
    throw new P2ProductProjectError("INVALID_DISPLAY_NAME");
  }

  const displayName = input.trim();
  return displayName === "" ? "Untitled product" : displayName;
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
