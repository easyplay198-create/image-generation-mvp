import { z } from "zod";

import { ApiError } from "@/src/http/api";

const id = z.string().trim().min(1).max(120);

export const createBenchmarkRunSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(120)
      .regex(/^[A-Za-z0-9._:-]+$/),
    plainPrompt: z.string().trim().min(20).max(2_000),
    styleSpecRevisionId: id,
  })
  .strict();

export type CreateBenchmarkRunInput = z.infer<
  typeof createBenchmarkRunSchema
>;

const listBenchmarkRunsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: id.optional(),
});

export type ListBenchmarkRunsInput = z.infer<typeof listBenchmarkRunsSchema>;

const assetSnapshotSchema = z
  .object({
    assetId: id,
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    width: z.number().int().positive().max(8_192),
    height: z.number().int().positive().max(8_192),
    byteSize: z.number().int().positive().max(20 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const canvasSchema = z
  .object({ width: z.literal(800), height: z.literal(800) })
  .strict();

const productContextSchema = z
  .object({
    productName: z.string().min(1).max(200),
    category: z.string().min(1).max(120),
    sellingPoints: z.array(z.string().min(1).max(200)).min(1).max(5),
    targetAudience: z.string().max(500).nullable(),
    forbiddenClaims: z.array(z.string().min(1).max(200)).max(20),
  })
  .strict();

const sharedJobFields = {
  schemaVersion: z.literal("1.0"),
  requestId: z.string().uuid(),
  modelName: z.string().trim().min(1).max(120),
  productReference: assetSnapshotSchema,
  canvas: canvasSchema,
};

const plainPromptJobInputSchema = z
  .object({
    ...sharedJobFields,
    variant: z.literal("PLAIN_PROMPT"),
    prompt: z.string().trim().min(20).max(2_000),
  })
  .strict();

const styleSpecJobInputSchema = z
  .object({
    ...sharedJobFields,
    variant: z.literal("STYLE_SPEC"),
    styleSpecRevisionId: id,
    styleSpecRevisionNumber: z.literal(2),
    productContext: productContextSchema,
    visualReferences: z.array(assetSnapshotSchema).min(1).max(2),
    generationContext: z
      .object({
        schemaVersion: z.literal("1.0"),
        styleSpecRevisionNumber: z.literal(2),
        productReference: assetSnapshotSchema,
        visualReferences: z.array(assetSnapshotSchema).min(1).max(2),
        canvas: canvasSchema,
      })
      .strict(),
  })
  .strict();

export const benchmarkJobInputSchema = z.discriminatedUnion("variant", [
  plainPromptJobInputSchema,
  styleSpecJobInputSchema,
]);

export type BenchmarkJobInput = z.infer<typeof benchmarkJobInputSchema>;
export type BenchmarkAssetSnapshot = z.infer<typeof assetSnapshotSchema>;

export function parseCreateBenchmarkRun(
  input: unknown,
): CreateBenchmarkRunInput {
  const parsed = createBenchmarkRunSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "Benchmark 参数校验失败。",
      { fields: parsed.error.flatten().fieldErrors },
    );
  }
  return parsed.data;
}

export function parseBenchmarkJobInput(input: unknown): BenchmarkJobInput {
  const parsed = benchmarkJobInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Persisted benchmark job input is invalid.");
  return parsed.data;
}

export function parseListBenchmarkRuns(url: string): ListBenchmarkRunsInput {
  const searchParams = new URL(url).searchParams;
  const parsed = listBenchmarkRunsSchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", 400, "Benchmark 列表参数无效。");
  }
  return parsed.data;
}
