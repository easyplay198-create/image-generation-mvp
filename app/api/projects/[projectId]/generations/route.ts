import { getDemoOwnerId } from "@/src/config/environment";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/src/http/api";
import { GenerationService } from "@/src/services/generation-service";
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
    const generations = await new GenerationService(
      getDatabaseClient(),
    ).listGenerations(ownerId, projectId);

    return successResponse({ generations }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "image-generation.list",
    });
  }
}
