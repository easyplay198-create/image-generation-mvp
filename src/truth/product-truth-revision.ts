import { randomUUID } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import {
  withP2WorkspaceMembershipScope,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import type {
  DatabaseClient,
  TransactionClient,
} from "@/src/storage/database";

const CONTINUITY_VALUES = [
  "SAME_PRODUCT",
  "DIFFERENT_PRODUCT",
  "REVIEW_REQUIRED",
] as const;
const SOURCE_ROLES = ["PRODUCT_PRIMARY", "PRODUCT_SUPPORTING"] as const;
const TRUTH_STRING_FIELDS = [
  "merchantSku",
  "supplierSku",
  "model",
  "name",
  "color",
  "structure",
] as const;
const TRUTH_LIST_FIELDS = [
  "interfaces",
  "accessories",
  "unknownFields",
  "forbiddenFacts",
] as const;
const TRUTH_KEYS = [
  ...TRUTH_STRING_FIELDS,
  ...TRUTH_LIST_FIELDS,
  "parameters",
] as const;

export type P2ProductTruthContinuity = (typeof CONTINUITY_VALUES)[number];
export type P2TruthRevisionSourceRole = (typeof SOURCE_ROLES)[number];

export type P2ProductTruthErrorCode =
  | "VALIDATION_FAILED"
  | "PROJECT_NOT_FOUND"
  | "SOURCE_ACTION_REQUIRED"
  | "SOURCE_REVOKED"
  | "REVISION_CONFLICT";

export class P2ProductTruthError extends Error {
  constructor(readonly code: P2ProductTruthErrorCode) {
    super(messageFor(code));
    this.name = "P2ProductTruthError";
  }
}

export type P2ProductTruthBody = Readonly<
  Partial<{
    merchantSku: string;
    supplierSku: string;
    model: string;
    name: string;
    color: string;
    structure: string;
    interfaces: readonly string[];
    accessories: readonly string[];
    parameters: Readonly<Record<string, string>>;
    unknownFields: readonly string[];
    forbiddenFacts: readonly string[];
  }>
>;

export type P2TruthRevisionSourceBinding = Readonly<{
  linkId: string;
  sourceSnapshotId: string;
  sourceRole: P2TruthRevisionSourceRole;
  sortOrder: number;
  linkStatus: "ACTIVE";
}>;

export type P2ProductTruthRevisionResource = Readonly<{
  productTruthRevisionId: string;
  workspaceId: string;
  projectId: string;
  revisionNumber: number;
  truthBody: P2ProductTruthBody;
  productContinuity: P2ProductTruthContinuity;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "INVALIDATED";
  parentRevisionId: string | null;
  createdByActorId: string;
  activatedAt: Date | null;
  supersededAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}>;

export type P2ProductTruthDraftResource = Readonly<{
  revision: P2ProductTruthRevisionResource;
  sourceBindings: readonly P2TruthRevisionSourceBinding[];
}>;

export type P2ProductTruthActivationResource = Readonly<{
  project: Readonly<{
    projectId: string;
    workspaceId: string;
    activeTruthRevisionId: string;
  }>;
  activatedRevision: P2ProductTruthRevisionResource;
  previousRevision: P2ProductTruthRevisionResource | null;
  event: Readonly<{
    eventId: string;
    eventType: "truth_revision.activated.v1";
    requestId: string;
    correlationId: string;
  }>;
}>;

type CanonicalTruthBody = Record<
  string,
  string | string[] | Record<string, string>
>;

type ParsedSourceBinding = Readonly<{
  linkId: string;
  sourceSnapshotId: string;
  sourceRole: P2TruthRevisionSourceRole;
  sortOrder: number;
}>;

type LockedProductSource = {
  sourceSnapshotId: string;
  sourceKind: string;
  validationStatus: string;
  lifecycleStatus: string;
};

type LockedProductProject = {
  projectId: string;
  workspaceId: string;
  status: string;
  activeTruthRevisionId: string | null;
};

type TruthRevisionRecord = {
  productTruthRevisionId: string;
  workspaceId: string;
  projectId: string;
  revisionNumber: number;
  truthBody: Prisma.JsonValue;
  productContinuity: P2ProductTruthContinuity;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "INVALIDATED";
  parentRevisionId: string | null;
  createdByActorId: string;
  activatedAt: Date | null;
  supersededAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
};

export async function createP2ProductTruthRevision(
  database: DatabaseClient,
  input: Readonly<{
    projectId: unknown;
    expectedCurrentRevisionId: unknown;
    parentRevisionId?: unknown;
    truthBody: unknown;
    productContinuity: unknown;
    sourceBindings: unknown;
  }>,
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2ProductTruthDraftResource> {
  const projectId = parseCanonicalIdentifier(input.projectId);
  const expectedCurrentRevisionId = parseExpectedRevisionId(
    input.expectedCurrentRevisionId,
  );
  const parentRevisionId = parseOptionalRevisionId(input.parentRevisionId);
  const truthBody = parseTruthBody(input.truthBody);
  const productContinuity = parseContinuity(input.productContinuity);
  const sourceBindings = parseSourceBindings(input.sourceBindings);

  return withP2WorkspaceMembershipScope(
    database,
    async (transaction, context) => {
      const project = await lockWritableProject(
        transaction,
        context.workspaceId,
        projectId,
      );
      assertExpectedRevision(project, expectedCurrentRevisionId);
      assertParentRevision(project, parentRevisionId);

      const snapshots = await lockProductSources(
        transaction,
        context.workspaceId,
        projectId,
        sourceBindings.map(({ sourceSnapshotId }) => sourceSnapshotId),
      );
      assertEligibleSources(sourceBindings, snapshots);

      const latestRevision = await transaction.productTruthRevision.aggregate({
        where: { workspaceId: context.workspaceId, projectId },
        _max: { revisionNumber: true },
      });
      const revisionNumber = (latestRevision._max.revisionNumber ?? 0) + 1;
      const productTruthRevisionId = `p2_truth_${randomUUID()}`;

      const revision = await transaction.productTruthRevision.create({
        data: {
          productTruthRevisionId,
          workspaceId: context.workspaceId,
          projectId,
          revisionNumber,
          truthBody: truthBody as Prisma.InputJsonValue,
          productContinuity,
          status: "DRAFT",
          parentRevisionId,
          createdByActorId: context.userActorId,
        },
      });

      await transaction.truthRevisionSourceLink.createMany({
        data: sourceBindings.map((binding) => ({
          linkId: binding.linkId,
          workspaceId: context.workspaceId,
          projectId,
          productTruthRevisionId,
          sourceSnapshotId: binding.sourceSnapshotId,
          sourceRole: binding.sourceRole,
          sortOrder: binding.sortOrder,
          linkStatus: "ACTIVE" as const,
          createdByActorId: context.userActorId,
        })),
      });

      return Object.freeze({
        revision: toTruthRevisionResource(revision),
        sourceBindings: Object.freeze(
          sourceBindings.map((binding) =>
            Object.freeze({ ...binding, linkStatus: "ACTIVE" as const }),
          ),
        ),
      });
    },
    principalResolver,
  );
}

export async function activateP2ProductTruthRevision(
  database: DatabaseClient,
  input: Readonly<{
    projectId: unknown;
    truthRevisionId: unknown;
    expectedCurrentRevisionId: unknown;
    requestId: unknown;
    correlationId: unknown;
    sourceCommit: unknown;
    productVersion: unknown;
  }>,
  principalResolver?: P2WorkspacePrincipalResolver,
): Promise<P2ProductTruthActivationResource> {
  const projectId = parseCanonicalIdentifier(input.projectId);
  const truthRevisionId = parseCanonicalIdentifier(input.truthRevisionId);
  const expectedCurrentRevisionId = parseExpectedRevisionId(
    input.expectedCurrentRevisionId,
  );
  const requestId = parseCanonicalIdentifier(input.requestId);
  const correlationId = parseCanonicalIdentifier(input.correlationId);
  const sourceCommit = parseSourceCommit(input.sourceCommit);
  const productVersion = parseCanonicalIdentifier(input.productVersion);

  return withP2WorkspaceMembershipScope(
    database,
    async (transaction, context) => {
      const project = await lockWritableProject(
        transaction,
        context.workspaceId,
        projectId,
      );
      assertExpectedRevision(project, expectedCurrentRevisionId);

      const target = await transaction.productTruthRevision.findFirst({
        where: {
          productTruthRevisionId: truthRevisionId,
          workspaceId: context.workspaceId,
          projectId,
        },
      });
      if (
        !target ||
        target.status !== "DRAFT" ||
        target.productContinuity !== "SAME_PRODUCT"
      ) {
        throw revisionConflict();
      }

      const activePrimarySources = await lockActivePrimarySources(
        transaction,
        context.workspaceId,
        projectId,
        truthRevisionId,
      );
      assertEligiblePrimarySource(activePrimarySources);

      const previous = project.activeTruthRevisionId
        ? await transaction.productTruthRevision.findFirst({
            where: {
              productTruthRevisionId: project.activeTruthRevisionId,
              workspaceId: context.workspaceId,
              projectId,
              status: "ACTIVE",
            },
          })
        : null;
      if (project.activeTruthRevisionId && !previous) throw revisionConflict();

      const transitionedAt = new Date();
      if (previous) {
        const superseded = await transaction.productTruthRevision.updateMany({
          where: {
            productTruthRevisionId: previous.productTruthRevisionId,
            workspaceId: context.workspaceId,
            projectId,
            status: "ACTIVE",
          },
          data: { status: "SUPERSEDED", supersededAt: transitionedAt },
        });
        if (superseded.count !== 1) throw revisionConflict();
      }

      const activated = await transaction.productTruthRevision.updateMany({
        where: {
          productTruthRevisionId: truthRevisionId,
          workspaceId: context.workspaceId,
          projectId,
          status: "DRAFT",
        },
        data: { status: "ACTIVE", activatedAt: transitionedAt },
      });
      if (activated.count !== 1) throw revisionConflict();

      await transaction.productProject.update({
        where: { projectId },
        data: { activeTruthRevisionId: truthRevisionId },
      });

      const eventId = `p2_event_${randomUUID()}`;
      await transaction.p2DomainEvent.create({
        data: {
          eventId,
          eventType: "truth_revision.activated.v1",
          eventSchemaVersion: 1,
          workspaceId: context.workspaceId,
          projectId,
          actorType: "USER_ACTOR",
          actorId: context.userActorId,
          requestId,
          correlationId,
          sourceCommit,
          productVersion,
          eventBody: {
            truthRevisionId,
            parentRevisionId: target.parentRevisionId,
            previousActiveTruthRevisionId:
              previous?.productTruthRevisionId ?? null,
            projectId,
          },
        },
      });

      const activatedRevision = Object.assign({}, target, {
        status: "ACTIVE" as const,
        activatedAt: transitionedAt,
      });
      const previousRevision = previous
        ? Object.assign({}, previous, {
            status: "SUPERSEDED" as const,
            supersededAt: transitionedAt,
          })
        : null;

      return Object.freeze({
        project: Object.freeze({
          projectId,
          workspaceId: context.workspaceId,
          activeTruthRevisionId: truthRevisionId,
        }),
        activatedRevision: toTruthRevisionResource(activatedRevision),
        previousRevision: previousRevision
          ? toTruthRevisionResource(previousRevision)
          : null,
        event: Object.freeze({
          eventId,
          eventType: "truth_revision.activated.v1" as const,
          requestId,
          correlationId,
        }),
      });
    },
    principalResolver,
  );
}

async function lockWritableProject(
  transaction: TransactionClient,
  workspaceId: string,
  projectId: string,
): Promise<LockedProductProject> {
  const projects = await transaction.$queryRaw<LockedProductProject[]>(
    Prisma.sql`
      SELECT
        project."projectId" AS "projectId",
        project."workspaceId" AS "workspaceId",
        project."status"::text AS "status",
        project."activeTruthRevisionId" AS "activeTruthRevisionId"
      FROM "ProductProject" AS project
      WHERE project."workspaceId" = ${workspaceId}
        AND project."projectId" = ${projectId}
      FOR UPDATE OF project
    `,
  );
  const project = projects[0];
  if (
    !project ||
    (project.status !== "DRAFT" && project.status !== "ACTIVE")
  ) {
    throw projectNotFound();
  }
  return project;
}

async function lockProductSources(
  transaction: TransactionClient,
  workspaceId: string,
  projectId: string,
  sourceSnapshotIds: readonly string[],
): Promise<LockedProductSource[]> {
  return transaction.$queryRaw<LockedProductSource[]>(Prisma.sql`
    SELECT
      source_snapshot."sourceSnapshotId" AS "sourceSnapshotId",
      source_snapshot."sourceKind"::text AS "sourceKind",
      source_snapshot."validationStatus"::text AS "validationStatus",
      source_snapshot."lifecycleStatus"::text AS "lifecycleStatus"
    FROM "SourceSnapshot" AS source_snapshot
    WHERE source_snapshot."workspaceId" = ${workspaceId}
      AND source_snapshot."projectId" = ${projectId}
      AND source_snapshot."sourceSnapshotId" IN (${Prisma.join(sourceSnapshotIds)})
    FOR SHARE OF source_snapshot
  `);
}

async function lockActivePrimarySources(
  transaction: TransactionClient,
  workspaceId: string,
  projectId: string,
  truthRevisionId: string,
): Promise<LockedProductSource[]> {
  return transaction.$queryRaw<LockedProductSource[]>(Prisma.sql`
    SELECT
      source_snapshot."sourceSnapshotId" AS "sourceSnapshotId",
      source_snapshot."sourceKind"::text AS "sourceKind",
      source_snapshot."validationStatus"::text AS "validationStatus",
      source_snapshot."lifecycleStatus"::text AS "lifecycleStatus"
    FROM "TruthRevisionSourceLink" AS source_link
    INNER JOIN "SourceSnapshot" AS source_snapshot
      ON source_snapshot."workspaceId" = source_link."workspaceId"
     AND source_snapshot."projectId" = source_link."projectId"
     AND source_snapshot."sourceSnapshotId" = source_link."sourceSnapshotId"
    WHERE source_link."workspaceId" = ${workspaceId}
      AND source_link."projectId" = ${projectId}
      AND source_link."productTruthRevisionId" = ${truthRevisionId}
      AND source_link."sourceRole" = 'PRODUCT_PRIMARY'
      AND source_link."linkStatus" = 'ACTIVE'
    FOR SHARE OF source_link, source_snapshot
  `);
}

function assertExpectedRevision(
  project: LockedProductProject,
  expectedCurrentRevisionId: string | null,
): void {
  if (project.activeTruthRevisionId !== expectedCurrentRevisionId) {
    throw revisionConflict();
  }
}

function assertParentRevision(
  project: LockedProductProject,
  parentRevisionId: string | null,
): void {
  if (project.activeTruthRevisionId === null) {
    if (parentRevisionId !== null) throw revisionConflict();
    return;
  }
  if (parentRevisionId !== project.activeTruthRevisionId) {
    throw revisionConflict();
  }
}

function assertEligibleSources(
  bindings: readonly ParsedSourceBinding[],
  snapshots: readonly {
    sourceSnapshotId: string;
    sourceKind: string;
    validationStatus: string;
    lifecycleStatus: string;
  }[],
): void {
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.sourceSnapshotId, snapshot]),
  );
  for (const binding of bindings) {
    const snapshot = snapshotsById.get(binding.sourceSnapshotId);
    if (
      !snapshot ||
      snapshot.sourceKind !== "PRODUCT_SOURCE" ||
      snapshot.lifecycleStatus !== "ACTIVE"
    ) {
      throw sourceRevoked();
    }
    if (snapshot.validationStatus !== "VALID") {
      throw sourceActionRequired();
    }
  }
}

function assertEligiblePrimarySource(
  snapshots: readonly LockedProductSource[],
): void {
  if (
    snapshots.some(
      (snapshot) =>
        snapshot.sourceKind === "PRODUCT_SOURCE" &&
        snapshot.lifecycleStatus === "ACTIVE" &&
        snapshot.validationStatus === "VALID",
    )
  ) {
    return;
  }

  if (
    snapshots.some(
      (snapshot) =>
        snapshot.sourceKind === "PRODUCT_SOURCE" &&
        snapshot.lifecycleStatus === "ACTIVE" &&
        snapshot.validationStatus !== "VALID",
    )
  ) {
    throw sourceActionRequired();
  }

  throw sourceRevoked();
}

function parseTruthBody(input: unknown): CanonicalTruthBody {
  if (!isRecord(input)) throw validationFailed();
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !TRUTH_KEYS.includes(key as never))) {
    throw validationFailed();
  }

  const result: CanonicalTruthBody = {};
  for (const field of TRUTH_STRING_FIELDS) {
    if (Object.hasOwn(input, field)) {
      result[field] = parseCanonicalString(input[field]);
    }
  }
  for (const field of TRUTH_LIST_FIELDS) {
    if (Object.hasOwn(input, field)) {
      result[field] = parseCanonicalStringList(input[field]);
    }
  }
  if (Object.hasOwn(input, "parameters")) {
    result.parameters = parseParameters(input.parameters);
  }

  return result;
}

function parseCanonicalStringList(input: unknown): string[] {
  if (!Array.isArray(input)) throw validationFailed();
  const values = input.map(parseCanonicalString);
  if (new Set(values).size !== values.length) throw validationFailed();
  return values;
}

function parseParameters(input: unknown): Record<string, string> {
  if (!isRecord(input)) throw validationFailed();
  const parameters: Record<string, string> = {};
  for (const key of Object.keys(input).sort()) {
    const canonicalKey = parseCanonicalString(key);
    parameters[canonicalKey] = parseCanonicalString(input[key]);
  }
  return parameters;
}

function parseSourceBindings(input: unknown): readonly ParsedSourceBinding[] {
  if (!Array.isArray(input) || input.length === 0) throw validationFailed();
  const bindings = input.map((value) => {
    if (!isRecord(value)) throw validationFailed();
    const keys = Object.keys(value).sort();
    if (
      keys.length !== 3 ||
      keys[0] !== "sortOrder" ||
      keys[1] !== "sourceRole" ||
      keys[2] !== "sourceSnapshotId"
    ) {
      throw validationFailed();
    }
    const sourceSnapshotId = parseCanonicalIdentifier(value.sourceSnapshotId);
    const sourceRole = parseSourceRole(value.sourceRole);
    if (!Number.isInteger(value.sortOrder) || (value.sortOrder as number) < 0) {
      throw validationFailed();
    }
    return Object.freeze({
      linkId: `p2_truth_source_${randomUUID()}`,
      sourceSnapshotId,
      sourceRole,
      sortOrder: value.sortOrder as number,
    });
  });
  if (!bindings.some(({ sourceRole }) => sourceRole === "PRODUCT_PRIMARY")) {
    throw validationFailed();
  }
  if (
    new Set(bindings.map(({ sourceSnapshotId }) => sourceSnapshotId)).size !==
      bindings.length ||
    new Set(bindings.map(({ sortOrder }) => sortOrder)).size !== bindings.length
  ) {
    throw validationFailed();
  }
  return Object.freeze(bindings);
}

function parseContinuity(input: unknown): P2ProductTruthContinuity {
  if (
    typeof input !== "string" ||
    !(CONTINUITY_VALUES as readonly string[]).includes(input)
  ) {
    throw validationFailed();
  }
  return input as P2ProductTruthContinuity;
}

function parseSourceRole(input: unknown): P2TruthRevisionSourceRole {
  if (
    typeof input !== "string" ||
    !(SOURCE_ROLES as readonly string[]).includes(input)
  ) {
    throw validationFailed();
  }
  return input as P2TruthRevisionSourceRole;
}

function parseExpectedRevisionId(input: unknown): string | null {
  return input === null ? null : parseCanonicalIdentifier(input);
}

function parseOptionalRevisionId(input: unknown): string | null {
  return input === undefined || input === null
    ? null
    : parseCanonicalIdentifier(input);
}

function parseCanonicalIdentifier(input: unknown): string {
  return parseCanonicalString(input);
}

function parseCanonicalString(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input !== input.trim() ||
    input.includes("\0")
  ) {
    throw validationFailed();
  }
  return input;
}

function parseSourceCommit(input: unknown): string {
  const sourceCommit = parseCanonicalString(input);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceCommit)) {
    throw validationFailed();
  }
  return sourceCommit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => typeof key === "string");
}

function toTruthRevisionResource(
  revision: TruthRevisionRecord,
): P2ProductTruthRevisionResource {
  return Object.freeze({
    productTruthRevisionId: revision.productTruthRevisionId,
    workspaceId: revision.workspaceId,
    projectId: revision.projectId,
    revisionNumber: revision.revisionNumber,
    truthBody: freezeTruthBody(revision.truthBody),
    productContinuity: revision.productContinuity,
    status: revision.status,
    parentRevisionId: revision.parentRevisionId,
    createdByActorId: revision.createdByActorId,
    activatedAt: revision.activatedAt,
    supersededAt: revision.supersededAt,
    invalidatedAt: revision.invalidatedAt,
    createdAt: revision.createdAt,
  });
}

function freezeTruthBody(value: Prisma.JsonValue): P2ProductTruthBody {
  if (!isRecord(value)) throw new Error("Persisted truth body must be an object.");
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (Array.isArray(fieldValue)) {
      result[key] = Object.freeze([...fieldValue]);
    } else if (isRecord(fieldValue)) {
      result[key] = Object.freeze({ ...fieldValue });
    } else {
      result[key] = fieldValue;
    }
  }
  return Object.freeze(result) as P2ProductTruthBody;
}

function messageFor(code: P2ProductTruthErrorCode): string {
  switch (code) {
    case "VALIDATION_FAILED":
      return "Product truth input is invalid.";
    case "PROJECT_NOT_FOUND":
      return "Product project does not exist in the active Workspace.";
    case "SOURCE_ACTION_REQUIRED":
      return "A product source requires action before it can be used.";
    case "SOURCE_REVOKED":
      return "A product source is unavailable in the active project.";
    case "REVISION_CONFLICT":
      return "Product truth revision state changed or cannot be activated.";
  }
}

function validationFailed(): P2ProductTruthError {
  return new P2ProductTruthError("VALIDATION_FAILED");
}

function projectNotFound(): P2ProductTruthError {
  return new P2ProductTruthError("PROJECT_NOT_FOUND");
}

function sourceActionRequired(): P2ProductTruthError {
  return new P2ProductTruthError("SOURCE_ACTION_REQUIRED");
}

function sourceRevoked(): P2ProductTruthError {
  return new P2ProductTruthError("SOURCE_REVOKED");
}

function revisionConflict(): P2ProductTruthError {
  return new P2ProductTruthError("REVISION_CONFLICT");
}
