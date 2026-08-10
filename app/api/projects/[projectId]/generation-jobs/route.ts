import { getDemoOwnerId } from "@/src/config/environment";
import { parseCreateGenerationJob } from "@/src/domain/generation-job";
import {
  createRequestId,
  errorResponse,
  readJsonBody,
  successResponse,
} from "@/src/http/api";
import { createImageGenerationProvider } from "@/src/providers/image-generation-factory";
import { GenerationService } from "@/src/services/generation-service";
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
    const input = parseCreateGenerationJob(await readJsonBody(request));
    const provider = createImageGenerationProvider();
    const job = await new GenerationService(getDatabaseClient()).createJob({
      ownerId,
      projectId,
      providerName: provider.name,
      requestId,
      request: input,
    });

    return successResponse({ job }, requestId, 202);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "image-generation.create",
    });
  }
}
