import { randomUUID } from "node:crypto";

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "PROJECT_NOT_FOUND"
  | "ASSET_NOT_FOUND"
  | "ASSET_LIMIT_REACHED"
  | "STYLE_SPEC_INVALID"
  | "JOB_CONFLICT"
  | "JOB_NOT_FOUND"
  | "GENERATION_NOT_FOUND"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_POLICY_REJECTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_INVALID_RESPONSE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createRequestId(): string {
  return randomUUID();
}

export function successResponse(
  payload: Record<string, unknown>,
  requestId: string,
  status = 200,
): Response {
  return Response.json({ ...payload, requestId }, { status });
}

type ErrorContext = {
  requestId: string;
  operation: string;
  ownerId?: string;
  projectId?: string;
  jobId?: string;
};

export function errorResponse(error: unknown, context: ErrorContext): Response {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(
          "INTERNAL_ERROR",
          500,
          "服务暂时不可用，请稍后重试。",
        );

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      requestId: context.requestId,
      ownerId: context.ownerId,
      projectId: context.projectId,
      jobId: context.jobId,
      operation: context.operation,
      result: "failed",
      errorCode: apiError.code,
    }),
  );

  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        requestId: context.requestId,
        details: apiError.details,
      },
    },
    { status: apiError.status },
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "请求正文必须是有效的 JSON。",
    );
  }
}
