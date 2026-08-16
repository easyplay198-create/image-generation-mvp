import { z } from "zod";

import { visualDnaSchema } from "@/src/domain/competitor-visual-dna";
import { productProfileSchema } from "@/src/domain/product-understanding";

export const VISUAL_STRATEGY_SCHEMA_VERSION = "1.0" as const;
export const VISUAL_STRATEGY_TEXT_DENSITIES = [
  "none",
  "low",
  "medium",
  "high",
] as const;

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

const marketInfoSchema = z
  .object({
    countryOrRegion: text("国家或地区", 120),
    marketplace: text("市场平台", 120).nullable(),
    targetAudience: text("市场目标受众", 500).nullable(),
    priceSegment: text("价格带", 120).nullable(),
    notes: textList("市场备注", 0, 10, 300),
  })
  .strict();

const brandDirectionSchema = z
  .object({
    brandName: text("品牌名称", 120).nullable(),
    personality: textList("品牌个性", 1, 10, 120),
    tone: text("品牌语调", 300).nullable(),
    mustKeep: textList("品牌必须保留项", 0, 12, 300),
    avoid: textList("品牌规避项", 0, 12, 300),
  })
  .strict();

const textDirectionSchema = z
  .object({
    hierarchy: text("文字层级方向", 500),
    tone: text("文案语调方向", 300),
    density: z.enum(VISUAL_STRATEGY_TEXT_DENSITIES, {
      error: "目标文字密度必须是 none、low、medium 或 high。",
    }),
    placement: textList("文字位置方向", 1, 10, 300),
    copy_principles: textList("文案原则", 1, 12, 300),
  })
  .strict();

const sellingPointPriorityItemSchema = z
  .object({
    priority: z
      .number({ error: "卖点优先级必须是数字。" })
      .int("卖点优先级必须是整数。")
      .min(1, "卖点优先级必须从 1 开始。")
      .max(20, "卖点优先级不能超过 20。"),
    selling_point: text("优先卖点", 300),
    rationale: text("卖点优先级理由", 500),
  })
  .strict();

const sellingPointPrioritySchema = z
  .array(sellingPointPriorityItemSchema, {
    error: "卖点优先级必须是数组。",
  })
  .min(1, "卖点优先级至少需要 1 项。")
  .max(12, "卖点优先级最多允许 12 项。")
  .refine(
    (items) => items.every((item, index) => item.priority === index + 1),
    "卖点优先级必须按数组顺序从 1 连续递增。",
  );

const generationGuidanceSchema = z
  .object({
    objective: text("生成目标", 800),
    prompt_principles: textList("提示词原则", 1, 20, 500),
    must_include: textList("生成必须包含项", 1, 20, 500),
    must_avoid: textList("生成必须规避项", 0, 20, 500),
  })
  .strict();

export const visualStrategyInputSchema = z
  .object({
    schemaVersion: z.literal(VISUAL_STRATEGY_SCHEMA_VERSION, {
      error: "Visual Strategy 输入 schemaVersion 必须为 1.0。",
    }),
    productProfile: productProfileSchema,
    visualDna: visualDnaSchema,
    marketInfo: marketInfoSchema.optional(),
    brandDirection: brandDirectionSchema.optional(),
  })
  .strict();

export const visualStrategySchema = z
  .object({
    schemaVersion: z.literal(VISUAL_STRATEGY_SCHEMA_VERSION, {
      error: "Visual Strategy schemaVersion 必须为 1.0。",
    }),
    strategy_name: text("策略名称", 160),
    target_user: text("目标用户", 500),
    user_psychology: textList("用户心理", 1, 12),
    positioning: text("视觉定位", 800),
    scene_direction: textList("场景方向", 1, 16),
    composition_direction: textList("构图方向", 1, 16),
    visual_style_direction: textList("视觉风格方向", 1, 16),
    text_direction: textDirectionSchema,
    selling_point_priority: sellingPointPrioritySchema,
    risk_notes: textList("风险提示", 0, 20),
    generation_guidance: generationGuidanceSchema,
  })
  .strict();

export type VisualStrategyInput = z.infer<typeof visualStrategyInputSchema>;
export type VisualStrategy = z.infer<typeof visualStrategySchema>;

export class VisualStrategyValidationError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "VisualStrategyValidationError";
  }
}

export function parseVisualStrategyInput(input: unknown): VisualStrategyInput {
  return parseContract(
    visualStrategyInputSchema,
    input,
    "Visual Strategy 输入不符合 V1 Schema。",
  );
}

export function parseVisualStrategy(input: unknown): VisualStrategy {
  let candidate = input;

  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      throw new VisualStrategyValidationError(
        "Visual Strategy 不是有效的 JSON。",
      );
    }
  }

  return parseContract(
    visualStrategySchema,
    candidate,
    "Visual Strategy 不符合 V1 Schema。",
  );
}

function parseContract<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  message: string,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new VisualStrategyValidationError(
      message,
      result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
