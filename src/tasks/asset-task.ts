import { internalIds, internalTaskSummaries } from "@/src/tasks/internal-asset-task-execution";
import { randomUUID } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import {
  withP2WorkspaceMembershipScope,
  type P2AuthContext,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import type { DatabaseClient, TransactionClient } from "@/src/storage/database";

export type P2AssetTaskErrorCode =
  | "VALIDATION_FAILED"
  | "ASSET_TASK_NOT_FOUND"
  | "ASSET_TASK_DEPENDENCY_CONFLICT";

export class P2AssetTaskError extends Error {
  constructor(readonly code: P2AssetTaskErrorCode) {
    super(messageFor(code));
    this.name = "P2AssetTaskError";
  }
}

export type P2CreateAssetTaskInput = Readonly<{
  projectId: unknown;
  taskType: unknown;
  assetClass: unknown;
  outputPurpose: unknown;
  truthRevisionId: unknown;
  productSourceSnapshotId: unknown;
}>;

export type P2AssetTaskResource = Readonly<{
  assetTaskId: string;
  workspaceId: string;
  projectId: string;
  taskType: "INTERNAL_SINGLE_IMAGE";
  assetClass: "IMAGE";
  outputPurpose: "INTERNAL_TEST";
  truthRevisionId: string;
  productSourceSnapshotId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "HARD_BLOCKED";
  createdByActorId: string;
  createdAt: Date;
  generationAttemptSummary?: Awaited<ReturnType<typeof internalTaskSummaries>>["generationAttemptSummary"];
  artifactRevisionSummary?: Awaited<ReturnType<typeof internalTaskSummaries>>["artifactRevisionSummary"];
}>;

export async function createP2AssetTask(
  database: DatabaseClient,
  input: P2CreateAssetTaskInput,
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2AssetTaskResource> {
  validateCreateInput(input);
  return withP2WorkspaceMembershipScope(
    database,
    (transaction, context) => createP2AssetTaskInScope(transaction, context, input),
    principalResolver,
  );
}

export async function createP2AssetTaskInScope(
  transaction: TransactionClient,
  context: P2AuthContext,
  input: P2CreateAssetTaskInput,
): Promise<P2AssetTaskResource> {
  const projectId = parseCanonicalIdentifier(input.projectId);
  const taskType = parseTaskType(input.taskType);
  const assetClass = parseAssetClass(input.assetClass);
  const outputPurpose = parseOutputPurpose(input.outputPurpose);
  const truthRevisionId = parseCanonicalIdentifier(input.truthRevisionId);
  const productSourceSnapshotId = parseCanonicalIdentifier(
    input.productSourceSnapshotId,
  );

  const dependencies = await lockAssetTaskDependencies(transaction, {
    workspaceId: context.workspaceId,
    projectId,
    truthRevisionId,
    productSourceSnapshotId,
  });
  if (!dependencies) throw assetTaskNotFound();
  if (
    (dependencies.projectStatus !== "DRAFT" &&
      dependencies.projectStatus !== "ACTIVE") ||
    dependencies.activeTruthRevisionId !== truthRevisionId ||
    dependencies.truthRevisionStatus !== "ACTIVE" ||
    dependencies.linkStatus !== "ACTIVE" ||
    dependencies.sourceKind !== "PRODUCT_SOURCE" ||
    dependencies.validationStatus !== "VALID" ||
    dependencies.lifecycleStatus !== "ACTIVE"
  ) {
    throw dependencyConflict();
  }

  const assetTask = await transaction.assetTask.create({
    data: {
      assetTaskId: `p2_asset_task_${randomUUID()}`,
      workspaceId: context.workspaceId,
      projectId,
      taskType,
      assetClass,
      outputPurpose,
      truthRevisionId,
      productSourceSnapshotId,
      status: "QUEUED",
      createdByActorId: context.userActorId,
    },
  });

  return toAssetTaskResource(assetTask);
}

export async function getP2AssetTask(
  database: DatabaseClient,
  input: Readonly<{ projectId: unknown; assetTaskId: unknown }>,
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2AssetTaskResource> {
  return withP2WorkspaceMembershipScope(
    database,
    (transaction, context) => getP2AssetTaskInScope(transaction, context, input),
    principalResolver,
  );
}

export async function getP2AssetTaskInScope(
  transaction: TransactionClient,
  context: P2AuthContext,
  input: Readonly<{ projectId: unknown; assetTaskId: unknown }>,
): Promise<P2AssetTaskResource> {
  const projectId = parseCanonicalIdentifier(input.projectId);
  const assetTaskId = parseCanonicalIdentifier(input.assetTaskId);
  const locked = await transaction.$queryRaw<unknown[]>(Prisma.sql`
    SELECT "assetTaskId"
    FROM "AssetTask"
    WHERE "workspaceId" = ${context.workspaceId}
      AND "projectId" = ${projectId}
      AND "assetTaskId" = ${assetTaskId}
    FOR UPDATE
  `);
  if (locked.length !== 1) throw assetTaskNotFound();
  const assetTask = await transaction.assetTask.findFirst({
    where: {
      assetTaskId,
      workspaceId: context.workspaceId,
      projectId,
    },
  });
  if (!assetTask) throw assetTaskNotFound();
  if (assetTask.status === "QUEUED") {
    const ids = internalIds(assetTaskId);
    const coherent = await transaction.$queryRaw<unknown[]>(Prisma.sql`
      SELECT 1
      WHERE NOT EXISTS (SELECT 1 FROM "GenerationAttempt" WHERE "workspaceId" = ${context.workspaceId} AND "projectId" = ${projectId} AND "assetTaskId" = ${assetTaskId})
        AND NOT EXISTS (SELECT 1 FROM "GenerationAttemptSourceLink" WHERE "workspaceId" = ${context.workspaceId} AND "projectId" = ${projectId} AND "assetTaskId" = ${assetTaskId})
        AND NOT EXISTS (SELECT 1 FROM "Artifact" WHERE "workspaceId" = ${context.workspaceId} AND "projectId" = ${projectId} AND "assetTaskId" = ${assetTaskId})
        AND NOT EXISTS (SELECT 1 FROM "ArtifactRevision" WHERE "workspaceId" = ${context.workspaceId} AND "projectId" = ${projectId} AND "assetTaskId" = ${assetTaskId})
        AND NOT EXISTS (SELECT 1 FROM "ArtifactRevisionSourceLink" WHERE "workspaceId" = ${context.workspaceId} AND "projectId" = ${projectId} AND "assetTaskId" = ${assetTaskId})
        AND NOT EXISTS (SELECT 1 FROM "P2DomainEvent" WHERE "workspaceId" = ${context.workspaceId} AND "projectId" = ${projectId} AND ("eventId" IN (${ids.startedEvent}, ${ids.createdEvent}) OR "eventBody" ->> 'assetTaskId' = ${assetTaskId}))
    `);
    if (coherent.length !== 1) throw new Error("ASSET_TASK_GRAPH_INCONSISTENT");
    return toAssetTaskResource(assetTask);
  }
  return { ...toAssetTaskResource(assetTask), ...await internalTaskSummaries(transaction, context, { projectId, assetTaskId }) };
}

function validateCreateInput(input: P2CreateAssetTaskInput): void {
  parseCanonicalIdentifier(input.projectId);
  parseTaskType(input.taskType);
  parseAssetClass(input.assetClass);
  parseOutputPurpose(input.outputPurpose);
  parseCanonicalIdentifier(input.truthRevisionId);
  parseCanonicalIdentifier(input.productSourceSnapshotId);
}

async function lockAssetTaskDependencies(
  transaction: TransactionClient,
  input: Readonly<{
    workspaceId: string;
    projectId: string;
    truthRevisionId: string;
    productSourceSnapshotId: string;
  }>,
): Promise<LockedAssetTaskDependencies | null> {
  const rows = await transaction.$queryRaw<LockedAssetTaskDependencies[]>(
    Prisma.sql`
      SELECT
        project."status"::text AS "projectStatus",
        project."activeTruthRevisionId" AS "activeTruthRevisionId",
        revision."status"::text AS "truthRevisionStatus",
        source_link."linkStatus"::text AS "linkStatus",
        source_snapshot."sourceKind"::text AS "sourceKind",
        source_snapshot."validationStatus"::text AS "validationStatus",
        source_snapshot."lifecycleStatus"::text AS "lifecycleStatus"
      FROM "ProductProject" AS project
      INNER JOIN "ProductTruthRevision" AS revision
        ON revision."workspaceId" = project."workspaceId"
       AND revision."projectId" = project."projectId"
       AND revision."productTruthRevisionId" = ${input.truthRevisionId}
      INNER JOIN "TruthRevisionSourceLink" AS source_link
        ON source_link."workspaceId" = revision."workspaceId"
       AND source_link."projectId" = revision."projectId"
       AND source_link."productTruthRevisionId" = revision."productTruthRevisionId"
       AND source_link."sourceSnapshotId" = ${input.productSourceSnapshotId}
      INNER JOIN "SourceSnapshot" AS source_snapshot
        ON source_snapshot."workspaceId" = source_link."workspaceId"
       AND source_snapshot."projectId" = source_link."projectId"
       AND source_snapshot."sourceSnapshotId" = source_link."sourceSnapshotId"
      WHERE project."workspaceId" = ${input.workspaceId}
        AND project."projectId" = ${input.projectId}
      FOR SHARE OF project, revision, source_link, source_snapshot
    `,
  );
  return rows[0] ?? null;
}

type LockedAssetTaskDependencies = {
  projectStatus: string;
  activeTruthRevisionId: string | null;
  truthRevisionStatus: string;
  linkStatus: string;
  sourceKind: string;
  validationStatus: string;
  lifecycleStatus: string;
};

type AssetTaskRecord = {
  assetTaskId: string;
  workspaceId: string;
  projectId: string;
  taskType: "INTERNAL_SINGLE_IMAGE";
  assetClass: "IMAGE";
  outputPurpose: "INTERNAL_TEST";
  truthRevisionId: string;
  productSourceSnapshotId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "HARD_BLOCKED";
  createdByActorId: string;
  createdAt: Date;
};

function toAssetTaskResource(assetTask: AssetTaskRecord): P2AssetTaskResource {
  return Object.freeze({
    assetTaskId: assetTask.assetTaskId,
    workspaceId: assetTask.workspaceId,
    projectId: assetTask.projectId,
    taskType: assetTask.taskType,
    assetClass: assetTask.assetClass,
    outputPurpose: assetTask.outputPurpose,
    truthRevisionId: assetTask.truthRevisionId,
    productSourceSnapshotId: assetTask.productSourceSnapshotId,
    status: assetTask.status,
    createdByActorId: assetTask.createdByActorId,
    createdAt: assetTask.createdAt,
  });
}

function parseCanonicalIdentifier(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 256 ||
    input !== input.trim() ||
    /[\u0000-\u001f\u007f-\u009f]/.test(input)
  ) {
    throw validationFailed();
  }
  return input;
}

function parseTaskType(input: unknown): "INTERNAL_SINGLE_IMAGE" {
  if (input !== "INTERNAL_SINGLE_IMAGE") throw validationFailed();
  return input;
}

function parseAssetClass(input: unknown): "IMAGE" {
  if (input !== "IMAGE") throw validationFailed();
  return input;
}

function parseOutputPurpose(input: unknown): "INTERNAL_TEST" {
  if (input !== "INTERNAL_TEST") throw validationFailed();
  return input;
}

function messageFor(code: P2AssetTaskErrorCode): string {
  switch (code) {
    case "VALIDATION_FAILED":
      return "Asset task input is invalid.";
    case "ASSET_TASK_NOT_FOUND":
      return "Asset task or its project dependencies do not exist in the active Workspace.";
    case "ASSET_TASK_DEPENDENCY_CONFLICT":
      return "Asset task dependencies are not active and eligible.";
  }
}

function validationFailed(): P2AssetTaskError {
  return new P2AssetTaskError("VALIDATION_FAILED");
}

function assetTaskNotFound(): P2AssetTaskError {
  return new P2AssetTaskError("ASSET_TASK_NOT_FOUND");
}

function dependencyConflict(): P2AssetTaskError {
  return new P2AssetTaskError("ASSET_TASK_DEPENDENCY_CONFLICT");
}
