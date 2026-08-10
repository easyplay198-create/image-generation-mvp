import { getDemoOwnerId } from "@/src/config/environment";
import { parseCreateStyleAnalysisJob } from "@/src/domain/style-analysis-job";
import {
  createRequestId,
  errorResponse,
  readJsonBody,
  successResponse,
} from "@/src/http/api";
import { createStyleAnalyzerProvider } from "@/src/providers/style-analyzer-factory";
import { StyleAnalysisJobService } from "@/src/services/style-analysis-job-service";
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
    const input = parseCreateStyleAnalysisJob(await readJsonBody(request));
    const provider = createStyleAnalyzerProvider();
    const job = await new StyleAnalysisJobService(
      getDatabaseClient(),
    ).createJob({
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
      operation: "style-analysis.create",
    });
  }
}
