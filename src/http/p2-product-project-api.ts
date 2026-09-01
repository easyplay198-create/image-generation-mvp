import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import {
  denyP2WorkspacePrincipal,
  P2AuthContextError,
  withP2WorkspaceMembershipScope,
  type P2AuthContext,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import {
  createP2ProductProjectInScope,
  getP2ProductInformationCardInScope,
  normalizeP2ProductProjectDisplayName,
  P2ProductProjectError,
  type P2ProductInformationCard,
  type P2ProductProjectResource,
} from "@/src/projects/product-project";
import type { DatabaseClient, TransactionClient } from "@/src/storage/database";

const CREATE_OPERATION = "product_project.create.v1";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

type Dependencies = Readonly<{
  database: DatabaseClient;
  principalResolver?: P2WorkspacePrincipalResolver;
  createRequestId?: () => string;
}>;

type RouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

type StoredResponse = Readonly<{
  status: number;
  body: Record<string, unknown>;
}>;

class P2IdempotencyInsertConflict extends Error {
  constructor() {
    super("P2_IDEMPOTENCY_INSERT_CONFLICT");
    this.name = "P2IdempotencyInsertConflict";
  }
}

export class P2ProductProjectHttpError extends Error {
  constructor(
    readonly code:
      | "VALIDATION_FAILED"
      | "IDEMPOTENCY_CONFLICT"
      | "INTERNAL_ERROR",
  ) {
    super(code);
    this.name = "P2ProductProjectHttpError";
  }
}

export function createP2ProductProjectHttpHandlers(dependencies: Dependencies) {
  const principalResolver =
    dependencies.principalResolver ?? denyP2WorkspacePrincipal;
  const createRequestId = dependencies.createRequestId ?? randomUUID;

  return Object.freeze({
    async post(request: Request): Promise<Response> {
      const requestId = createRequestId();
      try {
        const principal = await principalResolver.resolve();
        const idempotencyKey = parseIdempotencyKey(request);
        const input = await parseCreateInput(request);
        const fingerprint = fingerprintRequest({
          operation: CREATE_OPERATION,
          input,
        });
        const stored = await runIdempotentCreate(
          dependencies.database,
          frozenPrincipalResolver(principal),
          { idempotencyKey, fingerprint, input, requestId },
        );
        return Response.json(stored.body, { status: stored.status });
      } catch (error) {
        return projectErrorResponse(error, requestId);
      }
    },

    async get(_request: Request, context: RouteContext): Promise<Response> {
      const requestId = createRequestId();
      try {
        const principal = await principalResolver.resolve();
        const { projectId } = await context.params;
        assertProjectId(projectId);
        const card = await withP2WorkspaceMembershipScope(
          dependencies.database,
          (transaction, authContext) =>
            getP2ProductInformationCardInScope(
              transaction,
              authContext,
              projectId,
            ),
          frozenPrincipalResolver(principal),
        );
        return Response.json({ card: safeCard(card), requestId });
      } catch (error) {
        return projectErrorResponse(error, requestId);
      }
    },
  });
}

async function runIdempotentCreate(
  database: DatabaseClient,
  principalResolver: P2WorkspacePrincipalResolver,
  request: Readonly<{
    idempotencyKey: string;
    fingerprint: string;
    input: Readonly<{ displayName: string }>;
    requestId: string;
  }>,
): Promise<StoredResponse> {
  try {
    return await withP2WorkspaceMembershipScope(
      database,
      async (transaction, context) => {
        const existing = await findIdempotencyRecord(
          transaction,
          context,
          request.idempotencyKey,
        );
        if (existing) return replayStored(existing, request.fingerprint);

        const project = await createP2ProductProjectInScope(
          transaction,
          context,
          request.input,
        );
        const response = responseRecord(201, {
          result: safeProject(project),
          requestId: request.requestId,
        });
        const idempotencyRecordId = `p2_idempotency_${randomUUID()}`;
        try {
          await transaction.p2IdempotencyRecord.create({
            data: {
              idempotencyRecordId,
              workspaceId: context.workspaceId,
              projectId: project.projectId,
              actorId: context.userActorId,
              operation: CREATE_OPERATION,
              idempotencyKey: request.idempotencyKey,
              requestFingerprint: request.fingerprint,
              status: "IN_PROGRESS",
            },
          });
        } catch (error) {
          if (!isPrismaUniqueConstraintViolation(error)) throw error;
          throw new P2IdempotencyInsertConflict();
        }
        await transaction.p2IdempotencyRecord.update({
          where: { idempotencyRecordId },
          data: {
            status: "SUCCEEDED",
            responseStatus: response.status,
            responseBody: response.body as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return response;
      },
      principalResolver,
    );
  } catch (error) {
    if (!(error instanceof P2IdempotencyInsertConflict)) throw error;
    return readConcurrentReplay(database, principalResolver, request);
  }
}

async function readConcurrentReplay(
  database: DatabaseClient,
  principalResolver: P2WorkspacePrincipalResolver,
  request: Readonly<{
    idempotencyKey: string;
    fingerprint: string;
  }>,
): Promise<StoredResponse> {
  return withP2WorkspaceMembershipScope(
    database,
    async (transaction, context) => {
      const existing = await findIdempotencyRecord(
        transaction,
        context,
        request.idempotencyKey,
      );
      if (!existing) throw idempotencyConflict();
      return replayStored(existing, request.fingerprint);
    },
    principalResolver,
  );
}

function findIdempotencyRecord(
  transaction: TransactionClient,
  context: P2AuthContext,
  idempotencyKey: string,
) {
  return transaction.p2IdempotencyRecord.findUnique({
    where: {
      workspaceId_operation_idempotencyKey: {
        workspaceId: context.workspaceId,
        operation: CREATE_OPERATION,
        idempotencyKey,
      },
    },
  });
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
    record.responseStatus !== 201 ||
    !isRecord(record.responseBody)
  ) {
    throw idempotencyConflict();
  }
  return responseRecord(record.responseStatus, record.responseBody);
}

async function parseCreateInput(
  request: Request,
): Promise<Readonly<{ displayName: string }>> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") throw validationFailed();

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    throw validationFailed();
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    throw validationFailed();
  }
  if (!isRecord(body)) throw validationFailed();

  const keys = readUniqueTopLevelKeys(rawBody);
  if (
    keys.length > 1 ||
    (keys.length === 1 && keys[0] !== "displayName") ||
    Object.keys(body).length !== keys.length
  ) {
    throw validationFailed();
  }

  try {
    return Object.freeze({
      displayName: normalizeP2ProductProjectDisplayName(body.displayName),
    });
  } catch (error) {
    if (error instanceof P2ProductProjectError) throw validationFailed();
    throw error;
  }
}

function readUniqueTopLevelKeys(rawBody: string): string[] {
  let index = skipWhitespace(rawBody, 0);
  if (rawBody[index] !== "{") throw validationFailed();
  index = skipWhitespace(rawBody, index + 1);
  const keys: string[] = [];
  const seen = new Set<string>();
  if (rawBody[index] === "}") return [];

  while (index < rawBody.length) {
    const parsedKey = readJsonString(rawBody, index);
    if (seen.has(parsedKey.value)) throw validationFailed();
    seen.add(parsedKey.value);
    keys.push(parsedKey.value);
    index = skipWhitespace(rawBody, parsedKey.end);
    if (rawBody[index] !== ":") throw validationFailed();
    index = skipJsonValue(rawBody, skipWhitespace(rawBody, index + 1));
    index = skipWhitespace(rawBody, index);
    if (rawBody[index] === "}") {
      index = skipWhitespace(rawBody, index + 1);
      if (index !== rawBody.length) throw validationFailed();
      return keys;
    }
    if (rawBody[index] !== ",") throw validationFailed();
    index = skipWhitespace(rawBody, index + 1);
  }
  throw validationFailed();
}

function readJsonString(
  input: string,
  start: number,
): Readonly<{ value: string; end: number }> {
  if (input[start] !== '"') throw validationFailed();
  let escaped = false;
  for (let index = start + 1; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      try {
        return Object.freeze({
          value: JSON.parse(input.slice(start, index + 1)) as string,
          end: index + 1,
        });
      } catch {
        throw validationFailed();
      }
    }
  }
  throw validationFailed();
}

function skipJsonValue(input: string, start: number): number {
  let inString = false;
  let escaped = false;
  let nestedDepth = 0;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      nestedDepth += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      if (nestedDepth === 0) return index;
      nestedDepth -= 1;
      continue;
    }
    if (character === "," && nestedDepth === 0) return index;
  }
  return input.length;
}

function skipWhitespace(input: string, start: number): number {
  let index = start;
  while (/\s/.test(input[index] ?? "")) index += 1;
  return index;
}

function parseIdempotencyKey(request: Request): string {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) throw validationFailed();
  return key;
}

function assertProjectId(projectId: unknown): asserts projectId is string {
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    projectId.length > 256 ||
    projectId !== projectId.trim() ||
    /[\u0000-\u001f\u007f-\u009f]/.test(projectId)
  ) {
    throw validationFailed();
  }
}

function frozenPrincipalResolver(
  principal: unknown,
): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      return principal;
    },
  });
}

function safeProject(project: P2ProductProjectResource) {
  return Object.freeze({
    projectId: project.projectId,
    displayName: project.displayName,
    status: project.status,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
  });
}

function safeCard(card: P2ProductInformationCard) {
  return Object.freeze({
    project: Object.freeze({
      projectId: card.project.projectId,
      displayName: card.project.displayName,
      status: card.project.status,
      archivedAt: card.project.archivedAt?.toISOString() ?? null,
      createdAt: card.project.createdAt.toISOString(),
    }),
    activeTruthRevision: card.activeTruthRevision
      ? Object.freeze({
          productTruthRevisionId:
            card.activeTruthRevision.productTruthRevisionId,
          revisionNumber: card.activeTruthRevision.revisionNumber,
          truthBody: card.activeTruthRevision.truthBody,
          productContinuity: card.activeTruthRevision.productContinuity,
          status: card.activeTruthRevision.status,
          parentRevisionId: card.activeTruthRevision.parentRevisionId,
          activatedAt: card.activeTruthRevision.activatedAt.toISOString(),
          createdAt: card.activeTruthRevision.createdAt.toISOString(),
        })
      : null,
    sourceSummary: card.sourceSummary,
  });
}

function projectErrorResponse(error: unknown, requestId: string): Response {
  const mapped = mapError(error);
  return Response.json(
    { error: { code: mapped.code, message: mapped.message, requestId } },
    { status: mapped.status },
  );
}

function mapError(error: unknown): Readonly<{
  code: string;
  status: number;
  message: string;
}> {
  if (error instanceof P2AuthContextError) {
    return { code: error.code, status: error.status, message: error.message };
  }
  if (error instanceof P2ProductProjectError) {
    if (error.code === "PROJECT_NOT_FOUND") {
      return { code: error.code, status: 404, message: error.message };
    }
    return {
      code: "VALIDATION_FAILED",
      status: 400,
      message: "Request is invalid.",
    };
  }
  if (error instanceof P2ProductProjectHttpError) {
    if (error.code === "VALIDATION_FAILED") {
      return { code: error.code, status: 400, message: "Request is invalid." };
    }
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return {
        code: error.code,
        status: 409,
        message: "Idempotency key conflicts with another request.",
      };
    }
  }
  return {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Service temporarily unavailable.",
  };
}

function responseRecord(
  status: number,
  body: Record<string, unknown>,
): StoredResponse {
  return Object.freeze({
    status,
    body: JSON.parse(JSON.stringify(body)) as Record<string, unknown>,
  });
}

function fingerprintRequest(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
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

function isPrismaUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validationFailed(): P2ProductProjectHttpError {
  return new P2ProductProjectHttpError("VALIDATION_FAILED");
}

function idempotencyConflict(): P2ProductProjectHttpError {
  return new P2ProductProjectHttpError("IDEMPOTENCY_CONFLICT");
}
