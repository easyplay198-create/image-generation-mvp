import { describe, expect, it } from "vitest";

import { parseStyleSpecV1 } from "../../src/domain/style-spec";
import {
  MockStyleAnalyzerProvider,
  type MockStyleAnalysisScenario,
} from "../../src/providers/mock-style-analyzer-provider";

const input = {
  projectId: "project-1",
  productInfo: {
    productName: "Coffee cup",
    category: "Drinkware",
    sellingPoints: ["Lightweight"],
    targetAudience: null,
    forbiddenClaims: ["Guaranteed cure"],
  },
  referenceImages: [
    {
      assetId: "reference-1",
      mimeType: "image/png",
      width: 10,
      height: 10,
      body: new Uint8Array([1, 2, 3]),
    },
  ],
};

describe("Mock StyleAnalyzerProvider", () => {
  it("returns deterministic valid StyleSpec output", async () => {
    const provider = new MockStyleAnalyzerProvider("success");
    const first = await provider.analyze(input);
    const second = await provider.analyze(input);

    expect(first).toEqual(second);
    expect(parseStyleSpecV1(first.output)).toMatchObject({
      schemaVersion: "1.0",
      moodKeywords: ["清晰", "克制", "可信赖"],
    });
  });

  it.each<[
    MockStyleAnalysisScenario,
    string,
    boolean,
  ]>([
    ["auth-failure", "PROVIDER_AUTH_FAILED", false],
    ["rate-limited", "PROVIDER_RATE_LIMITED", true],
    ["policy-rejected", "PROVIDER_POLICY_REJECTED", false],
    ["timeout", "PROVIDER_TIMEOUT", true],
  ])("maps %s to %s", async (scenario, code, retryable) => {
    await expect(
      new MockStyleAnalyzerProvider(scenario).analyze(input),
    ).rejects.toMatchObject({ code, retryable });
  });

  it("returns an invalid response scenario that the trust boundary rejects", async () => {
    const result = await new MockStyleAnalyzerProvider(
      "invalid-response",
    ).analyze(input);

    expect(() => parseStyleSpecV1(result.output)).toThrow(
      "StyleSpec 不符合 V1 Schema。",
    );
  });
});
