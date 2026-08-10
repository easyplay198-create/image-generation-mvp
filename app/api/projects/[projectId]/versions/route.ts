import { getDemoOwnerId } from "@/src/config/environment";
import { parseSaveDesignVersionRequest } from "@/src/domain/design-version";
import {
  createRequestId,
  errorResponse,
  readJsonBody,
  successResponse,
} from "@/src/http/api";
import { DesignVersionService } from "@/src/services/design-version-service";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const input = parseSaveDesignVersionRequest(await readJsonBody(request));
    const version = await new DesignVersionService(
      getDatabaseClient(),
    ).saveVersion({ ownerId, projectId, document: input.document });

    return successResponse({ version }, requestId, 201);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "design-version.save",
    });
  }
}
