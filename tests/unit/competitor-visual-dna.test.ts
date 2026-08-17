import { describe, expect, it, vi } from "vitest";

import {
  CompetitorVisualDnaValidationError,
  parseCompetitorVisualDnaInput,
  parseVisualDna,
  type CompetitorVisualDnaInput,
} from "../../src/domain/competitor-visual-dna";
import type {
  CompetitorVisualDnaProvider,
  CompetitorVisualDnaProviderResult,
} from "../../src/providers/competitor-visual-dna-provider";
import { ProviderAdapterError } from "../../src/providers/provider-error";
import { CompetitorVisualDnaSkill } from "../../src/services/competitor-visual-dna";

describe("Competitor Visual DNA V1 contracts", () => {
  it("validates and normalizes competitor images, category and market information", () => {
    const firstBody = new Uint8Array([1, 2, 3]);
    const input = parseCompetitorVisualDnaInput({
      ...validInput(),
      competitorImages: [
        {
          ...validInput().competitorImages[0],
          assetId: "  competitor-asset-1  ",
          body: firstBody,
        },
        validInput().competitorImages[1],
      ],
      productCategory: "  Drinkware  ",
      marketInfo: {
        ...validInput().marketInfo,
        countryOrRegion: "  Germany  ",
        notes: ["  Sustainability-oriented market  "],
      },
    });

    expect(input.competitorImages).toHaveLength(2);
    expect(input.competitorImages[0]).toMatchObject({
      assetId: "competitor-asset-1",
      mimeType: "image/jpeg",
      width: 1200,
      height: 1200,
    });
    expect(input.competitorImages[0].body).toBe(firstBody);
    expect(input).toMatchObject({
      productCategory: "Drinkware",
      marketInfo: {
        countryOrRegion: "Germany",
        notes: ["Sustainability-oriented market"],
      },
    });
  });

  it.each([
    ["empty image collection", { ...validInput(), competitorImages: [] }],
    [
      "duplicate image asset IDs",
      {
        ...validInput(),
        competitorImages: [
          validInput().competitorImages[0],
          {
            ...validInput().competitorImages[1],
            assetId: validInput().competitorImages[0].assetId,
          },
        ],
      },
    ],
    [
      "unsupported image type",
      {
        ...validInput(),
        competitorImages: [
          {
            ...validInput().competitorImages[0],
            mimeType: "image/svg+xml",
          },
        ],
      },
    ],
    [
      "unknown market field",
      {
        ...validInput(),
        marketInfo: {
          ...validInput().marketInfo,
          providerHint: "never-accept",
        },
      },
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(() => parseCompetitorVisualDnaInput(candidate)).toThrow(
      CompetitorVisualDnaValidationError,
    );
  });

  it("parses untrusted JSON into the exact Visual DNA contract", () => {
    const visualDna = parseVisualDna(
      JSON.stringify({
        ...validVisualDna(),
        dominant_colors: ["#aabbcc", "#112233"],
        visual_style: ["  Minimal product-led commerce  "],
      }),
    );

    expect(visualDna).toEqual({
      schemaVersion: "1.0",
      dominant_colors: ["#AABBCC", "#112233"],
      composition_patterns: ["Centered product with generous negative space"],
      scene_patterns: ["Bright studio surface"],
      text_density: "low",
      visual_style: ["Minimal product-led commerce"],
      opportunities: ["Use a warmer lifestyle context"],
    });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["invalid color", { ...validVisualDna(), dominant_colors: ["blue"] }],
    [
      "invalid text density",
      { ...validVisualDna(), text_density: "very-high" },
    ],
    ["unknown output field", { ...validVisualDna(), embeddings: [0.1] }],
  ])("rejects Visual DNA with %s", (_name, candidate) => {
    expect(() => parseVisualDna(candidate)).toThrow(
      CompetitorVisualDnaValidationError,
    );
  });
});

describe("CompetitorVisualDnaSkill", () => {
  it("passes normalized input to a model-neutral provider and returns Visual DNA", async () => {
    const analyzeVisualDna = vi.fn(async () => ({
      output: JSON.stringify(validVisualDna()),
      providerRequestId: " visual-dna-request-1 ",
    }));
    const provider: CompetitorVisualDnaProvider = {
      name: "fake-embedding-analysis",
      analyzeVisualDna,
    };

    await expect(
      new CompetitorVisualDnaSkill(provider).execute({
        ...validInput(),
        productCategory: "  Drinkware  ",
      }),
    ).resolves.toEqual(validVisualDna());

    expect(analyzeVisualDna).toHaveBeenCalledOnce();
    expect(analyzeVisualDna).toHaveBeenCalledWith(
      expect.objectContaining({ productCategory: "Drinkware" }),
    );
  });

  it("rejects invalid input before invoking the provider", async () => {
    const analyzeVisualDna = vi.fn(async () => validProviderResult());
    const provider: CompetitorVisualDnaProvider = {
      name: "fake-embedding-analysis",
      analyzeVisualDna,
    };

    await expect(
      new CompetitorVisualDnaSkill(provider).execute({
        ...validInput(),
        competitorImages: [],
      }),
    ).rejects.toBeInstanceOf(CompetitorVisualDnaValidationError);
    expect(analyzeVisualDna).not.toHaveBeenCalled();
  });

  it("maps invalid provider output to a non-retryable adapter error", async () => {
    const provider = fakeProvider({
      output: { ...validVisualDna(), opportunities: [] },
      providerRequestId: "visual-dna-request-2",
    });

    await expect(
      new CompetitorVisualDnaSkill(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: "visual-dna-request-2",
    });
  });

  it.each([
    ["missing request ID", { output: validVisualDna() }],
    [
      "empty request ID",
      { output: validVisualDna(), providerRequestId: "   " },
    ],
  ])("rejects an invalid provider envelope with %s", async (_name, result) => {
    const provider = fakeProvider(result);

    await expect(
      new CompetitorVisualDnaSkill(provider).execute(validInput()),
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
      "Embedding provider timed out",
      "visual-dna-request-3",
    );
    const provider: CompetitorVisualDnaProvider = {
      name: "fake-embedding-analysis",
      analyzeVisualDna: async () => {
        throw providerError;
      },
    };

    await expect(
      new CompetitorVisualDnaSkill(provider).execute(validInput()),
    ).rejects.toBe(providerError);
  });
});

function validInput(): CompetitorVisualDnaInput {
  return {
    schemaVersion: "1.0",
    competitorImages: [
      {
        assetId: "competitor-asset-1",
        mimeType: "image/jpeg",
        width: 1200,
        height: 1200,
        body: new Uint8Array([1, 2, 3]),
      },
      {
        assetId: "competitor-asset-2",
        mimeType: "image/webp",
        width: 1200,
        height: 900,
        body: new Uint8Array([4, 5, 6]),
      },
    ],
    productCategory: "Drinkware",
    marketInfo: {
      countryOrRegion: "Germany",
      marketplace: "Amazon.de",
      targetAudience: "Urban commuters",
      priceSegment: "Mid-range",
      notes: ["Sustainability-oriented market"],
    },
  };
}

function validVisualDna() {
  return {
    schemaVersion: "1.0" as const,
    dominant_colors: ["#AABBCC", "#112233"],
    composition_patterns: ["Centered product with generous negative space"],
    scene_patterns: ["Bright studio surface"],
    text_density: "low" as const,
    visual_style: ["Minimal product-led commerce"],
    opportunities: ["Use a warmer lifestyle context"],
  };
}

function validProviderResult(): CompetitorVisualDnaProviderResult {
  return {
    output: validVisualDna(),
    providerRequestId: "visual-dna-request-1",
  };
}

function fakeProvider(result: unknown): CompetitorVisualDnaProvider {
  return {
    name: "fake-embedding-analysis",
    analyzeVisualDna: async () =>
      result as CompetitorVisualDnaProviderResult,
  };
}
