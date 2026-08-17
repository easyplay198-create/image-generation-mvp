import {
  parseCreateBenchmarkRun,
  parseListBenchmarkRuns,
} from "@/src/benchmarks/benchmark-contract";
import { BenchmarkService } from "@/src/benchmarks/benchmark-service";
import { createPlainPromptQwenProvider } from "@/src/benchmarks/plain-prompt-qwen-provider";
import { getDemoOwnerId } from "@/src/config/environment";
import { ApiError, createRequestId, errorResponse, readJsonBody, successResponse } from "@/src/http/api";
import { createImageGenerationProvider } from "@/src/providers/image-generation-factory";
import { getDatabaseClient } from "@/src/storage/database";
import { resolveBenchmarkRuntimeCapability } from "@/src/vision/runtime-capability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: ProjectContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;
  try {
    ownerId = getDemoOwnerId();
    const page = await new BenchmarkService(getDatabaseClient()).listRuns(
      ownerId,
      projectId,
      parseListBenchmarkRuns(request.url),
    );
    return successResponse(page, requestId);
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
    if (resolveBenchmarkRuntimeCapability(process.env) !== "AVAILABLE") {
      throw new ApiError(
        "INTERNAL_ERROR",
        503,
        "Qwen Benchmark 当前不可用：服务器配置未就绪。",
      );
    }
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
