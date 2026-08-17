import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  validateGeneratedBackground,
  validateNormalizedGenerationUsage,
} from "../../src/domain/generated-background";
import {
  MockImageGenerationProvider,
  type MockImageGenerationScenario,
} from "../../src/providers/mock-image-generation-provider";

const input = {
  projectId: "project-1",
  styleSpec: validStyleSpec(),
  productContext: {
    productName: "Coffee cup",
    category: "Drinkware",
    sellingPoints: ["Lightweight"],
    targetAudience: null,
    forbiddenClaims: [],
  },
  canvas: { width: 1080, height: 1080 },
  idempotencyKey: "generation-unit-0001",
};

describe("Mock ImageGenerationProvider", () => {
  it("submits, polls and normalizes a deterministic background", async () => {
    const provider = new MockImageGenerationProvider("success");
    const first = await provider.generateBackground(input);
    const duplicate = await provider.generateBackground(input);
    const status = await provider.getJobStatus(first);

    expect(duplicate).toEqual(first);
    expect(status.status).toBe("SUCCEEDED");
    if (status.status !== "SUCCEEDED") throw new Error("Expected success");

    const metadata = await sharp(status.image.body).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 1080, height: 1080 });
    const usage = validateNormalizedGenerationUsage(
      provider.normalizeUsage(status.rawUsage),
      first.providerRequestId,
    );
    expect(usage).toEqual({
      generatedImages: 1,
      inputUnits: 203,
      outputPixels: 1080 * 1080,
      costMetadata: {
        status: "UNKNOWN",
        amount: null,
        currency: null,
        estimated: false,
        reason: "PRICING_NOT_VERIFIED",
      },
    });
    await expect(
      validateGeneratedBackground(
        status.image,
        input.canvas,
        first.providerRequestId,
      ),
    ).resolves.toMatchObject({ mimeType: "image/png", width: 1080, height: 1080 });
  });

  it.each<[
    MockImageGenerationScenario,
    string,
    boolean,
  ]>([
    ["timeout", "PROVIDER_TIMEOUT", true],
    ["rate-limited", "PROVIDER_RATE_LIMITED", true],
    ["policy-rejected", "PROVIDER_POLICY_REJECTED", false],
  ])("maps %s to %s", async (scenario, code, retryable) => {
    await expect(
      new MockImageGenerationProvider(scenario).generateBackground(input),
    ).rejects.toMatchObject({ code, retryable });
  });

  it("rejects invalid provider status and usage", async () => {
    const provider = new MockImageGenerationProvider("invalid-response");
    const submission = await provider.generateBackground(input);

    await expect(provider.getJobStatus(submission)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
    expect(() => provider.normalizeUsage({ cost: "unknown" })).toThrow(
      "图片生成 Provider 返回了无效用量数据。",
    );
  });

  it("rejects corrupt, mismatched and wrong-size generated images", async () => {
    const providerRequestId = "provider-request-invalid";
    await expect(
      validateGeneratedBackground(
        { body: new Uint8Array([1, 2, 3]), mimeType: "image/png" },
        input.canvas,
        providerRequestId,
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });

    const png = Uint8Array.from(
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: "#FFFFFF",
        },
      })
        .png()
        .toBuffer(),
    );
    await expect(
      validateGeneratedBackground(
        { body: png, mimeType: "image/jpeg" },
        { width: 8, height: 8 },
        providerRequestId,
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    await expect(
      validateGeneratedBackground(
        { body: png, mimeType: "image/png" },
        input.canvas,
        providerRequestId,
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });
});

function validStyleSpec() {
  return {
    schemaVersion: "1.0" as const,
    summary: "Clean studio commerce style",
    moodKeywords: ["clean", "trusted", "calm"],
    palette: [{ hex: "#AABBCC", role: "Background" }],
    background: {
      scene: "Studio sweep",
      texture: "Matte",
      lighting: "Soft key light",
    },
    composition: {
      productPlacement: "Centered",
      cameraAngle: "Eye level",
      negativeSpace: "Above product",
    },
    typography: {
      tone: "Modern",
      recommendedStyles: ["Sans serif"],
    },
    decorations: [],
    negativeConstraints: ["Do not alter the product"],
  };
}
