import { describe, expect, it } from "vitest";

import {
  benchmarkJobInputSchema,
  createBenchmarkRunSchema,
} from "@/src/benchmarks/benchmark-contract";

const product = {
  assetId: "product-1",
  mimeType: "image/png" as const,
  width: 919,
  height: 1230,
  byteSize: 1234,
  sha256: "a".repeat(64),
};

describe("benchmark contract", () => {
  it("accepts a plain prompt experiment request", () => {
    expect(
      createBenchmarkRunSchema.parse({
        idempotencyKey: "benchmark:request:1",
        plainPrompt: "生成一张简洁的电商商品主图，保留商品外观，不添加文字。",
        styleSpecRevisionId: "revision-2",
      }),
    ).toMatchObject({ styleSpecRevisionId: "revision-2" });
  });

  it("locks persisted jobs to 800 x 800 and StyleSpec revision 2", () => {
    const base = {
      schemaVersion: "1.0",
      requestId: "32cba31e-91a8-4c3d-a536-dc20a14b6ff0",
      modelName: "qwen-image-2.0",
      productReference: product,
      canvas: { width: 800, height: 800 },
      variant: "STYLE_SPEC",
      styleSpecRevisionId: "revision-2",
      styleSpecRevisionNumber: 2,
      productContext: {
        productName: "MU-006-L",
        category: "汽车应急设备",
        sellingPoints: ["应急启动与轮胎充气一体"],
        targetAudience: "俄罗斯汽车车主",
        forbiddenClaims: ["100%启动"],
      },
      visualReferences: [{ ...product, assetId: "reference-1", sha256: "b".repeat(64) }],
      generationContext: {
        schemaVersion: "1.0",
        styleSpecRevisionNumber: 2,
        productReference: product,
        visualReferences: [{ ...product, assetId: "reference-1", sha256: "b".repeat(64) }],
        canvas: { width: 800, height: 800 },
      },
    };

    expect(benchmarkJobInputSchema.safeParse(base).success).toBe(true);
    expect(
      benchmarkJobInputSchema.safeParse({
        ...base,
        canvas: { width: 1080, height: 1080 },
      }).success,
    ).toBe(false);
    expect(
      benchmarkJobInputSchema.safeParse({
        ...base,
        styleSpecRevisionNumber: 3,
      }).success,
    ).toBe(false);
  });
});
