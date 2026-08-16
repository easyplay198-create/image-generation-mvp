import { z } from "zod";

export const PRODUCT_UNDERSTANDING_SCHEMA_VERSION = "1.0" as const;
export const PRODUCT_UNDERSTANDING_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

const MAX_PRODUCT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_DIMENSION = 8_192;

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

const productImageSchema = z
  .object({
    assetId: text("商品图片 Asset ID", 120),
    mimeType: z.enum(PRODUCT_UNDERSTANDING_IMAGE_MIME_TYPES, {
      error: "商品图片类型只支持 PNG、JPEG 或 WebP。",
    }),
    width: z
      .number({ error: "商品图片宽度必须是数字。" })
      .int("商品图片宽度必须是整数。")
      .min(1, "商品图片宽度必须大于 0。")
      .max(
        MAX_PRODUCT_IMAGE_DIMENSION,
        `商品图片宽度不能超过 ${MAX_PRODUCT_IMAGE_DIMENSION}。`,
      ),
    height: z
      .number({ error: "商品图片高度必须是数字。" })
      .int("商品图片高度必须是整数。")
      .min(1, "商品图片高度必须大于 0。")
      .max(
        MAX_PRODUCT_IMAGE_DIMENSION,
        `商品图片高度不能超过 ${MAX_PRODUCT_IMAGE_DIMENSION}。`,
      ),
    body: z
      .instanceof(Uint8Array, { error: "商品图片内容必须是 Uint8Array。" })
      .refine((value) => value.byteLength > 0, "商品图片内容不能为空。")
      .refine(
        (value) => value.byteLength <= MAX_PRODUCT_IMAGE_BYTES,
        "商品图片不能超过 20 MiB。",
      ),
  })
  .strict();

const productBasicInfoSchema = z
  .object({
    productName: text("商品名称", 200),
    category: text("商品类目", 120),
    sellingPoints: textList("已有卖点", 1, 5, 200),
    targetAudience: text("目标受众", 500).nullable(),
    forbiddenClaims: textList("禁用宣传语", 0, 20, 200),
  })
  .strict();

export const productUnderstandingInputSchema = z
  .object({
    schemaVersion: z.literal(PRODUCT_UNDERSTANDING_SCHEMA_VERSION, {
      error: "Product Understanding schemaVersion 必须为 1.0。",
    }),
    productImage: productImageSchema,
    productInfo: productBasicInfoSchema,
  })
  .strict();

export const productProfileSchema = z
  .object({
    schemaVersion: z.literal(PRODUCT_UNDERSTANDING_SCHEMA_VERSION, {
      error: "Product Profile schemaVersion 必须为 1.0。",
    }),
    category: text("商品类目", 120),
    product_features: textList("商品特征", 1, 20),
    user_scenarios: textList("用户场景", 1, 12),
    selling_points: textList("推荐卖点", 1, 12),
    limitations: textList("商品限制", 0, 20),
    claims: textList("商品声明", 0, 20),
  })
  .strict();

export type ProductUnderstandingInput = z.infer<
  typeof productUnderstandingInputSchema
>;
export type ProductProfile = z.infer<typeof productProfileSchema>;

export class ProductUnderstandingValidationError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "ProductUnderstandingValidationError";
  }
}

export function parseProductUnderstandingInput(
  input: unknown,
): ProductUnderstandingInput {
  return parseContract(
    productUnderstandingInputSchema,
    input,
    "Product Understanding 输入不符合 V1 Schema。",
  );
}

export function parseProductProfile(input: unknown): ProductProfile {
  let candidate = input;

  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      throw new ProductUnderstandingValidationError(
        "Product Profile 不是有效的 JSON。",
      );
    }
  }

  return parseContract(
    productProfileSchema,
    candidate,
    "Product Profile 不符合 V1 Schema。",
  );
}

function parseContract<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  message: string,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ProductUnderstandingValidationError(
      message,
      result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
