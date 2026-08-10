import { getDemoOwnerId } from "@/src/config/environment";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/src/http/api";
import { StyleAnalysisJobService } from "@/src/services/style-analysis-job-service";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JobContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, context: JobContext) {
  const requestId = createRequestId();
  const { jobId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const job = await new StyleAnalysisJobService(
      getDatabaseClient(),
    ).getJob(ownerId, jobId);

    return successResponse({ job }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      jobId,
      operation: "style-analysis.read",
    });
  }
}
