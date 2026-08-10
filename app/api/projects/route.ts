import { getDemoOwnerId } from "@/src/config/environment";
import { parseProjectCreate } from "@/src/domain/project";
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

export async function GET() {
  const requestId = createRequestId();
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const projects = await new ProjectService(
      getDatabaseClient(),
    ).listProjects(ownerId);

    return successResponse({ projects }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      operation: "project.list",
    });
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const input = parseProjectCreate(await readJsonBody(request));
    const project = await new ProjectService(
      getDatabaseClient(),
    ).createProject(ownerId, input);

    return successResponse({ project }, requestId, 201);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      operation: "project.create",
    });
  }
}
