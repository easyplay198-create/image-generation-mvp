import { describe, expect, it, vi } from "vitest";

import {
  parseProductProfile,
  parseProductUnderstandingInput,
  ProductUnderstandingValidationError,
  type ProductUnderstandingInput,
} from "../../src/domain/product-understanding";
import { ProviderAdapterError } from "../../src/providers/provider-error";
import type {
  VisionModelProductUnderstandingResult,
  VisionModelProvider,
} from "../../src/providers/vision-model-provider";
import { ProductUnderstandingSkill } from "../../src/services/product-understanding";

describe("Product Understanding V1 contracts", () => {
  it("validates and normalizes product image and basic information", () => {
    const body = new Uint8Array([1, 2, 3]);
    const input = parseProductUnderstandingInput({
      ...validInput(),
      productImage: {
        ...validInput().productImage,
        assetId: "  product-asset-1  ",
        body,
      },
      productInfo: {
        ...validInput().productInfo,
        productName: "  Insulated travel mug  ",
        sellingPoints: ["  Keeps drinks warm  "],
      },
    });

    expect(input.productImage).toMatchObject({
      assetId: "product-asset-1",
      mimeType: "image/png",
      width: 1200,
      height: 1200,
    });
    expect(input.productImage.body).toBe(body);
    expect(input.productInfo).toMatchObject({
      productName: "Insulated travel mug",
      sellingPoints: ["Keeps drinks warm"],
    });
  });

  it.each([
    [
      "unsupported image type",
      {
        ...validInput(),
        productImage: {
          ...validInput().productImage,
          mimeType: "image/svg+xml",
        },
      },
    ],
    [
      "empty image body",
      {
        ...validInput(),
        productImage: {
          ...validInput().productImage,
          body: new Uint8Array(),
        },
      },
    ],
    [
      "unknown input field",
      { ...validInput(), providerSecret: "never-accept" },
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(() => parseProductUnderstandingInput(candidate)).toThrow(
      ProductUnderstandingValidationError,
    );
  });

  it("parses untrusted JSON into the exact Product Profile contract", () => {
    const profile = parseProductProfile(
      JSON.stringify({
        ...validProfile(),
        category: "  Drinkware  ",
        product_features: ["  Double-wall construction  "],
      }),
    );

    expect(profile).toEqual({
      schemaVersion: "1.0",
      category: "Drinkware",
      product_features: ["Double-wall construction"],
      user_scenarios: ["Commuting"],
      selling_points: ["Portable temperature retention"],
      limitations: ["Not suitable for microwave use"],
      claims: ["Capacity is 500 ml"],
    });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    [
      "missing required field",
      { ...validProfile(), product_features: undefined },
    ],
    ["unknown output field", { ...validProfile(), confidence: 0.9 }],
  ])("rejects a Product Profile with %s", (_name, candidate) => {
    expect(() => parseProductProfile(candidate)).toThrow(
      ProductUnderstandingValidationError,
    );
  });
});

describe("ProductUnderstandingSkill", () => {
  it("passes normalized input to a model-neutral provider and returns a profile", async () => {
    const understandProduct = vi.fn(async () => ({
      output: JSON.stringify(validProfile()),
      providerRequestId: " vision-request-1 ",
    }));
    const provider: VisionModelProvider = {
      name: "fake-vision",
      understandProduct,
    };

    await expect(
      new ProductUnderstandingSkill(provider).execute({
        ...validInput(),
        productInfo: {
          ...validInput().productInfo,
          productName: "  Insulated travel mug  ",
        },
      }),
    ).resolves.toEqual(validProfile());

    expect(understandProduct).toHaveBeenCalledOnce();
    expect(understandProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productInfo: expect.objectContaining({
          productName: "Insulated travel mug",
        }),
      }),
    );
  });

  it("rejects invalid input before invoking the provider", async () => {
    const understandProduct = vi.fn(async () => validProviderResult());
    const provider: VisionModelProvider = {
      name: "fake-vision",
      understandProduct,
    };

    await expect(
      new ProductUnderstandingSkill(provider).execute({
        ...validInput(),
        productImage: {
          ...validInput().productImage,
          body: new Uint8Array(),
        },
      }),
    ).rejects.toBeInstanceOf(ProductUnderstandingValidationError);
    expect(understandProduct).not.toHaveBeenCalled();
  });

  it("maps an invalid provider profile to a non-retryable adapter error", async () => {
    const provider = fakeProvider({
      output: { ...validProfile(), selling_points: [] },
      providerRequestId: "vision-request-2",
    });

    await expect(
      new ProductUnderstandingSkill(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: "vision-request-2",
    });
  });

  it.each([
    ["missing request ID", { output: validProfile() }],
    [
      "empty request ID",
      { output: validProfile(), providerRequestId: "   " },
    ],
  ])("rejects an invalid provider envelope with %s", async (_name, result) => {
    const provider = fakeProvider(result);

    await expect(
      new ProductUnderstandingSkill(provider).execute(validInput()),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      providerRequestId: null,
    });
  });

  it("preserves provider adapter errors", async () => {
    const providerError = new ProviderAdapterError(
      "PROVIDER_RATE_LIMITED",
      true,
      "Rate limited",
      "vision-request-3",
    );
    const provider: VisionModelProvider = {
      name: "fake-vision",
      understandProduct: async () => {
        throw providerError;
      },
    };

    await expect(
      new ProductUnderstandingSkill(provider).execute(validInput()),
    ).rejects.toBe(providerError);
  });
});

function validInput(): ProductUnderstandingInput {
  return {
    schemaVersion: "1.0",
    productImage: {
      assetId: "product-asset-1",
      mimeType: "image/png",
      width: 1200,
      height: 1200,
      body: new Uint8Array([1, 2, 3]),
    },
    productInfo: {
      productName: "Insulated travel mug",
      category: "Drinkware",
      sellingPoints: ["Keeps drinks warm"],
      targetAudience: "Commuters",
      forbiddenClaims: ["Keeps drinks hot forever"],
    },
  };
}

function validProfile() {
  return {
    schemaVersion: "1.0" as const,
    category: "Drinkware",
    product_features: ["Double-wall construction"],
    user_scenarios: ["Commuting"],
    selling_points: ["Portable temperature retention"],
    limitations: ["Not suitable for microwave use"],
    claims: ["Capacity is 500 ml"],
  };
}

function validProviderResult(): VisionModelProductUnderstandingResult {
  return {
    output: validProfile(),
    providerRequestId: "vision-request-1",
  };
}

function fakeProvider(result: unknown): VisionModelProvider {
  return {
    name: "fake-vision",
    understandProduct: async () =>
      result as VisionModelProductUnderstandingResult,
  };
}
