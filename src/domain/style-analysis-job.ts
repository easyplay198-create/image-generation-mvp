import { z } from "zod";

import { ApiError } from "@/src/http/api";

const idempotencyKeySchema = z
  .string({ error: "幂等键必须是字符串。" })
  .trim()
  .min(8, "幂等键至少需要 8 个字符。")
  .max(120, "幂等键不能超过 120 个字符。")
  .regex(/^[A-Za-z0-9._:-]+$/, "幂等键包含不支持的字符。");

export const createStyleAnalysisJobSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateStyleAnalysisJobInput = z.infer<
  typeof createStyleAnalysisJobSchema
>;

export const styleAnalysisJobInputSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    requestId: z.string().uuid(),
    productInfo: z
      .object({
        productName: z.string().min(1).max(200),
        category: z.string().min(1).max(120),
        sellingPoints: z.array(z.string().min(1).max(200)).min(1).max(5),
        targetAudience: z.string().max(500).nullable(),
        forbiddenClaims: z.array(z.string().min(1).max(200)).max(20),
      })
      .strict(),
    referenceAssetIds: z.array(z.string().min(1)).min(1).max(6),
  })
  .strict();

export type StyleAnalysisJobInput = z.infer<
  typeof styleAnalysisJobInputSchema
>;

export function parseCreateStyleAnalysisJob(
  input: unknown,
): CreateStyleAnalysisJobInput {
  const result = createStyleAnalysisJobSchema.safeParse(input);

  if (!result.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "风格分析任务参数校验失败。",
      { fields: result.error.flatten().fieldErrors },
    );
  }

  return result.data;
}

export function parseStyleAnalysisJobInput(
  input: unknown,
): StyleAnalysisJobInput {
  const result = styleAnalysisJobInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Persisted style analysis input is invalid.");
  }

  return result.data;
}
