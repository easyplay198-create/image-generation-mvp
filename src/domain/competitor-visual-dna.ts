import { z } from "zod";

export const COMPETITOR_VISUAL_DNA_SCHEMA_VERSION = "1.0" as const;
export const COMPETITOR_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const VISUAL_DNA_TEXT_DENSITIES = [
  "none",
  "low",
  "medium",
  "high",
  "mixed",
] as const;

const MAX_COMPETITOR_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_COMPETITOR_IMAGE_DIMENSION = 8_192;

const text = (label: string, maximum: number) =>
  z
    .string({ error: `${label}必须是字符串。` })
    .trim()
    .min(1, `${label}不能为空。`)
    .max(maximum, `${label}不能超过 ${maximum} 个字符。`);

const textList = (
  label: string,
  minimum: number,
  maximum: number,
  itemMaximum = 300,
) =>
  z
    .array(text(label, itemMaximum), {
      error: `${label}必须是字符串数组。`,
    })
    .min(minimum, `${label}至少需要 ${minimum} 项。`)
    .max(maximum, `${label}最多允许 ${maximum} 项。`);

const competitorImageSchema = z
  .object({
    assetId: text("竞品图片 Asset ID", 120),
    mimeType: z.enum(COMPETITOR_IMAGE_MIME_TYPES, {
      error: "竞品图片类型只支持 PNG、JPEG 或 WebP。",
    }),
    width: z
      .number({ error: "竞品图片宽度必须是数字。" })
      .int("竞品图片宽度必须是整数。")
      .min(1, "竞品图片宽度必须大于 0。")
      .max(
        MAX_COMPETITOR_IMAGE_DIMENSION,
        `竞品图片宽度不能超过 ${MAX_COMPETITOR_IMAGE_DIMENSION}。`,
      ),
    height: z
      .number({ error: "竞品图片高度必须是数字。" })
      .int("竞品图片高度必须是整数。")
      .min(1, "竞品图片高度必须大于 0。")
      .max(
        MAX_COMPETITOR_IMAGE_DIMENSION,
        `竞品图片高度不能超过 ${MAX_COMPETITOR_IMAGE_DIMENSION}。`,
      ),
    body: z
      .instanceof(Uint8Array, { error: "竞品图片内容必须是 Uint8Array。" })
      .refine((value) => value.byteLength > 0, "竞品图片内容不能为空。")
      .refine(
        (value) => value.byteLength <= MAX_COMPETITOR_IMAGE_BYTES,
        "单张竞品图片不能超过 20 MiB。",
      ),
  })
  .strict();

const marketInfoSchema = z
  .object({
    countryOrRegion: text("国家或地区", 120),
    marketplace: text("市场平台", 120).nullable(),
    targetAudience: text("市场目标受众", 500).nullable(),
    priceSegment: text("价格带", 120).nullable(),
    notes: textList("市场备注", 0, 10, 300),
  })
  .strict();

const competitorImagesSchema = z
  .array(competitorImageSchema, {
    error: "竞品图片集合必须是数组。",
  })
  .min(1, "至少需要 1 张竞品图片。")
  .max(20, "竞品图片最多允许 20 张。")
  .refine(
    (images) =>
      new Set(images.map((image) => image.assetId)).size === images.length,
    "竞品图片 Asset ID 不能重复。",
  );

const colorSchema = z
  .string({ error: "主色必须是字符串。" })
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, "主色必须使用 #RRGGBB 格式。")
  .transform((value) => value.toUpperCase());

export const competitorVisualDnaInputSchema = z
  .object({
    schemaVersion: z.literal(COMPETITOR_VISUAL_DNA_SCHEMA_VERSION, {
      error: "Competitor Visual DNA schemaVersion 必须为 1.0。",
    }),
    competitorImages: competitorImagesSchema,
    productCategory: text("商品类别", 120),
    marketInfo: marketInfoSchema,
  })
  .strict();

export const visualDnaSchema = z
  .object({
    schemaVersion: z.literal(COMPETITOR_VISUAL_DNA_SCHEMA_VERSION, {
      error: "Visual DNA schemaVersion 必须为 1.0。",
    }),
    dominant_colors: z
      .array(colorSchema, { error: "主色必须是颜色数组。" })
      .min(1, "主色至少需要 1 项。")
      .max(12, "主色最多允许 12 项。"),
    composition_patterns: textList("构图模式", 1, 20),
    scene_patterns: textList("场景模式", 1, 20),
    text_density: z.enum(VISUAL_DNA_TEXT_DENSITIES, {
      error: "文字密度必须是 none、low、medium、high 或 mixed。",
    }),
    visual_style: textList("视觉风格", 1, 20),
    opportunities: textList("视觉机会", 1, 20),
  })
  .strict();

export type CompetitorVisualDnaInput = z.infer<
  typeof competitorVisualDnaInputSchema
>;
export type VisualDna = z.infer<typeof visualDnaSchema>;

export class CompetitorVisualDnaValidationError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "CompetitorVisualDnaValidationError";
  }
}

export function parseCompetitorVisualDnaInput(
  input: unknown,
): CompetitorVisualDnaInput {
  return parseContract(
    competitorVisualDnaInputSchema,
    input,
    "Competitor Visual DNA 输入不符合 V1 Schema。",
  );
}

export function parseVisualDna(input: unknown): VisualDna {
  let candidate = input;

  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      throw new CompetitorVisualDnaValidationError(
        "Visual DNA 不是有效的 JSON。",
      );
    }
  }

  return parseContract(
    visualDnaSchema,
    candidate,
    "Visual DNA 不符合 V1 Schema。",
  );
}

function parseContract<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  message: string,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new CompetitorVisualDnaValidationError(
      message,
      result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
