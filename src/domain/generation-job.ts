import { z } from "zod";

import { ApiError } from "@/src/http/api";

const idempotencyKeySchema = z
  .string({ error: "幂等键必须是字符串。" })
  .trim()
  .min(8, "幂等键至少需要 8 个字符。")
  .max(120, "幂等键不能超过 120 个字符。")
  .regex(/^[A-Za-z0-9._:-]+$/, "幂等键包含不支持的字符。");

export const createGenerationJobSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    styleSpecRevisionId: z
      .string({ error: "StyleSpec revision ID 必须是字符串。" })
      .trim()
      .min(1, "必须明确指定 StyleSpec revision。")
      .max(120, "StyleSpec revision ID 过长。"),
  })
  .strict();

export type CreateGenerationJobInput = z.infer<
  typeof createGenerationJobSchema
>;

export const generationJobInputSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    requestId: z.string().uuid(),
    idempotencyKey: idempotencyKeySchema,
    styleSpecRevisionId: z.string().min(1).max(120),
    productContext: z
      .object({
        productName: z.string().min(1).max(200),
        category: z.string().min(1).max(120),
        sellingPoints: z.array(z.string().min(1).max(200)).min(1).max(5),
        targetAudience: z.string().max(500).nullable(),
        forbiddenClaims: z.array(z.string().min(1).max(200)).max(20),
      })
      .strict(),
    canvas: z
      .object({
        width: z.literal(1080),
        height: z.literal(1080),
      })
      .strict(),
  })
  .strict();

export type GenerationJobInput = z.infer<typeof generationJobInputSchema>;

export function parseCreateGenerationJob(
  input: unknown,
): CreateGenerationJobInput {
  const result = createGenerationJobSchema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "图片生成任务参数校验失败。",
      { fields: result.error.flatten().fieldErrors },
    );
  }

  return result.data;
}

export function parseGenerationJobInput(input: unknown): GenerationJobInput {
  const result = generationJobInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Persisted image generation input is invalid.");
  }

  return result.data;
}
