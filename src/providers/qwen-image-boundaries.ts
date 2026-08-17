import sharp from "sharp";

import type { ProductReferenceImage } from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";

export const QWEN_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
export const QWEN_MAX_NORMALIZED_INPUT_BYTES = 10 * 1024 * 1024;
const MIN_INPUT_DIMENSION = 384;
const MAX_INPUT_DIMENSION = 3_072;

export async function normalizeQwenInputImage(
  reference: ProductReferenceImage,
  label: string,
): Promise<string> {
  if (
    reference.body.byteLength === 0 ||
    reference.body.byteLength > QWEN_MAX_DOWNLOAD_BYTES ||
    !["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType) ||
    !Number.isInteger(reference.width) ||
    !Number.isInteger(reference.height) ||
    reference.width <= 0 ||
    reference.height <= 0
  ) {
    throw invalidInput(`${label}输入无效。`);
  }

  let image = sharp(reference.body, {
    failOn: "error",
    limitInputPixels: 100_000_000,
  }).rotate();
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw invalidInput(`${label}无法解码。`);
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width !== reference.width ||
    metadata.height !== reference.height
  ) {
    throw invalidInput(`${label}尺寸与资产记录不一致。`);
  }

  const scale = Math.min(
    1,
    MAX_INPUT_DIMENSION / metadata.width,
    MAX_INPUT_DIMENSION / metadata.height,
  );
  const targetWidth = Math.max(MIN_INPUT_DIMENSION, Math.round(metadata.width * scale));
  const targetHeight = Math.max(MIN_INPUT_DIMENSION, Math.round(metadata.height * scale));
  image = image.resize(targetWidth, targetHeight, {
    fit: "inside",
    withoutEnlargement:
      metadata.width >= MIN_INPUT_DIMENSION &&
      metadata.height >= MIN_INPUT_DIMENSION,
  });

  let normalized: Buffer;
  let mimeType = "image/png";
  try {
    normalized = await image.png({ compressionLevel: 9 }).toBuffer();
    if (normalized.byteLength > QWEN_MAX_NORMALIZED_INPUT_BYTES) {
      normalized = await image
        .flatten({ background: "#FFFFFF" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
      mimeType = "image/jpeg";
    }
  } catch {
    throw invalidInput(`${label}归一化失败。`);
  }
  if (normalized.byteLength > QWEN_MAX_NORMALIZED_INPUT_BYTES) {
    throw invalidInput(`${label}归一化后仍超过 10 MiB。`);
  }

  return `data:${mimeType};base64,${normalized.toString("base64")}`;
}

export async function readLimitedImageResponseBody(
  response: Response,
  providerRequestId: string,
  label: string,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
      throw invalidOutput(providerRequestId, `${label}长度无效。`);
    }
    if (declaredLength > QWEN_MAX_DOWNLOAD_BYTES) {
      throw invalidOutput(providerRequestId, `${label}过大。`);
    }
  }
  if (!response.body) {
    throw invalidOutput(providerRequestId, `${label}响应为空。`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      totalBytes += value.byteLength;
      if (totalBytes > QWEN_MAX_DOWNLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidOutput(providerRequestId, `${label}过大。`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) {
    throw invalidOutput(providerRequestId, `${label}大小无效。`);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function invalidInput(message: string): ProviderAdapterError {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    null,
    "NOT_SENT",
  );
}

function invalidOutput(requestId: string, message: string): ProviderAdapterError {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    requestId,
    "MAY_HAVE_BEEN_ACCEPTED",
  );
}
