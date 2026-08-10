import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";
import { z } from "zod";

import type {
  GeneratedImagePayload,
  NormalizedGenerationUsage,
} from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;

const normalizedUsageSchema = z
  .object({
    generatedImages: z.number().int().min(1).max(10),
    inputUnits: z.number().int().nonnegative().nullable(),
    outputPixels: z.number().int().positive(),
    costMetadata: z
      .object({
        amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
        currency: z.string().regex(/^[A-Z]{3}$/),
        estimated: z.boolean(),
      })
      .strict(),
  })
  .strict();

type GeneratedFormat = "png" | "jpeg" | "webp";

const FORMAT_RULES: Record<
  GeneratedFormat,
  { mimeType: string; extension: string }
> = {
  png: { mimeType: "image/png", extension: "png" },
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  webp: { mimeType: "image/webp", extension: "webp" },
};

export type ValidatedGeneratedBackground = {
  body: Uint8Array;
  mimeType: string;
  extension: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

export async function validateGeneratedBackground(
  image: GeneratedImagePayload | unknown,
  expectedCanvas: { width: number; height: number },
  providerRequestId: string,
): Promise<ValidatedGeneratedBackground> {
  if (
    typeof image !== "object" ||
    image === null ||
    !("body" in image) ||
    !("mimeType" in image) ||
    !(image.body instanceof Uint8Array) ||
    typeof image.mimeType !== "string" ||
    image.body.byteLength === 0 ||
    image.body.byteLength > MAX_GENERATED_IMAGE_BYTES
  ) {
    throw invalidResponse(providerRequestId, "生成图片大小无效。");
  }

  const signatureFormat = detectSignature(image.body);
  const declaredFormat = findFormatByMimeType(image.mimeType);
  if (!signatureFormat || signatureFormat !== declaredFormat) {
    throw invalidResponse(providerRequestId, "生成图片 MIME 与内容不一致。");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(image.body, {
      failOn: "error",
      limitInputPixels: 100_000_000,
    }).metadata();
  } catch {
    throw invalidResponse(providerRequestId, "生成图片无法解码。");
  }

  if (
    metadata.format !== signatureFormat ||
    metadata.width !== expectedCanvas.width ||
    metadata.height !== expectedCanvas.height
  ) {
    throw invalidResponse(providerRequestId, "生成图片尺寸不符合画布要求。");
  }

  const rule = FORMAT_RULES[signatureFormat];
  return {
    body: image.body,
    mimeType: rule.mimeType,
    extension: rule.extension,
    byteSize: image.body.byteLength,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash("sha256").update(image.body).digest("hex"),
  };
}

export function validateNormalizedGenerationUsage(
  usage: unknown,
  providerRequestId: string,
): NormalizedGenerationUsage {
  const result = normalizedUsageSchema.safeParse(usage);
  if (!result.success) {
    throw invalidResponse(providerRequestId, "归一化用量数据无效。");
  }

  return result.data;
}

export function parseStoredGenerationUsage(
  usageJson: unknown,
  costMetadataJson: unknown,
  providerRequestId: string,
): NormalizedGenerationUsage {
  const usageRecord =
    typeof usageJson === "object" &&
    usageJson !== null &&
    !Array.isArray(usageJson)
      ? usageJson
      : {};

  return validateNormalizedGenerationUsage(
    { ...usageRecord, costMetadata: costMetadataJson },
    providerRequestId,
  );
}

function findFormatByMimeType(mimeType: string): GeneratedFormat | undefined {
  return (
    Object.entries(FORMAT_RULES) as Array<
      [GeneratedFormat, (typeof FORMAT_RULES)[GeneratedFormat]]
    >
  ).find(([, rule]) => rule.mimeType === mimeType.toLowerCase())?.[0];
}

function detectSignature(body: Uint8Array): GeneratedFormat | undefined {
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

function invalidResponse(providerRequestId: string, message: string) {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    providerRequestId,
  );
}
