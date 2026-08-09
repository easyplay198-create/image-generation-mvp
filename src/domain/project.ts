import { z } from "zod";

import { ApiError } from "@/src/http/api";

const requiredText = (label: string, maximum: number) =>
  z
    .string({ error: `${label}必须是字符串。` })
    .trim()
    .min(1, `${label}不能为空。`)
    .max(maximum, `${label}不能超过 ${maximum} 个字符。`);

const optionalText = (label: string, maximum: number) =>
  z
    .string({ error: `${label}必须是字符串。` })
    .trim()
    .max(maximum, `${label}不能超过 ${maximum} 个字符。`)
    .nullable()
    .optional();

const sellingPointsSchema = z
  .array(requiredText("卖点", 200), { error: "卖点必须是字符串数组。" })
  .min(1, "至少需要 1 条非空卖点。")
  .max(5, "最多只能填写 5 条卖点。");

const forbiddenClaimsSchema = z
  .array(requiredText("禁用宣传语", 200), {
    error: "禁用宣传语必须是字符串数组。",
  })
  .max(20, "禁用宣传语最多 20 条。");

export const projectCreateSchema = z
  .object({
    name: requiredText("项目名称", 120),
    productName: requiredText("商品名称", 200),
    category: requiredText("商品类目", 120),
    sellingPoints: sellingPointsSchema,
    targetAudience: optionalText("目标受众", 500),
    forbiddenClaims: forbiddenClaimsSchema.optional().default([]),
  })
  .strict()
  .transform((value) => ({
    ...value,
    targetAudience: value.targetAudience || null,
  }));

export const projectUpdateSchema = z
  .object({
    name: requiredText("项目名称", 120).optional(),
    productName: requiredText("商品名称", 200).optional(),
    category: requiredText("商品类目", 120).optional(),
    sellingPoints: sellingPointsSchema.optional(),
    targetAudience: optionalText("目标受众", 500),
    forbiddenClaims: forbiddenClaimsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个需要更新的字段。",
  })
  .transform((value) =>
    value.targetAudience === undefined
      ? value
      : { ...value, targetAudience: value.targetAudience || null },
  );

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export function parseProjectCreate(input: unknown): ProjectCreateInput {
  return parseProject(projectCreateSchema, input);
}

export function parseProjectUpdate(input: unknown): ProjectUpdateInput {
  return parseProject(projectUpdateSchema, input);
}

function parseProject<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      400,
      "商品项目信息校验失败。",
      { fields: result.error.flatten().fieldErrors },
    );
  }

  return result.data;
}
