import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import {
  P2AuthContextError,
  withP2WorkspaceMembershipScope,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import type { DatabaseClient, TransactionClient } from "@/src/storage/database";
import {
  P2ProductTruthError,
  activateP2ProductTruthRevisionInScope,
  createP2ProductTruthRevisionInScope,
  getP2ProductTruthRevisionInScope,
} from "@/src/truth/product-truth-revision";

const CREATE_OPERATION = "truth_revision.create.v1";
const ACTIVATE_OPERATION = "truth_revision.activate.v1";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

type BuildEvidence = Readonly<{
  sourceCommit: string;
  productVersion: string;
}>;

type Dependencies = Readonly<{
  database: DatabaseClient;
  principalResolver?: P2WorkspacePrincipalResolver;
  buildEvidence?: BuildEvidence;
  createRequestId?: () => string;
}>;

type RouteContext = Readonly<{
  params: Promise<{ projectId: string; truthRevisionId?: string }>;
}>;

type StoredResponse = Readonly<{
  status: number;
  body: Record<string, unknown>;
}>;

export class P2TruthHttpError extends Error {
  constructor(
    readonly code: "VALIDATION_FAILED" | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR",
  ) {
    super(code);
    this.name = "P2TruthHttpError";
  }
}

export function createP2TruthHttpHandlers(dependencies: Dependencies) {
  const requestIdFactory = dependencies.createRequestId ?? randomUUID;

  return Object.freeze({
    async create(request: Request, routeContext: RouteContext): Promise<Response> {
      const requestId = requestIdFactory();
      try {
        const { projectId } = await routeContext.params;
        const idempotencyKey = parseIdempotencyKey(request);
        const body = parseCreateBody(await readJson(request));
        const fingerprint = fingerprintRequest({ projectId, body });
        const stored = await runIdempotent(
          dependencies,
          {
            operation: CREATE_OPERATION,
            idempotencyKey,
            fingerprint,
            projectId,
          },
          async (transaction, context) => {
            const result = await createP2ProductTruthRevisionInScope(
              transaction,
              context,
              { projectId, ...body },
            );
            return responseRecord(201, { result, requestId });
          },
        );
        return Response.json(stored.body, { status: stored.status });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async get(_request: Request, routeContext: RouteContext): Promise<Response> {
      const requestId = requestIdFactory();
      try {
        const { projectId, truthRevisionId } = await routeContext.params;
        const revision = await withP2WorkspaceMembershipScope(
          dependencies.database,
          (transaction, context) =>
            getP2ProductTruthRevisionInScope(transaction, context, {
              projectId,
              truthRevisionId,
            }),
          dependencies.principalResolver,
        );
        return Response.json({ revision, requestId });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async activate(request: Request, routeContext: RouteContext): Promise<Response> {
      const requestId = requestIdFactory();
      try {
        const { projectId, truthRevisionId } = await routeContext.params;
        const idempotencyKey = parseIdempotencyKey(request);
        const body = parseActivateBody(await readJson(request));
        const buildEvidence = dependencies.buildEvidence ?? readBuildEvidence();
        const fingerprint = fingerprintRequest({
          projectId,
          truthRevisionId,
          body,
          buildEvidence,
        });
        const stored = await runIdempotent(
          dependencies,
          {
            operation: ACTIVATE_OPERATION,
            idempotencyKey,
            fingerprint,
            projectId,
          },
          async (transaction, context) => {
            const result = await activateP2ProductTruthRevisionInScope(
              transaction,
              context,
              {
                projectId,
                truthRevisionId,
                expectedCurrentRevisionId: body.expectedCurrentRevisionId,
                correlationId: body.correlationId,
                requestId,
                sourceCommit: buildEvidence.sourceCommit,
                productVersion: buildEvidence.productVersion,
              },
            );
            return responseRecord(200, { result, requestId });
          },
        );
        return Response.json(stored.body, { status: stored.status });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },
  });
}

async function runIdempotent(
  dependencies: Dependencies,
  key: Readonly<{
    operation: string;
    idempotencyKey: string;
    fingerprint: string;
    projectId: string;
  }>,
  operation: (
    transaction: TransactionClient,
    context: Readonly<{
      userActorId: string;
      workspaceId: string;
      membershipId: string;
      role: "OWNER";
    }>,
  ) => Promise<StoredResponse>,
): Promise<StoredResponse> {
  try {
    return await withP2WorkspaceMembershipScope(
      dependencies.database,
      async (transaction, context) => {
        const scopedProject = await transaction.productProject.findFirst({
          where: {
            workspaceId: context.workspaceId,
            projectId: key.projectId,
          },
          select: { projectId: true },
        });
        if (!scopedProject) {
          throw new P2ProductTruthError("PROJECT_NOT_FOUND");
        }

        const existing = await transaction.p2IdempotencyRecord.findUnique({
          where: {
            workspaceId_operation_idempotencyKey: {
              workspaceId: context.workspaceId,
              operation: key.operation,
              idempotencyKey: key.idempotencyKey,
            },
          },
        });
        if (existing) return replayStored(existing, key.fingerprint);

        const idempotencyRecordId = `p2_idempotency_${randomUUID()}`;
        await transaction.p2IdempotencyRecord.create({
          data: {
            idempotencyRecordId,
            workspaceId: context.workspaceId,
            projectId: key.projectId,
            actorId: context.userActorId,
            operation: key.operation,
            idempotencyKey: key.idempotencyKey,
            requestFingerprint: key.fingerprint,
            status: "IN_PROGRESS",
          },
        });

        const result = await operation(transaction, context);
        await transaction.p2IdempotencyRecord.update({
          where: { idempotencyRecordId },
          data: {
            status: "SUCCEEDED",
            responseStatus: result.status,
            responseBody: result.body as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return result;
      },
      dependencies.principalResolver,
    );
  } catch (error) {
    if (!isIdempotencyUniqueConflict(error)) throw error;
    return readConcurrentReplay(dependencies, key);
  }
}

async function readConcurrentReplay(
  dependencies: Dependencies,
  key: Readonly<{
    operation: string;
    idempotencyKey: string;
    fingerprint: string;
  }>,
): Promise<StoredResponse> {
  return withP2WorkspaceMembershipScope(
    dependencies.database,
    async (transaction, context) => {
      const existing = await transaction.p2IdempotencyRecord.findUnique({
        where: {
          workspaceId_operation_idempotencyKey: {
            workspaceId: context.workspaceId,
            operation: key.operation,
            idempotencyKey: key.idempotencyKey,
          },
        },
      });
      if (!existing) throw new P2TruthHttpError("IDEMPOTENCY_CONFLICT");
      return replayStored(existing, key.fingerprint);
    },
    dependencies.principalResolver,
  );
}

function replayStored(
  record: Readonly<{
    requestFingerprint: string;
    status: "IN_PROGRESS" | "SUCCEEDED";
    responseStatus: number | null;
    responseBody: Prisma.JsonValue | null;
  }>,
  fingerprint: string,
): StoredResponse {
  if (
    record.requestFingerprint !== fingerprint ||
    record.status !== "SUCCEEDED" ||
    record.responseStatus === null ||
    !isRecord(record.responseBody)
  ) {
    throw new P2TruthHttpError("IDEMPOTENCY_CONFLICT");
  }
  return responseRecord(record.responseStatus, record.responseBody);
}

function parseCreateBody(input: unknown) {
  assertExactObjectKeys(input, [
    "expectedCurrentRevisionId",
    "parentRevisionId",
    "productContinuity",
    "sourceBindings",
    "truthBody",
  ]);
  return Object.freeze({
    expectedCurrentRevisionId: input.expectedCurrentRevisionId,
    parentRevisionId: input.parentRevisionId,
    productContinuity: input.productContinuity,
    sourceBindings: input.sourceBindings,
    truthBody: input.truthBody,
  });
}

function parseActivateBody(input: unknown) {
  assertExactObjectKeys(input, ["correlationId", "expectedCurrentRevisionId"]);
  return Object.freeze({
    correlationId: input.correlationId,
    expectedCurrentRevisionId: input.expectedCurrentRevisionId,
  });
}

function parseIdempotencyKey(request: Request): string {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new P2TruthHttpError("VALIDATION_FAILED");
  }
  return key;
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new P2TruthHttpError("VALIDATION_FAILED");
  }
  try {
    return await request.json();
  } catch {
    throw new P2TruthHttpError("VALIDATION_FAILED");
  }
}

function assertExactObjectKeys(
  input: unknown,
  expectedKeys: readonly string[],
): asserts input is Record<string, unknown> {
  if (!isRecord(input)) throw new P2TruthHttpError("VALIDATION_FAILED");
  const keys = Object.keys(input).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new P2TruthHttpError("VALIDATION_FAILED");
  }
}

function fingerprintRequest(value: unknown): string {
  return createHash("sha256")
    .update(stableJson(value), "utf8")
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function readBuildEvidence(): BuildEvidence {
  const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  const productVersion = process.env.npm_package_version;
  if (
    !sourceCommit ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceCommit) ||
    !productVersion ||
    productVersion.length === 0 ||
    productVersion !== productVersion.trim()
  ) {
    throw new P2TruthHttpError("INTERNAL_ERROR");
  }
  return Object.freeze({ sourceCommit, productVersion });
}

function errorResponse(error: unknown, requestId: string): Response {
  const mapped = mapError(error);
  return Response.json(
    { error: { code: mapped.code, message: mapped.message, requestId } },
    { status: mapped.status },
  );
}

function mapError(error: unknown): { code: string; status: number; message: string } {
  if (error instanceof P2AuthContextError) {
    return { code: error.code, status: error.status, message: error.message };
  }
  if (error instanceof P2ProductTruthError) {
    const status = error.code === "PROJECT_NOT_FOUND" ? 404
      : error.code === "REVISION_CONFLICT" ? 409
      : error.code === "VALIDATION_FAILED" ? 400
      : 422;
    return { code: error.code, status, message: error.message };
  }
  if (error instanceof P2TruthHttpError) {
    const status = error.code === "IDEMPOTENCY_CONFLICT" ? 409
      : error.code === "VALIDATION_FAILED" ? 400
      : 500;
    return { code: error.code, status, message: messageFor(error.code) };
  }
  return { code: "INTERNAL_ERROR", status: 500, message: "Service temporarily unavailable." };
}

function messageFor(code: P2TruthHttpError["code"]): string {
  if (code === "VALIDATION_FAILED") return "Request is invalid.";
  if (code === "IDEMPOTENCY_CONFLICT") return "Idempotency key conflicts with another request.";
  return "Service temporarily unavailable.";
}

function responseRecord(status: number, body: Record<string, unknown>): StoredResponse {
  return Object.freeze({ status, body: JSON.parse(JSON.stringify(body)) as Record<string, unknown> });
}

function isIdempotencyUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) &&
    target.length === 3 &&
    target[0] === "workspaceId" &&
    target[1] === "operation" &&
    target[2] === "idempotencyKey";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
