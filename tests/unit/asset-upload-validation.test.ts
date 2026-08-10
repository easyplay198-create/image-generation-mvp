import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_BYTES,
  parseUploadAssetKind,
  validateImageUpload,
} from "../../src/domain/asset-upload";

describe("asset upload validation", () => {
  it.each([
    ["png", "fixture.png", "image/png"],
    ["jpeg", "fixture.jpeg", "image/jpeg"],
    ["webp", "fixture.webp", "image/webp"],
  ] as const)(
    "accepts a decoded %s whose extension, MIME and signature agree",
    async (format, fileName, mimeType) => {
      const file = await createImageFile(format, fileName, mimeType);

      await expect(validateImageUpload(file)).resolves.toMatchObject({
        mimeType,
        width: 2,
        height: 3,
        byteSize: file.size,
      });
    },
  );

  it("rejects a disguised image", async () => {
    const png = await createImageFile("png", "disguised.jpg", "image/jpeg");

    await expect(validateImageUpload(png)).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("rejects a corrupt image even when its signature looks valid", async () => {
    const corruptPng = new File(
      [
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
        ]).buffer,
      ],
      "corrupt.png",
      { type: "image/png" },
    );

    await expect(validateImageUpload(corruptPng)).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("rejects files larger than 20 MiB before decoding", async () => {
    const oversized = new File(
      [new ArrayBuffer(MAX_UPLOAD_BYTES + 1)],
      "oversized.png",
      { type: "image/png" },
    );

    await expect(validateImageUpload(oversized)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("accepts only uploadable asset kinds", () => {
    expect(parseUploadAssetKind("PRODUCT")).toBe("PRODUCT");
    expect(parseUploadAssetKind("REFERENCE")).toBe("REFERENCE");
    expect(() => parseUploadAssetKind("EXPORT")).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });
});

async function createImageFile(
  format: "png" | "jpeg" | "webp",
  fileName: string,
  mimeType: string,
) {
  const pipeline = sharp({
    create: {
      width: 2,
      height: 3,
      channels: 4,
      background: { r: 40, g: 80, b: 120, alpha: 1 },
    },
  });
  const bytes = await pipeline[format]().toBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new File([body], fileName, { type: mimeType });
}
