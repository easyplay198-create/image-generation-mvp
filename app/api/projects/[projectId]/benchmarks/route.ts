import { parseCreateBenchmarkRun } from "@/src/benchmarks/benchmark-contract";
import { BenchmarkService } from "@/src/benchmarks/benchmark-service";
import { createPlainPromptQwenProvider } from "@/src/benchmarks/plain-prompt-qwen-provider";
import { getDemoOwnerId } from "@/src/config/environment";
import { createRequestId, errorResponse, readJsonBody, successResponse } from "@/src/http/api";
import { createImageGenerationProvider } from "@/src/providers/image-generation-factory";
import { getDatabaseClient } from "@/src/storage/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;
  try {
    ownerId = getDemoOwnerId();
    const benchmarks = await new BenchmarkService(getDatabaseClient()).listRuns(
      ownerId,
      projectId,
    );
    return successResponse({ benchmarks }, requestId);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "benchmark.list",
    });
  }
}

export async function POST(request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;
  try {
    ownerId = getDemoOwnerId();
    const input = parseCreateBenchmarkRun(await readJsonBody(request));
    const generationProvider = createImageGenerationProvider();
    const plainProvider = createPlainPromptQwenProvider();
    const benchmark = await new BenchmarkService(getDatabaseClient()).createRun({
      ownerId,
      projectId,
      request: input,
      providerName: generationProvider.name,
      modelName: plainProvider.modelName,
    });
    return successResponse({ benchmark }, requestId, 202);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "benchmark.create",
    });
  }
}
