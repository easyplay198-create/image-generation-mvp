import { createHash } from "node:crypto";
import path from "node:path";

import sharp, { type Metadata } from "sharp";
import { z } from "zod";

import { ApiError } from "@/src/http/api";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const uploadAssetKindSchema = z.enum(["PRODUCT", "REFERENCE"]);
export type UploadAssetKind = z.infer<typeof uploadAssetKindSchema>;

type ImageFormat = "png" | "jpeg" | "webp";

const FORMAT_RULES: Record<
  ImageFormat,
  { extensions: string[]; mimeType: string; outputExtension: string }
> = {
  png: {
    extensions: [".png"],
    mimeType: "image/png",
    outputExtension: "png",
  },
  jpeg: {
    extensions: [".jpg", ".jpeg"],
    mimeType: "image/jpeg",
    outputExtension: "jpg",
  },
  webp: {
    extensions: [".webp"],
    mimeType: "image/webp",
    outputExtension: "webp",
  },
};

export type ValidatedImageUpload = {
  body: Uint8Array;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  extension: string;
};

export function parseUploadAssetKind(input: FormDataEntryValue | null) {
  const result = uploadAssetKindSchema.safeParse(input);

  if (!result.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "资产类型只能是 PRODUCT 或 REFERENCE。",
      { field: "kind" },
    );
  }

  return result.data;
}

export async function validateImageUpload(
  file: FormDataEntryValue | null,
): Promise<ValidatedImageUpload> {
  if (!(file instanceof File)) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "必须提供一个图片文件。",
      { field: "file" },
    );
  }

  if (file.size === 0) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "图片文件不能为空。",
      { field: "file" },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      "FILE_TOO_LARGE",
      413,
      "单张图片不能超过 20 MiB。",
      { maximumBytes: MAX_UPLOAD_BYTES },
    );
  }

  const extension = path.extname(file.name).toLowerCase();
  const declaredMimeType = file.type.toLowerCase();
  const extensionFormat = findFormatByExtension(extension);
  const mimeFormat = findFormatByMimeType(declaredMimeType);

  if (!extensionFormat || !mimeFormat) {
    throw unsupportedFileType();
  }

  const body = new Uint8Array(await file.arrayBuffer());
  const signatureFormat = detectSignature(body);

  if (
    !signatureFormat ||
    signatureFormat !== extensionFormat ||
    signatureFormat !== mimeFormat
  ) {
    throw new ApiError(
      "UNSUPPORTED_FILE_TYPE",
      415,
      "图片扩展名、MIME 类型与文件内容不一致。",
    );
  }

  let metadata: Metadata;

  try {
    metadata = await sharp(body, {
      failOn: "error",
      limitInputPixels: 100_000_000,
    }).metadata();
  } catch {
    throw new ApiError(
      "UNSUPPORTED_FILE_TYPE",
      415,
      "图片无法解码或文件已损坏。",
    );
  }

  if (
    metadata.format !== signatureFormat ||
    !metadata.width ||
    !metadata.height ||
    metadata.width <= 0 ||
    metadata.height <= 0
  ) {
    throw new ApiError(
      "UNSUPPORTED_FILE_TYPE",
      415,
      "图片格式或尺寸无效。",
    );
  }

  const rule = FORMAT_RULES[signatureFormat];

  return {
    body,
    mimeType: rule.mimeType,
    byteSize: body.byteLength,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash("sha256").update(body).digest("hex"),
    extension: rule.outputExtension,
  };
}

function findFormatByExtension(extension: string): ImageFormat | undefined {
  return (Object.entries(FORMAT_RULES) as [ImageFormat, (typeof FORMAT_RULES)[ImageFormat]][])
    .find(([, rule]) => rule.extensions.includes(extension))?.[0];
}

function findFormatByMimeType(mimeType: string): ImageFormat | undefined {
  return (Object.entries(FORMAT_RULES) as [ImageFormat, (typeof FORMAT_RULES)[ImageFormat]][])
    .find(([, rule]) => rule.mimeType === mimeType)?.[0];
}

function detectSignature(body: Uint8Array): ImageFormat | undefined {
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  ) {
    return "png";
  }

  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return "jpeg";
  }

  if (
    body.length >= 12 &&
    String.fromCharCode(...body.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...body.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }

  return undefined;
}

function unsupportedFileType() {
  return new ApiError(
    "UNSUPPORTED_FILE_TYPE",
    415,
    "只允许扩展名、MIME 与内容一致的 PNG、JPEG 或 WebP 图片。",
  );
}
