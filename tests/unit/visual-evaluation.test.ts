import { describe, expect, it, vi } from "vitest";

import { ProviderAdapterError } from "../../src/providers/provider-error";
import {
  parseVisualEvaluationInput,
  parseVisualEvaluationReport,
  VisualEvaluationValidationError,
  type VisualEvaluationInput,
} from "../../src/vision/contracts/visual-evaluation";
import { VisualEvaluationSkill } from "../../src/vision/services/visual-evaluation-skill";
import type {
  VisualEvaluationProvider,
  VisualEvaluationProviderResult,
} from "../../src/vision/visual-evaluation/visual-evaluation-provider";

describe("Visual Evaluation V1 contracts", () => {
  it("validates and normalizes Product Profile, Visual Strategy and generated image", () => {
    const body = new Uint8Array([1, 2, 3]);
    const input = parseVisualEvaluationInput({
      ...validInput(),
      productProfile: {
        ...validInput().productProfile,
        category: "  Drinkware  ",
      },
      visualStrategy: {
        ...validInput().visualStrategy,
        strategy_name: "  Warm Urban Momentum  ",
      },
      generatedImage: {
        ...validInput().generatedImage,
        assetId: "  generated-asset-1  ",
        body,
      },
    });

    expect(input.productProfile.category).toBe("Drinkware");
    expect(input.visualStrategy.strategy_name).toBe("Warm Urban Momentum");
    expect(input.generatedImage).toMatchObject({
      assetId: "generated-asset-1",
      mimeType: "image/png",
      width: 1080,
      height: 1080,
    });
    expect(input.generatedImage.body).toBe(body);
  });

  it.each([
    [
      "invalid Product Profile",
      {
        ...validInput(),
        productProfile: {
          ...validInput().productProfile,
          product_features: [],
        },
      },
    ],
    [
      "invalid Visual Strategy",
      {
        ...validInput(),
        visualStrategy: {
          ...validInput().visualStrategy,
          composition_direction: [],
        },
      },
    ],
    [
      "unsupported generated image type",
      {
        ...validInput(),
        generatedImage: {
          ...validInput().generatedImage,
          mimeType: "image/svg+xml",
        },
      },
    ],
    [
      "empty generated image",
      {
        ...validInput(),
        generatedImage: {
          ...validInput().generatedImage,
          body: new Uint8Array(),
        },
      },
    ],
    ["unknown input field", { ...validInput(), evaluatorHint: "clip" }],
  ])("rejects %s", (_name, candidate) => {
    expect(() => parseVisualEvaluationInput(candidate)).toThrow(
      VisualEvaluationValidationError,
    );
  });

  it("parses untrusted JSON into the structured evaluation report", () => {
    const report = parseVisualEvaluationReport(
      JSON.stringify({
        ...validReport(),
        product_consistency: {
          ...validReport().product_consistency,
          summary: "  Product shape remains recognizable  ",
        },
        improvement_suggestions: [
          {
            ...validReport().improvement_suggestions[0],
            suggestion: "  Increase edge separation  ",
          },
        ],
      }),
    );

    expect(report).toEqual({
      ...validReport(),
      product_consistency: {
        ...validReport().product_consistency,
        summary: "Product shape remains recognizable",
      },
      improvement_suggestions: [
        {
          ...validReport().improvement_suggestions[0],
          suggestion: "Increase edge separation",
        },
      ],
    });
  });

  it("allows an explicit empty suggestion list when no improvement is needed", () => {
    expect(
      parseVisualEvaluationReport({
        ...validReport(),
        improvement_suggestions: [],
      }).improvement_suggestions,
    ).toEqual([]);
  });

  it.each([
    ["malformed JSON", "{not-json"],
    [
      "out-of-range score",
      {
        ...validReport(),
        visual_quality: { ...validReport().visual_quality, score: 101 },
      },
    ],
    [
      "invalid claim risk",
      {
        ...validReport(),
        claim_risk: { ...validReport().claim_risk, level: "unknown" },
      },
    ],
    [
      "missing suggestions",
      { ...validReport(), improvement_suggestions: undefined },
    ],
    ["unknown output field", { ...validReport(), raw_similarity: 0.88 }],
  ])("rejects an evaluation report with %s", (_name, candidate) => {
    expect(() => parseVisualEvaluationReport(candidate)).toThrow(
      VisualEvaluationValidationError,
    );
  });
});

describe("VisualEvaluationSkill", () => {
  it("passes normalized input to an evaluator-neutral provider and returns a report", async () => {
    const evaluate = vi.fn(async () => ({
      output: JSON.stringify(validReport()),
      providerRequestId: " evaluation-request-1 ",
    }));
    const provider: VisualEvaluationProvider = {
      name: "fake-hybrid-evaluator",
      evaluate,
    };

    await expect(
      new VisualEvaluationSkill(provider).execute({
        ...validInput(),
        generatedImage: {
          ...validInput().generatedImage,
          assetId: "  generated-asset-1  ",
        },
      }),
    ).resolves.toEqual(validReport());

    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedImage: expect.objectContaining({
          assetId: "generated-asset-1",
        }),
      }),
    );
  });

  it("rejects invalid input before invoking the provider", async () => {
    const evaluate = vi.fn(async () => validProviderResult());
    const provider: VisualEvaluationProvider = {
      name: "fake-hybrid-evaluator",
      evaluate,
    };

    await expect(
      new VisualEvaluationSkill(provider).execute({
        ...validInput(),
        generatedImage: {
          ...validInput().generatedImage,
          body: new Uint8Array(),
        },
      }),
    ).rejects.toBeInstanceOf(VisualEvaluationValidationError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("maps an invalid provider report to a non-retryable adapter error", async () => {
    const provider = fakeProvider({
      output: {
        ...validReport(),
        product_consistency: {
          ...validReport().product_consistency,
          score: -1,
        },
      },
      providerRequestId: "evaluation-request-2",
    });

    await expect(
      new VisualEvaluationSkill(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: "evaluation-request-2",
    });
  });

  it.each([
    ["missing request ID", { output: validReport() }],
    [
      "empty request ID",
      { output: validReport(), providerRequestId: "   " },
    ],
  ])("rejects an invalid provider envelope with %s", async (_name, result) => {
    const provider = fakeProvider(result);

    await expect(
      new VisualEvaluationSkill(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: null,
    });
  });

  it("preserves standard provider adapter errors", async () => {
    const providerError = new ProviderAdapterError(
      "PROVIDER_TIMEOUT",
      true,
      "Evaluation provider timed out",
      "evaluation-request-3",
    );
    const provider: VisualEvaluationProvider = {
      name: "fake-hybrid-evaluator",
      evaluate: async () => {
        throw providerError;
      },
    };

    await expect(
      new VisualEvaluationSkill(provider).execute(validInput()),
    ).rejects.toBe(providerError);
  });
});

function validInput(): VisualEvaluationInput {
  return {
    schemaVersion: "1.0",
    productProfile: {
      schemaVersion: "1.0",
      category: "Drinkware",
      product_features: ["Double-wall construction"],
      user_scenarios: ["Commuting"],
      selling_points: ["Portable temperature retention"],
      limitations: ["Not suitable for microwave use"],
      claims: ["Capacity is 500 ml"],
    },
    visualStrategy: {
      schemaVersion: "1.0",
      strategy_name: "Warm Urban Momentum",
      target_user: "Urban commuters who value practical design",
      user_psychology: ["Seeks reliable everyday convenience"],
      positioning:
        "A warm, practical alternative to sterile competitor imagery",
      scene_direction: ["Morning commute in natural light"],
      composition_direction: [
        "Product-centered with space for one proof point",
      ],
      visual_style_direction: [
        "Warm minimalism with restrained blue accents",
      ],
      text_direction: {
        hierarchy: "One concise headline followed by one proof point",
        tone: "Concise and reassuring",
        density: "low",
        placement: ["Keep copy in the upper-left negative space"],
        copy_principles: ["Use factual, non-absolute language"],
      },
      selling_point_priority: [
        {
          priority: 1,
          selling_point: "Portable temperature retention",
          rationale: "Primary purchase motivation",
        },
      ],
      risk_notes: ["Do not imply unlimited heat retention"],
      generation_guidance: {
        objective: "Create a credible commuter-focused hero image",
        prompt_principles: ["Keep the product geometry unchanged"],
        must_include: ["Recognizable morning commute context"],
        must_avoid: ["Unsupported performance badges"],
      },
    },
    generatedImage: {
      assetId: "generated-asset-1",
      mimeType: "image/png",
      width: 1080,
      height: 1080,
      body: new Uint8Array([1, 2, 3]),
    },
  };
}

function validReport() {
  return {
    schemaVersion: "1.0" as const,
    product_consistency: {
      score: 92,
      summary: "Product shape remains recognizable",
      findings: ["Silhouette is preserved"],
    },
    strategy_alignment: {
      score: 84,
      summary: "The commuter positioning is visible",
      findings: ["Morning context supports the target user"],
    },
    visual_quality: {
      score: 78,
      summary: "Lighting is credible but edge separation can improve",
      findings: ["Product edge is soft against the background"],
    },
    claim_risk: {
      level: "low" as const,
      summary: "No unsupported promotional claim is visible",
      findings: [],
    },
    improvement_suggestions: [
      {
        priority: "high" as const,
        area: "visual_quality" as const,
        suggestion: "Increase edge separation",
        rationale: "Improves product readability at thumbnail size",
      },
    ],
  };
}

function validProviderResult(): VisualEvaluationProviderResult {
  return {
    output: validReport(),
    providerRequestId: "evaluation-request-1",
  };
}

function fakeProvider(result: unknown): VisualEvaluationProvider {
  return {
    name: "fake-hybrid-evaluator",
    evaluate: async () => result as VisualEvaluationProviderResult,
  };
}
