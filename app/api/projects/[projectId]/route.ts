import { getDemoOwnerId } from "@/src/config/environment";
import { parseProjectUpdate } from "@/src/domain/project";
import {
  createRequestId,
  errorResponse,
  readJsonBody,
  successResponse,
} from "@/src/http/api";
import { ProjectService } from "@/src/services/project-service";
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
    const project = await new ProjectService(
      getDatabaseClient(),
    ).getProject(ownerId, projectId);

    return successResponse({ project }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "project.read",
    });
  }
}

export async function PATCH(request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const input = parseProjectUpdate(await readJsonBody(request));
    const project = await new ProjectService(
      getDatabaseClient(),
    ).updateProject(ownerId, projectId, input);

    return successResponse({ project }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "project.update",
    });
  }
}
