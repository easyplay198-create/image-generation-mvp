import { getDemoOwnerId } from "@/src/config/environment";
import { createRequestId, errorResponse } from "@/src/http/api";
import { GenerationService } from "@/src/services/generation-service";
import { getDatabaseClient } from "@/src/storage/database";
import { createS3ObjectStorage } from "@/src/storage/s3-object-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PreviewContext = {
  params: Promise<{ projectId: string; generationId: string }>;
};

export async function GET(_request: Request, context: PreviewContext) {
  const requestId = createRequestId();
  const { projectId, generationId } = await context.params;
  let ownerId: string | undefined;

  try {
    ownerId = getDemoOwnerId();
    const preview = await new GenerationService(
      getDatabaseClient(),
      createS3ObjectStorage(),
    ).getPreview({ ownerId, projectId, generationId });
    const responseBody = new ArrayBuffer(preview.body.byteLength);
    new Uint8Array(responseBody).set(preview.body);

    return new Response(responseBody, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Length": String(preview.byteSize),
        "Content-Type": preview.mimeType,
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, {
      requestId,
      ownerId,
      projectId,
      operation: "image-generation.preview",
    });
  }
}
