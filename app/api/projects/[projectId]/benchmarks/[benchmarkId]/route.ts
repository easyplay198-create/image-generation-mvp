import { BenchmarkService } from "@/src/benchmarks/benchmark-service";
import { getDemoOwnerId } from "@/src/config/environment";
import { createRequestId, errorResponse, successResponse } from "@/src/http/api";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BenchmarkContext = {
  params: Promise<{ projectId: string; benchmarkId: string }>;
};

export async function GET(_request: Request, context: BenchmarkContext) {
  const requestId = createRequestId();
  const { projectId, benchmarkId } = await context.params;
  let ownerId: string | undefined;
  try {
    ownerId = getDemoOwnerId();
    const benchmark = await new BenchmarkService(getDatabaseClient()).getRun(
      ownerId,
      projectId,
      benchmarkId,
    );
    return successResponse({ benchmark }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "benchmark.read",
    });
  }
}
