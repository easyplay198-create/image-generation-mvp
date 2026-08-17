import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BenchmarkPanel, {
  canCreateBenchmark,
} from "@/app/projects/[projectId]/benchmark-panel";
import { POST as createBenchmarkRoute } from "@/app/api/projects/[projectId]/benchmarks/route";
import {
  parseListBenchmarkRuns,
} from "@/src/benchmarks/benchmark-contract";
import {
  createExperimentFingerprint,
  stableCanonicalSerialize,
} from "@/src/benchmarks/benchmark-service";
import {
  parseGenerationJobInput,
} from "@/src/domain/generation-job";
import { formatGenerationCost } from "@/src/domain/generation-flow";
import { parseStoredGenerationUsage } from "@/src/domain/generated-background";
import {
  compileQwenNegativePrompt,
  compileQwenPrompt,
  QWEN_NEGATIVE_PROMPT_MAX_CHARACTERS,
  QWEN_PROMPT_SAFE_UTF8_BYTES,
} from "@/src/providers/qwen-prompt";
import {
  resolveBenchmarkRuntimeCapability,
  VISUAL_PIPELINE_CAPABILITY,
} from "@/src/vision/runtime-capability";

describe("PKG-AB P1 remediation contracts", () => {
  it("accepts both persisted generation job schema 1.0 and 1.1", () => {
    const common = {
      requestId: crypto.randomUUID(),
      idempotencyKey: "legacy-job-0001",
      styleSpecRevisionId: "revision-1",
      productContext: {
        productName: "Generic product",
        category: "Accessories",
        sellingPoints: ["Compact"],
        targetAudience: null,
        forbiddenClaims: [],
      },
    };
    expect(
      parseGenerationJobInput({
        ...common,
        schemaVersion: "1.0",
        canvas: { width: 1080, height: 1080 },
      }).schemaVersion,
    ).toBe("1.0");
    expect(
      parseGenerationJobInput({
        ...common,
        schemaVersion: "1.1",
        generationContext: {
          schemaVersion: "1.0",
          styleSpecRevisionNumber: 1,
          visualReferences: [],
          canvas: { width: 800, height: 800 },
        },
      }).schemaVersion,
    ).toBe("1.1");
  });

  it("keeps mandatory safety terms ahead of optional negative terms", () => {
    const required = ["人物", "文字", "商标", "重复商品"];
    const negative = compileQwenNegativePrompt(
      required,
      Array.from({ length: 100 }, (_, index) => `可选约束-${index}-${"x".repeat(20)}`),
    );
    expect(negative.length).toBeLessThanOrEqual(
      QWEN_NEGATIVE_PROMPT_MAX_CHARACTERS,
    );
    for (const term of required) expect(negative).toContain(term);
  });

  it("enforces a conservative positive prompt budget without trimming required safety", () => {
    const prompt = compileQwenPrompt(
      ["不得添加人物、文字、价格、商标或水印。"],
      Array.from({ length: 100 }, (_, index) => `可选风格-${index}-${"风格".repeat(30)}`),
    );
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThanOrEqual(
      QWEN_PROMPT_SAFE_UTF8_BYTES,
    );
    expect(prompt).toContain("不得添加人物、文字、价格、商标或水印");
  });

  it("maps historical zero-like cost records to unknown instead of treating them as evidence", () => {
    const parsed = parseStoredGenerationUsage(
      { generatedImages: 1, inputUnits: null, outputPixels: 640_000 },
      { amount: "0.0000", currency: "CNY", estimated: true },
      "legacy-request",
    );
    expect(parsed.costMetadata).toEqual({
      status: "UNKNOWN",
      amount: null,
      currency: null,
      estimated: false,
      reason: "LEGACY_UNVERIFIED_COST",
    });
  });

  it("uses a deterministic canonical experiment fingerprint", () => {
    const experiment = {
      modelName: "qwen-image-2.0",
      prompt: "same prompt",
      productSha256: "a".repeat(64),
    };
    expect(createExperimentFingerprint(experiment)).toBe(
      createExperimentFingerprint({ ...experiment }),
    );
    expect(createExperimentFingerprint(experiment)).not.toBe(
      createExperimentFingerprint({ ...experiment, prompt: "changed" }),
    );
  });

  it("canonicalizes nested object keys while preserving semantic array order", () => {
    const left = {
      z: [{ b: 2, a: 1 }, { b: 4, a: 3 }],
      a: { y: "value", x: true },
    };
    const right = {
      a: { x: true, y: "value" },
      z: [{ a: 1, b: 2 }, { a: 3, b: 4 }],
    };
    expect(stableCanonicalSerialize(left)).toBe(
      stableCanonicalSerialize(right),
    );
    expect(createExperimentFingerprint(left)).toBe(
      createExperimentFingerprint(right),
    );
    expect(createExperimentFingerprint(left)).not.toBe(
      createExperimentFingerprint({ ...right, z: [...right.z].reverse() }),
    );
  });

  it.each([
    ["product name", { productName: "B" }],
    ["category", { category: "Other" }],
    ["selling points", { sellingPoints: ["B"] }],
    ["target audience", { targetAudience: "B" }],
    ["forbidden claims", { forbiddenClaims: ["B"] }],
    ["product hash", { productSha256: "b".repeat(64) }],
  ])("changes the experiment fingerprint when %s changes", (_, change) => {
    const baseline = {
      productContext: {
        productName: "A",
        category: "Category",
        sellingPoints: ["A"],
        targetAudience: null,
        forbiddenClaims: ["A"],
      },
      productSha256: "a".repeat(64),
    };
    const candidate = {
      ...baseline,
      ...("productSha256" in change
        ? { productSha256: change.productSha256 }
        : {
            productContext: {
              ...baseline.productContext,
              ...change,
            },
          }),
    };
    expect(createExperimentFingerprint(candidate)).not.toBe(
      createExperimentFingerprint(baseline),
    );
  });

  it("exposes only a safe capability enum and disables unavailable benchmark UI", () => {
    const secret = "test-secret-that-must-not-render";
    expect(
      resolveBenchmarkRuntimeCapability({
        IMAGE_GENERATION_PROVIDER: "qwen",
        QWEN_API_KEY: secret,
      }),
    ).toBe("AVAILABLE");
    expect(
      resolveBenchmarkRuntimeCapability({
        IMAGE_GENERATION_PROVIDER: "qwen",
      }),
    ).toBe("UNAVAILABLE");
    expect(canCreateBenchmark("UNAVAILABLE")).toBe(false);

    const html = renderToStaticMarkup(
      createElement(BenchmarkPanel, {
        projectId: "project-safe",
        revision: { id: "revision-safe", revisionNumber: 2 },
        runtimeCapability: "UNAVAILABLE",
      }),
    );
    expect(html).toContain("Qwen Benchmark 当前不可用");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain(secret);
    expect(html).not.toContain("aliyuncs.com");

    const availableHtml = renderToStaticMarkup(
      createElement(BenchmarkPanel, {
        projectId: "project-safe",
        revision: { id: "revision-safe", revisionNumber: 2 },
        runtimeCapability: "AVAILABLE",
      }),
    );
    const createButton = availableHtml.match(/<button[^>]*primary-button[^>]*>/)?.[0];
    expect(createButton).toBeTruthy();
    expect(createButton).not.toContain("disabled");
  });

  it("rejects unavailable benchmark POST before provider or database construction", async () => {
    const previous = {
      ownerId: process.env.MVP_DEMO_USER_ID,
      provider: process.env.IMAGE_GENERATION_PROVIDER,
      apiKey: process.env.QWEN_API_KEY,
    };
    const previousConsoleError = console.error;
    try {
      process.env.MVP_DEMO_USER_ID = "test-owner";
      process.env.IMAGE_GENERATION_PROVIDER = "qwen";
      delete process.env.QWEN_API_KEY;
      console.error = () => undefined;
      const response = await createBenchmarkRoute(
        new Request("https://example.test/api/projects/project-safe/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invalid: "body is intentionally unread" }),
        }),
        { params: Promise.resolve({ projectId: "project-safe" }) },
      );
      const body = await response.text();
      expect(response.status).toBe(503);
      expect(body).toContain("Qwen Benchmark 当前不可用");
      expect(body).not.toContain("QWEN_API_KEY");
    } finally {
      console.error = previousConsoleError;
      restoreEnvironment("MVP_DEMO_USER_ID", previous.ownerId);
      restoreEnvironment("IMAGE_GENERATION_PROVIDER", previous.provider);
      restoreEnvironment("QWEN_API_KEY", previous.apiKey);
    }
  });

  it("labels legacy zero-like cost separately from unknown current pricing", () => {
    expect(
      formatGenerationCost({
        status: "UNKNOWN",
        amount: null,
        currency: null,
        estimated: false,
        reason: "LEGACY_UNVERIFIED_COST",
      }),
    ).toBe("历史零值记录，定价未核验");
    expect(
      formatGenerationCost({
        status: "UNKNOWN",
        amount: null,
        currency: null,
        estimated: false,
        reason: "PRICING_NOT_VERIFIED",
      }),
    ).toBe("成本未知");
    expect(
      formatGenerationCost({
        status: "ESTIMATED",
        amount: "1.25",
        currency: "CNY",
        estimated: true,
        model: "qwen-image-2.0",
        region: "cn-beijing",
        pricingVersion: "fixture-v1",
        source: "https://example.test/pricing",
      }),
    ).toBe("1.25 CNY（估算）");
    expect(
      formatGenerationCost({
        status: "UNKNOWN",
        amount: null,
        currency: null,
        estimated: false,
        reason: "LEGACY_UNVERIFIED_COST",
      }),
    ).not.toMatch(/0(?:\.0+)?/);
  });

  it("bounds benchmark history pagination", () => {
    expect(parseListBenchmarkRuns("https://example.test/api?limit=50")).toEqual({
      limit: 50,
    });
    expect(() =>
      parseListBenchmarkRuns("https://example.test/api?limit=51"),
    ).toThrow();
  });

  it("declares visual pipeline runtime honestly", () => {
    expect(VISUAL_PIPELINE_CAPABILITY).toMatchObject({
      status: "CONTRACTS_AND_SCAFFOLDING_ONLY",
      runtimeAvailable: false,
    });
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
