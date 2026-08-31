import { randomUUID } from "node:crypto";

import {
  denyP2WorkspacePrincipal,
  P2AuthContextError,
  type P2WorkspacePrincipalResolver,
} from "@/src/auth/workspace-membership-scope";
import { MAX_UPLOAD_BYTES } from "@/src/domain/asset-upload";
import { ApiError } from "@/src/http/api";
import {
  P2SourceSnapshotError,
  registerP2SourceSnapshot,
  type P2SourceSnapshotResource,
} from "@/src/sources/source-snapshot";
import type { DatabaseClient } from "@/src/storage/database";
import type { ObjectStorage } from "@/src/storage/object-storage";

type Dependencies = Readonly<{
  database: DatabaseClient;
  createObjectStorage: () => ObjectStorage;
  principalResolver?: P2WorkspacePrincipalResolver;
  createRequestId?: () => string;
}>;

type RouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

export function createP2SourceSnapshotHttpHandlers(dependencies: Dependencies) {
  const principalResolver =
    dependencies.principalResolver ?? denyP2WorkspacePrincipal;
  const createRequestId = dependencies.createRequestId ?? randomUUID;

  return Object.freeze({
    async post(request: Request, context: RouteContext): Promise<Response> {
      const requestId = createRequestId();

      try {
        const { projectId } = await context.params;
        assertProjectId(projectId);

        const principal = await principalResolver.resolve();
        assertRequestSize(request);
        const formData = await readFormData(request);
        const input = readExactUploadInput(formData);
        const storage = dependencies.createObjectStorage();
        const snapshot = await registerP2SourceSnapshot(
          dependencies.database,
          storage,
          {
            projectId,
            sourceKind: input.sourceKind,
            file: input.file,
          },
          Object.freeze({ async resolve() { return principal; } }),
        );

        return Response.json(
          { result: safeSnapshot(snapshot), requestId },
          { status: 201 },
        );
      } catch (error) {
        return sourceSnapshotErrorResponse(error, requestId);
      }
    },
  });
}

function assertProjectId(projectId: unknown): asserts projectId is string {
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    projectId.length > 256 ||
    projectId !== projectId.trim() ||
    /[\u0000-\u001f\u007f-\u009f]/.test(projectId)
  ) {
    throw new ApiError("VALIDATION_FAILED", 400, "Project identifier is invalid.");
  }
}

function assertRequestSize(request: Request): void {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength === null) return;

  const contentLength = Number(rawContentLength);
  const multipartAllowance = 1024 * 1024;
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength < 0
  ) {
    throw new ApiError("VALIDATION_FAILED", 400, "Content length is invalid.");
  }
  if (contentLength > MAX_UPLOAD_BYTES + multipartAllowance) {
    throw new ApiError(
      "FILE_TOO_LARGE",
      413,
      "Single image uploads cannot exceed 20 MiB.",
    );
  }
}

async function readFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "Upload request must use multipart/form-data.",
    );
  }

  try {
    return await request.formData();
  } catch {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "Upload request must contain valid multipart/form-data.",
    );
  }
}

function readExactUploadInput(formData: FormData): Readonly<{
  sourceKind: FormDataEntryValue;
  file: FormDataEntryValue;
}> {
  const entries = [...formData.entries()];
  const keys = entries.map(([key]) => key).sort();
  if (
    entries.length !== 2 ||
    keys[0] !== "file" ||
    keys[1] !== "sourceKind" ||
    formData.getAll("file").length !== 1 ||
    formData.getAll("sourceKind").length !== 1
  ) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "Upload request must contain exactly one sourceKind and one file.",
    );
  }

  return Object.freeze({
    sourceKind: formData.get("sourceKind") as FormDataEntryValue,
    file: formData.get("file") as FormDataEntryValue,
  });
}

function safeSnapshot(snapshot: P2SourceSnapshotResource) {
  return Object.freeze({
    sourceSnapshotId: snapshot.sourceSnapshotId,
    workspaceId: snapshot.workspaceId,
    projectId: snapshot.projectId,
    sourceKind: snapshot.sourceKind,
    mediaType: snapshot.mediaType,
    byteSize: snapshot.byteSize,
    contentDigest: snapshot.contentDigest,
    validationStatus: snapshot.validationStatus,
    lifecycleStatus: snapshot.lifecycleStatus,
    capturedAt: snapshot.capturedAt.toISOString(),
    createdByActorId: snapshot.createdByActorId,
  });
}

function sourceSnapshotErrorResponse(error: unknown, requestId: string): Response {
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
  if (error instanceof ApiError) {
    return { code: error.code, status: error.status, message: error.message };
  }
  if (error instanceof P2SourceSnapshotError) {
    if (error.code === "INVALID_SOURCE_KIND") {
      return { code: error.code, status: 400, message: error.message };
    }
    if (error.code === "PROJECT_NOT_FOUND") {
      return { code: error.code, status: 404, message: error.message };
    }
    return { code: error.code, status: 409, message: error.message };
  }
  return {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Service temporarily unavailable.",
  };
}
