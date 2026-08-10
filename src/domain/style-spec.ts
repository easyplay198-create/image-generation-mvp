import { z } from "zod";

const text = (label: string, maximum: number) =>
  z
    .string({ error: `${label}必须是字符串。` })
    .trim()
    .min(1, `${label}不能为空。`)
    .max(maximum, `${label}不能超过 ${maximum} 个字符。`);

const shortText = (label: string) => text(label, 120);
const textList = (
  label: string,
  minimum: number,
  maximum: number,
) =>
  z
    .array(shortText(label), { error: `${label}必须是字符串数组。` })
    .min(minimum, `${label}至少需要 ${minimum} 项。`)
    .max(maximum, `${label}最多允许 ${maximum} 项。`);

export const styleSpecV1Schema = z
  .object({
    schemaVersion: z.literal("1.0", {
      error: "StyleSpec schemaVersion 必须为 1.0。",
    }),
    summary: text("风格摘要", 600),
    moodKeywords: textList("氛围关键词", 1, 12),
    palette: z
      .array(
        z
          .object({
            hex: z
              .string({ error: "色板颜色必须是字符串。" })
              .trim()
              .regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须使用 #RRGGBB 格式。")
              .transform((value) => value.toUpperCase()),
            role: shortText("颜色角色"),
          })
          .strict(),
        { error: "色板必须是数组。" },
      )
      .min(1, "色板至少需要 1 个颜色。")
      .max(8, "色板最多允许 8 个颜色。"),
    background: z
      .object({
        scene: text("背景场景", 300),
        texture: text("背景质感", 200),
        lighting: text("背景光线", 200),
      })
      .strict(),
    composition: z
      .object({
        productPlacement: text("商品位置", 200),
        cameraAngle: text("相机角度", 200),
        negativeSpace: text("留白策略", 200),
      })
      .strict(),
    typography: z
      .object({
        tone: text("字体语气", 200),
        recommendedStyles: textList("推荐字体风格", 1, 8),
      })
      .strict(),
    decorations: textList("装饰元素", 0, 12),
    negativeConstraints: textList("负向约束", 0, 20),
  })
  .strict();

export type StyleSpecV1 = z.infer<typeof styleSpecV1Schema>;

export class StyleSpecValidationError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "StyleSpecValidationError";
  }
}

export function parseStyleSpecV1(input: unknown): StyleSpecV1 {
  let candidate = input;

  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      throw new StyleSpecValidationError("StyleSpec 不是有效的 JSON。");
    }
  }

  const result = styleSpecV1Schema.safeParse(candidate);
  if (!result.success) {
    throw new StyleSpecValidationError(
      "StyleSpec 不符合 V1 Schema。",
      result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
