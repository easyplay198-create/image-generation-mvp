import { describe, expect, it, vi } from "vitest";

import { ProviderAdapterError } from "../../src/providers/provider-error";
import {
  parseVisualStrategy,
  parseVisualStrategyInput,
  VisualStrategyValidationError,
  type VisualStrategyInput,
} from "../../src/vision/contracts/visual-strategy";
import { VisualStrategyEngine } from "../../src/vision/services/visual-strategy-engine";
import type {
  VisualStrategyProvider,
  VisualStrategyProviderResult,
} from "../../src/vision/visual-strategy/visual-strategy-provider";

describe("Visual Strategy V1 contracts", () => {
  it("validates and normalizes profiles, market information and brand direction", () => {
    const input = parseVisualStrategyInput({
      ...validInput(),
      productProfile: {
        ...validInput().productProfile,
        category: "  Drinkware  ",
      },
      visualDna: {
        ...validInput().visualDna,
        dominant_colors: ["#aabbcc"],
      },
      marketInfo: {
        ...validInput().marketInfo,
        countryOrRegion: "  Germany  ",
      },
      brandDirection: {
        ...validInput().brandDirection,
        personality: ["  warm  ", "trusted"],
      },
    });

    expect(input.productProfile.category).toBe("Drinkware");
    expect(input.visualDna.dominant_colors).toEqual(["#AABBCC"]);
    expect(input.marketInfo?.countryOrRegion).toBe("Germany");
    expect(input.brandDirection?.personality).toEqual(["warm", "trusted"]);
  });

  it("accepts Product Profile and Visual DNA without optional context", () => {
    const source = validInput();
    const input = parseVisualStrategyInput({
      schemaVersion: "1.0",
      productProfile: source.productProfile,
      visualDna: source.visualDna,
    });

    expect(input.marketInfo).toBeUndefined();
    expect(input.brandDirection).toBeUndefined();
  });

  it.each([
    [
      "invalid Product Profile",
      {
        ...validInput(),
        productProfile: {
          ...validInput().productProfile,
          selling_points: [],
        },
      },
    ],
    [
      "invalid Visual DNA",
      {
        ...validInput(),
        visualDna: {
          ...validInput().visualDna,
          opportunities: [],
        },
      },
    ],
    [
      "unknown brand field",
      {
        ...validInput(),
        brandDirection: {
          ...validInput().brandDirection,
          modelHint: "never-accept",
        },
      },
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(() => parseVisualStrategyInput(candidate)).toThrow(
      VisualStrategyValidationError,
    );
  });

  it("parses untrusted JSON into a structured Visual Strategy", () => {
    const strategy = parseVisualStrategy(
      JSON.stringify({
        ...validStrategy(),
        strategy_name: "  Warm Urban Momentum  ",
        text_direction: {
          ...validStrategy().text_direction,
          tone: "  concise and reassuring  ",
        },
      }),
    );

    expect(strategy).toEqual({
      ...validStrategy(),
      strategy_name: "Warm Urban Momentum",
      text_direction: {
        ...validStrategy().text_direction,
        tone: "concise and reassuring",
      },
    });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    [
      "missing direction",
      { ...validStrategy(), scene_direction: undefined },
    ],
    [
      "non-sequential selling point priorities",
      {
        ...validStrategy(),
        selling_point_priority: [
          {
            priority: 2,
            selling_point: "Portable temperature retention",
            rationale: "Primary purchase motivation",
          },
        ],
      },
    ],
    ["unknown output field", { ...validStrategy(), raw_prompt: "hidden" }],
  ])("rejects Visual Strategy with %s", (_name, candidate) => {
    expect(() => parseVisualStrategy(candidate)).toThrow(
      VisualStrategyValidationError,
    );
  });
});

describe("VisualStrategyEngine", () => {
  it("passes normalized input to a model-neutral provider and returns a strategy", async () => {
    const createStrategy = vi.fn(async () => ({
      output: JSON.stringify(validStrategy()),
      providerRequestId: " strategy-request-1 ",
    }));
    const provider: VisualStrategyProvider = {
      name: "fake-strategy-provider",
      createStrategy,
    };

    await expect(
      new VisualStrategyEngine(provider).execute({
        ...validInput(),
        productProfile: {
          ...validInput().productProfile,
          category: "  Drinkware  ",
        },
      }),
    ).resolves.toEqual(validStrategy());

    expect(createStrategy).toHaveBeenCalledOnce();
    expect(createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        productProfile: expect.objectContaining({ category: "Drinkware" }),
      }),
    );
  });

  it("rejects invalid input before invoking the provider", async () => {
    const createStrategy = vi.fn(async () => validProviderResult());
    const provider: VisualStrategyProvider = {
      name: "fake-strategy-provider",
      createStrategy,
    };

    await expect(
      new VisualStrategyEngine(provider).execute({
        ...validInput(),
        visualDna: {
          ...validInput().visualDna,
          scene_patterns: [],
        },
      }),
    ).rejects.toBeInstanceOf(VisualStrategyValidationError);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("maps invalid provider output to a non-retryable adapter error", async () => {
    const provider = fakeProvider({
      output: { ...validStrategy(), generation_guidance: null },
      providerRequestId: "strategy-request-2",
    });

    await expect(
      new VisualStrategyEngine(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: "strategy-request-2",
    });
  });

  it.each([
    ["missing request ID", { output: validStrategy() }],
    [
      "empty request ID",
      { output: validStrategy(), providerRequestId: "   " },
    ],
  ])("rejects an invalid provider envelope with %s", async (_name, result) => {
    const provider = fakeProvider(result);

    await expect(
      new VisualStrategyEngine(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: null,
    });
  });

  it("preserves standard provider adapter errors", async () => {
    const providerError = new ProviderAdapterError(
      "PROVIDER_RATE_LIMITED",
      true,
      "Strategy provider rate limited",
      "strategy-request-3",
    );
    const provider: VisualStrategyProvider = {
      name: "fake-strategy-provider",
      createStrategy: async () => {
        throw providerError;
      },
    };

    await expect(
      new VisualStrategyEngine(provider).execute(validInput()),
    ).rejects.toBe(providerError);
  });
});

function validInput(): VisualStrategyInput {
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
    visualDna: {
      schemaVersion: "1.0",
      dominant_colors: ["#AABBCC"],
      composition_patterns: ["Centered product with negative space"],
      scene_patterns: ["Bright studio surface"],
      text_density: "low",
      visual_style: ["Minimal product-led commerce"],
      opportunities: ["Use a warmer lifestyle context"],
    },
    marketInfo: {
      countryOrRegion: "Germany",
      marketplace: "Amazon.de",
      targetAudience: "Urban commuters",
      priceSegment: "Mid-range",
      notes: ["Sustainability-oriented market"],
    },
    brandDirection: {
      brandName: "North Cup",
      personality: ["warm", "trusted"],
      tone: "Practical and modern",
      mustKeep: ["Blue brand accent"],
      avoid: ["Aggressive urgency"],
    },
  };
}

function validStrategy() {
  return {
    schemaVersion: "1.0" as const,
    strategy_name: "Warm Urban Momentum",
    target_user: "Urban commuters who value practical design",
    user_psychology: ["Seeks reliable everyday convenience"],
    positioning: "A warm, practical alternative to sterile competitor imagery",
    scene_direction: ["Morning commute in natural light"],
    composition_direction: ["Product-centered with space for one proof point"],
    visual_style_direction: ["Warm minimalism with restrained blue accents"],
    text_direction: {
      hierarchy: "One concise headline followed by one proof point",
      tone: "concise and reassuring",
      density: "low" as const,
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
  };
}

function validProviderResult(): VisualStrategyProviderResult {
  return {
    output: validStrategy(),
    providerRequestId: "strategy-request-1",
  };
}

function fakeProvider(result: unknown): VisualStrategyProvider {
  return {
    name: "fake-strategy-provider",
    createStrategy: async () => result as VisualStrategyProviderResult,
  };
}
