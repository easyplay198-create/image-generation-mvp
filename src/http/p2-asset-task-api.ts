import { executeInternalAssetTask, readInternalArtifactContent, InternalExecutionError, INTERNAL_PNG, internalIdentifier, type InternalExecutionDependencies } from "@/src/tasks/internal-asset-task-execution";
import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import {
  denyP2WorkspacePrincipal,
  P2AuthContextError,
  withP2WorkspaceMembershipScope,
  type P2AuthContext,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import type { DatabaseClient, TransactionClient } from "@/src/storage/database";
import {
  createP2AssetTaskInScope,
  getP2AssetTaskInScope,
  P2AssetTaskError,
  type P2AssetTaskResource,
  type P2CreateAssetTaskInput,
} from "@/src/tasks/asset-task";

const CREATE_OPERATION = "asset_task.create.v1";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const CREATE_BODY_KEYS = Object.freeze([
  "assetClass",
  "outputPurpose",
  "productSourceSnapshotId",
  "taskType",
  "truthRevisionId",
]);

type Dependencies = InternalExecutionDependencies & Readonly<{
  database: DatabaseClient;
  principalResolver?: P2WorkspacePrincipalResolver;
  createRequestId?: () => string;
}>;

type ProjectRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

type AssetTaskRouteContext = Readonly<{
  params: Promise<{ projectId: string; assetTaskId: string }>;
}>;

type StoredResponse = Readonly<{
  status: number;
  body: Record<string, unknown>;
}>;

type ParsedCreateInput = Readonly<{
  taskType: "INTERNAL_SINGLE_IMAGE";
  assetClass: "IMAGE";
  outputPurpose: "INTERNAL_TEST";
  truthRevisionId: string;
  productSourceSnapshotId: string;
}>;

class P2IdempotencyInsertConflict extends Error {
  constructor() {
    super("P2_IDEMPOTENCY_INSERT_CONFLICT");
    this.name = "P2IdempotencyInsertConflict";
  }
}

export class P2AssetTaskHttpError extends Error {
  constructor(
    readonly code:
      | "VALIDATION_FAILED"
      | "IDEMPOTENCY_CONFLICT"
      | "INTERNAL_ERROR",
  ) {
    super(code);
    this.name = "P2AssetTaskHttpError";
  }
}

export function createP2AssetTaskHttpHandlers(dependencies: Dependencies) {
  const principalResolver =
    dependencies.principalResolver ?? denyP2WorkspacePrincipal;
  const createRequestId = dependencies.createRequestId ?? randomUUID;

  return Object.freeze({
    async execute(request: Request, context: AssetTaskRouteContext): Promise<Response> {
      const requestId = createRequestId();
      try {
        const principal = await principalResolver.resolve();
        const { projectId, assetTaskId } = await context.params;
        internalIdentifier(projectId); internalIdentifier(assetTaskId);
        if (request.headers.has("content-type") || request.headers.has("idempotency-key") || new URL(request.url).search || await request.text() !== "") throw new InternalExecutionError("VALIDATION_FAILED");
        const output = await executeInternalAssetTask({ ...dependencies, principalResolver: frozenPrincipalResolver(principal) }, { projectId, assetTaskId }, requestId);
        return Response.json({ assetTaskId: output.assetTaskId, status: output.state, requestId: output.requestId }, { status: output.status, headers: { Location: `/api/p2/projects/${encodeURIComponent(projectId)}/asset-tasks/${encodeURIComponent(assetTaskId)}`, "X-Request-Id": output.requestId, "Cache-Control": "private, no-store" } });
      } catch (error) { return internalErrorResponse(error, requestId); }
    },
    async content(request: Request, context: Readonly<{ params: Promise<{ projectId: string; assetTaskId: string; artifactId: string; artifactRevisionId: string }> }>): Promise<Response> {
      const requestId = createRequestId();
      try {
        const principal = await principalResolver.resolve();
        const input = await context.params;
        if (new URL(request.url).search) throw new InternalExecutionError("VALIDATION_FAILED");
        const accept = request.headers.get("accept");
        if (accept && !accept.split(",").some((part) => ["image/png", "image/*", "*/*"].includes(part.trim().split(";", 1)[0]) && !/;\s*q=0(?:\.0*)?(?:;|$)/.test(part))) throw new InternalExecutionError("NOT_ACCEPTABLE");
        const bytes = await readInternalArtifactContent({ ...dependencies, principalResolver: frozenPrincipalResolver(principal) }, input);
        return internalContentResponse(bytes, request, requestId);
      } catch (error) { return internalErrorResponse(error, requestId); }
    },
    async post(
      request: Request,
      context: ProjectRouteContext,
    ): Promise<Response> {
      const requestId = createRequestId();
      try {
        const principal = await principalResolver.resolve();
        const { projectId } = await context.params;
        const canonicalProjectId = parseCanonicalIdentifier(projectId);
        const idempotencyKey = parseIdempotencyKey(request);
        const input = await parseCreateInput(request);
        const fingerprint = fingerprintRequest({
          operation: CREATE_OPERATION,
          projectId: canonicalProjectId,
          input,
        });
        const stored = await runIdempotentCreate(
          dependencies.database,
          frozenPrincipalResolver(principal),
          {
            projectId: canonicalProjectId,
            idempotencyKey,
            fingerprint,
            input,
            requestId,
          },
        );
        return Response.json(stored.body, { status: stored.status });
      } catch (error) {
        return assetTaskErrorResponse(error, requestId);
      }
    },

    async get(
      _request: Request,
      context: AssetTaskRouteContext,
    ): Promise<Response> {
      const requestId = createRequestId();
      try {
        const principal = await principalResolver.resolve();
        const { projectId, assetTaskId } = await context.params;
        const assetTask = await withP2WorkspaceMembershipScope(
          dependencies.database,
          (transaction, authContext) =>
            getP2AssetTaskInScope(transaction, authContext, {
              projectId,
              assetTaskId,
            }),
          frozenPrincipalResolver(principal),
        );
        return Response.json({ assetTask: safeAssetTask(assetTask), requestId });
      } catch (error) {
        return internalErrorResponse(error, requestId);
      }
    },
  });
}

async function runIdempotentCreate(
  database: DatabaseClient,
  principalResolver: P2WorkspacePrincipalResolver,
  request: Readonly<{
    projectId: string;
    idempotencyKey: string;
    fingerprint: string;
    input: ParsedCreateInput;
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

        const assetTask = await createP2AssetTaskInScope(
          transaction,
          context,
          toDomainInput(request.projectId, request.input),
        );
        const response = responseRecord(202, {
          assetTask: safeAssetTask(assetTask),
          requestId: request.requestId,
        });
        const idempotencyRecordId = `p2_idempotency_${randomUUID()}`;
        try {
          await transaction.p2IdempotencyRecord.create({
            data: {
              idempotencyRecordId,
              workspaceId: context.workspaceId,
              projectId: request.projectId,
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
    record.responseStatus !== 202 ||
    !isRecord(record.responseBody)
  ) {
    throw idempotencyConflict();
  }
  return responseRecord(record.responseStatus, record.responseBody);
}

async function parseCreateInput(request: Request): Promise<ParsedCreateInput> {
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

  const keys = readUniqueTopLevelKeys(rawBody).sort();
  if (
    keys.length !== CREATE_BODY_KEYS.length ||
    keys.some((key, index) => key !== CREATE_BODY_KEYS[index]) ||
    Object.keys(body).length !== CREATE_BODY_KEYS.length
  ) {
    throw validationFailed();
  }

  return Object.freeze({
    taskType: parseTaskType(body.taskType),
    assetClass: parseAssetClass(body.assetClass),
    outputPurpose: parseOutputPurpose(body.outputPurpose),
    truthRevisionId: parseCanonicalIdentifier(body.truthRevisionId),
    productSourceSnapshotId: parseCanonicalIdentifier(
      body.productSourceSnapshotId,
    ),
  });
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

function toDomainInput(
  projectId: string,
  input: ParsedCreateInput,
): P2CreateAssetTaskInput {
  return Object.freeze({ projectId, ...input });
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

function safeAssetTask(assetTask: P2AssetTaskResource) {
  return Object.freeze({
    assetTaskId: assetTask.assetTaskId,
    projectId: assetTask.projectId,
    taskType: assetTask.taskType,
    assetClass: assetTask.assetClass,
    outputPurpose: assetTask.outputPurpose,
    truthRevisionId: assetTask.truthRevisionId,
    productSourceSnapshotId: assetTask.productSourceSnapshotId,
    status: assetTask.status,
    createdAt: assetTask.createdAt.toISOString(),
    generationAttemptSummary: assetTask.generationAttemptSummary ?? null,
    artifactRevisionSummary: assetTask.artifactRevisionSummary ?? null,
  });
}

function assetTaskErrorResponse(error: unknown, requestId: string): Response {
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
  if (error instanceof P2AssetTaskError) {
    if (error.code === "ASSET_TASK_NOT_FOUND") {
      return { code: error.code, status: 404, message: error.message };
    }
    if (error.code === "ASSET_TASK_DEPENDENCY_CONFLICT") {
      return { code: error.code, status: 409, message: error.message };
    }
    return {
      code: "VALIDATION_FAILED",
      status: 400,
      message: "Request is invalid.",
    };
  }
  if (error instanceof P2AssetTaskHttpError) {
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

function validationFailed(): P2AssetTaskHttpError {
  return new P2AssetTaskHttpError("VALIDATION_FAILED");
}

function idempotencyConflict(): P2AssetTaskHttpError {
  return new P2AssetTaskHttpError("IDEMPOTENCY_CONFLICT");
}

const INTERNAL_ERRORS: Record<string, readonly [number, string, boolean, boolean, boolean]> = {
  AUTH_REQUIRED: [401, "AUTHENTICATION", false, true, true],
  FORBIDDEN_SCOPE: [403, "AUTHORIZATION", false, false, true],
  VALIDATION_FAILED: [400, "INPUT", false, true, true],
  TASK_CONFLICT: [409, "TASK_STATE", false, true, true],
  ASSET_TASK_NOT_FOUND: [404, "RESOURCE", false, false, true],
  ASSET_TASK_EXECUTION_FAILED: [409, "TASK_STATE", false, true, true],
  ASSET_TASK_EXECUTION_AMBIGUOUS: [503, "TASK_STATE", false, true, true],
  SERVICE_UNAVAILABLE: [503, "INTERNAL", true, false, false],
  DATABASE_TRANSACTION_RETRY_REQUIRED: [503, "CONCURRENCY", true, false, false],
  ASSET_TASK_CLAIM_LOCK_TIMEOUT: [503, "CONCURRENCY", true, false, false],
  DATABASE_COMMIT_OUTCOME_UNKNOWN: [503, "CONCURRENCY", false, true, true],
  ARTIFACT_NOT_FOUND: [404, "RESOURCE", false, false, true],
  ARTIFACT_CONTENT_UNAVAILABLE: [502, "STORAGE_TRANSIENT", true, false, false],
  ARTIFACT_CONTENT_INTEGRITY_MISMATCH: [502, "STORAGE_INTEGRITY", false, true, true],
  NOT_ACCEPTABLE: [406, "INPUT", false, true, true],
  RANGE_NOT_SATISFIABLE: [416, "INPUT", false, true, true],
  INTERNAL_ERROR: [500, "INTERNAL", true, false, false],
};

export function internalErrorResponse(error: unknown, currentRequestId: string): Response {
  const candidate = error instanceof InternalExecutionError || error instanceof P2AuthContextError || error instanceof P2AssetTaskError ? error.code : "INTERNAL_ERROR";
  const code = Object.hasOwn(INTERNAL_ERRORS, candidate) ? candidate : "INTERNAL_ERROR";
  const [status, category, retryable, userActionRequired, hardBlock] = INTERNAL_ERRORS[code];
  const requestId = error instanceof InternalExecutionError ? error.durableRequestId ?? currentRequestId : currentRequestId;
  return Response.json({ error: { code, category, retryable, userActionRequired, hardBlock, message: "The requested operation could not be completed.", requestId, details: {} } }, { status, headers: { "X-Request-Id": requestId, "Cache-Control": "private, no-store", ...(status === 416 ? { "Content-Range": "bytes */68" } : {}) } });
}

export function internalContentResponse(bytes: Uint8Array, request: Request, requestId: string): Response {
  const etag = `"sha256-${INTERNAL_PNG.digest}"`;
  const headers = new Headers({ "Content-Type": "image/png", "Content-Length": "68", "Content-Digest": `sha-256=:${INTERNAL_PNG.digestBase64}:`, ETag: etag, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId, "Accept-Ranges": "bytes" });
  const conditions = request.headers.get("if-none-match")?.split(",").map((s) => s.trim().replace(/^W\//, ""));
  if (conditions?.includes(etag) || conditions?.includes("*")) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }
  const range = request.headers.get("range");
  if (range !== null) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) throw new InternalExecutionError("RANGE_NOT_SATISFIABLE");
    let start = match[1] ? Number(match[1]) : Math.max(0, 68 - Number(match[2]));
    let end = match[1] && match[2] ? Math.min(67, Number(match[2])) : 67;
    if (![start, end, ...(match[1] ? [Number(match[1])] : []), ...(match[2] ? [Number(match[2])] : [])].every(Number.isSafeInteger) || start > end || start >= 68 || !match[1] && Number(match[2]) === 0) throw new InternalExecutionError("RANGE_NOT_SATISFIABLE");
    start = Math.max(0, start); end = Math.min(67, end);
    headers.set("Content-Range", `bytes ${start}-${end}/68`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Uint8Array.from(bytes.slice(start, end + 1)), { status: 206, headers });
  }
  return new Response(Uint8Array.from(bytes), { status: 200, headers });
}
