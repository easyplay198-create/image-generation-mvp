import { getDemoOwnerId } from "@/src/config/environment";
import {
  ApiError,
  createRequestId,
  errorResponse,
  readJsonBody,
  successResponse,
} from "@/src/http/api";
import { StyleSpecService } from "@/src/services/style-spec-service";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const styleSpec = await new StyleSpecService(
      getDatabaseClient(),
    ).getState(ownerId, projectId);

    return successResponse({ styleSpec }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "style-spec.read",
    });
  }
}

export async function PUT(request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const body = await readJsonBody(request);
    const revision = await new StyleSpecService(
      getDatabaseClient(),
    ).saveUserRevision({
      ownerId,
      projectId,
      spec: readSpec(body),
    });

    return successResponse({ revision }, requestId, 201);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "style-spec.save",
    });
  }
}

function readSpec(body: unknown): unknown {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("spec" in body) ||
    Object.keys(body).some((key) => key !== "spec")
  ) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "请求正文必须只包含 spec 字段。",
    );
  }

  return body.spec;
}
