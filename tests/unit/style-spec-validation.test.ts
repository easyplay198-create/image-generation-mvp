import { describe, expect, it } from "vitest";

import {
  parseStyleSpecV1,
  StyleSpecValidationError,
} from "../../src/domain/style-spec";

describe("StyleSpec V1 schema", () => {
  it("parses an untrusted JSON string and normalizes palette colors", () => {
    const spec = parseStyleSpecV1(JSON.stringify(validStyleSpec()));

    expect(spec).toMatchObject({
      schemaVersion: "1.0",
      summary: "Clean studio commerce style",
      palette: [{ hex: "#AABBCC", role: "Background" }],
    });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["wrong schema version", { ...validStyleSpec(), schemaVersion: "2.0" }],
    ["empty moods", { ...validStyleSpec(), moodKeywords: [] }],
    [
      "invalid palette color",
      { ...validStyleSpec(), palette: [{ hex: "rgb(0,0,0)", role: "Text" }] },
    ],
    ["unknown field", { ...validStyleSpec(), providerSecret: "never-store" }],
  ])("rejects %s", (_name, candidate) => {
    expect(() => parseStyleSpecV1(candidate)).toThrow(
      StyleSpecValidationError,
    );
  });
});

function validStyleSpec() {
  return {
    schemaVersion: "1.0",
    summary: "Clean studio commerce style",
    moodKeywords: ["clean", "trusted"],
    palette: [{ hex: "#aabbcc", role: "Background" }],
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
