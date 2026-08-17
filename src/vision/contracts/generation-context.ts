import { z } from "zod";

import { visualDnaSchema } from "@/src/domain/competitor-visual-dna";
import { productProfileSchema } from "@/src/domain/product-understanding";
import type { StyleSpecV1 } from "@/src/domain/style-spec";
import { visualStrategySchema } from "@/src/vision/contracts/visual-strategy";

export const GENERATION_CONTEXT_SCHEMA_VERSION = "1.0" as const;

export const generationContextSourceSchema = z
  .object({
    productProfile: productProfileSchema,
    visualDna: visualDnaSchema,
    visualStrategy: visualStrategySchema,
  })
  .strict();

export type GenerationContextSource = z.infer<
  typeof generationContextSourceSchema
>;

export type GenerationContext = {
  schemaVersion: typeof GENERATION_CONTEXT_SCHEMA_VERSION;
  styleSpec: StyleSpecV1;
};

export class GenerationContextValidationError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "GenerationContextValidationError";
  }
}

export function parseGenerationContextSource(
  input: unknown,
): GenerationContextSource {
  const result = generationContextSourceSchema.safeParse(input);
  if (!result.success) {
    throw new GenerationContextValidationError(
      "Generation Context 输入不符合 V1 Schema。",
      result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
