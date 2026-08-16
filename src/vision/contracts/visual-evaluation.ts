import { z } from "zod";

import { productProfileSchema } from "@/src/domain/product-understanding";
import { visualStrategySchema } from "@/src/vision/contracts/visual-strategy";

export const VISUAL_EVALUATION_SCHEMA_VERSION = "1.0" as const;
export const VISUAL_EVALUATION_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const VISUAL_EVALUATION_RISK_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export const VISUAL_EVALUATION_SUGGESTION_PRIORITIES = [
  "high",
  "medium",
  "low",
] as const;
export const VISUAL_EVALUATION_AREAS = [
  "product_consistency",
  "strategy_alignment",
  "visual_quality",
  "claim_risk",
] as const;

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_GENERATED_IMAGE_DIMENSION = 8_192;

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
  itemMaximum = 500,
) =>
  z
    .array(text(label, itemMaximum), {
      error: `${label}必须是字符串数组。`,
    })
    .min(minimum, `${label}至少需要 ${minimum} 项。`)
    .max(maximum, `${label}最多允许 ${maximum} 项。`);

const generatedImageSchema = z
  .object({
    assetId: text("生成图片 Asset ID", 120),
    mimeType: z.enum(VISUAL_EVALUATION_IMAGE_MIME_TYPES, {
      error: "生成图片类型只支持 PNG、JPEG 或 WebP。",
    }),
    width: z
      .number({ error: "生成图片宽度必须是数字。" })
      .int("生成图片宽度必须是整数。")
      .min(1, "生成图片宽度必须大于 0。")
      .max(
        MAX_GENERATED_IMAGE_DIMENSION,
        `生成图片宽度不能超过 ${MAX_GENERATED_IMAGE_DIMENSION}。`,
      ),
    height: z
      .number({ error: "生成图片高度必须是数字。" })
      .int("生成图片高度必须是整数。")
      .min(1, "生成图片高度必须大于 0。")
      .max(
        MAX_GENERATED_IMAGE_DIMENSION,
        `生成图片高度不能超过 ${MAX_GENERATED_IMAGE_DIMENSION}。`,
      ),
    body: z
      .instanceof(Uint8Array, { error: "生成图片内容必须是 Uint8Array。" })
      .refine((value) => value.byteLength > 0, "生成图片内容不能为空。")
      .refine(
        (value) => value.byteLength <= MAX_GENERATED_IMAGE_BYTES,
        "生成图片不能超过 20 MiB。",
      ),
  })
  .strict();

const scoredDimensionSchema = (label: string) =>
  z
    .object({
      score: z
        .number({ error: `${label}评分必须是数字。` })
        .int(`${label}评分必须是整数。`)
        .min(0, `${label}评分不能低于 0。`)
        .max(100, `${label}评分不能超过 100。`),
      summary: text(`${label}摘要`, 800),
      findings: textList(`${label}发现`, 0, 20),
    })
    .strict();

const claimRiskSchema = z
  .object({
    level: z.enum(VISUAL_EVALUATION_RISK_LEVELS, {
      error: "声明风险等级必须是 low、medium、high 或 critical。",
    }),
    summary: text("声明风险摘要", 800),
    findings: textList("声明风险发现", 0, 20),
  })
  .strict();

const improvementSuggestionSchema = z
  .object({
    priority: z.enum(VISUAL_EVALUATION_SUGGESTION_PRIORITIES, {
      error: "改进建议优先级必须是 high、medium 或 low。",
    }),
    area: z.enum(VISUAL_EVALUATION_AREAS, {
      error: "改进建议领域无效。",
    }),
    suggestion: text("改进建议", 500),
    rationale: text("改进理由", 500),
  })
  .strict();

export const visualEvaluationInputSchema = z
  .object({
    schemaVersion: z.literal(VISUAL_EVALUATION_SCHEMA_VERSION, {
      error: "Visual Evaluation 输入 schemaVersion 必须为 1.0。",
    }),
    productProfile: productProfileSchema,
    visualStrategy: visualStrategySchema,
    generatedImage: generatedImageSchema,
  })
  .strict();

export const visualEvaluationReportSchema = z
  .object({
    schemaVersion: z.literal(VISUAL_EVALUATION_SCHEMA_VERSION, {
      error: "Visual Evaluation Report schemaVersion 必须为 1.0。",
    }),
    product_consistency: scoredDimensionSchema("商品一致性"),
    strategy_alignment: scoredDimensionSchema("策略一致性"),
    visual_quality: scoredDimensionSchema("视觉质量"),
    claim_risk: claimRiskSchema,
    improvement_suggestions: z
      .array(improvementSuggestionSchema, {
        error: "改进建议必须是数组。",
      })
      .max(20, "改进建议最多允许 20 项。"),
  })
  .strict();

export type VisualEvaluationInput = z.infer<
  typeof visualEvaluationInputSchema
>;
export type VisualEvaluationReport = z.infer<
  typeof visualEvaluationReportSchema
>;

export class VisualEvaluationValidationError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "VisualEvaluationValidationError";
  }
}

export function parseVisualEvaluationInput(
  input: unknown,
): VisualEvaluationInput {
  return parseContract(
    visualEvaluationInputSchema,
    input,
    "Visual Evaluation 输入不符合 V1 Schema。",
  );
}

export function parseVisualEvaluationReport(
  input: unknown,
): VisualEvaluationReport {
  let candidate = input;

  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      throw new VisualEvaluationValidationError(
        "Visual Evaluation Report 不是有效的 JSON。",
      );
    }
  }

  return parseContract(
    visualEvaluationReportSchema,
    candidate,
    "Visual Evaluation Report 不符合 V1 Schema。",
  );
}

function parseContract<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  message: string,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new VisualEvaluationValidationError(
      message,
      result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
