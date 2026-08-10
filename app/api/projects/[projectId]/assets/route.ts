import { getDemoOwnerId } from "@/src/config/environment";
import {
  MAX_UPLOAD_BYTES,
  parseUploadAssetKind,
} from "@/src/domain/asset-upload";
import {
  ApiError,
  createRequestId,
  errorResponse,
  successResponse,
} from "@/src/http/api";
import { AssetService } from "@/src/services/asset-service";
import { getDatabaseClient } from "@/src/storage/database";
import { createS3ObjectStorage } from "@/src/storage/s3-object-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AssetContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: AssetContext) {
  const requestId = createRequestId();
  const { projectId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    assertRequestSize(request);
    const formData = await readFormData(request);
    const kind = parseUploadAssetKind(formData.get("kind"));
    const asset = await new AssetService(
      getDatabaseClient(),
      createS3ObjectStorage(),
    ).uploadAsset({
      ownerId,
      projectId,
      kind,
      file: formData.get("file"),
    });

    return successResponse({ asset }, requestId, 201);
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "asset.upload",
    });
  }
}

function assertRequestSize(request: Request): void {
  const contentLength = Number(request.headers.get("content-length"));
  const multipartAllowance = 1024 * 1024;

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_UPLOAD_BYTES + multipartAllowance
  ) {
    throw new ApiError(
      "FILE_TOO_LARGE",
      413,
      "单张图片不能超过 20 MiB。",
      { maximumBytes: MAX_UPLOAD_BYTES },
    );
  }
}

async function readFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "上传请求必须使用有效的 multipart/form-data。",
    );
  }
}
