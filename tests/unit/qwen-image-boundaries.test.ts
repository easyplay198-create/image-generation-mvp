import { randomFillSync } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  normalizeQwenInputImage,
  QWEN_MAX_DOWNLOAD_BYTES,
  QWEN_MAX_NORMALIZED_INPUT_BYTES,
  readLimitedImageResponseBody,
} from "@/src/providers/qwen-image-boundaries";

describe("Qwen image byte boundaries", () => {
  it("checks the streaming response limit before buffering the body", async () => {
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
      {
        headers: {
          "content-length": String(QWEN_MAX_DOWNLOAD_BYTES + 1),
        },
      },
    );

    await expect(
      readLimitedImageResponseBody(response, "request-1", "fixture image"),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it(
    "rechecks the official 10 MiB boundary after normalization",
    async () => {
      const width = 2_400;
      const height = 2_400;
      const pixels = Buffer.allocUnsafe(width * height * 3);
      randomFillSync(pixels);
      const source = await sharp(pixels, {
        raw: { width, height, channels: 3 },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
      expect(source.byteLength).toBeGreaterThan(QWEN_MAX_NORMALIZED_INPUT_BYTES);
      expect(source.byteLength).toBeLessThanOrEqual(QWEN_MAX_DOWNLOAD_BYTES);

      const dataUrl = await normalizeQwenInputImage(
        {
          assetId: "boundary-product",
          body: source,
          mimeType: "image/png",
          width,
          height,
        },
        "Boundary fixture",
      );
      const encoded = dataUrl.split(",", 2)[1]!;
      expect(Buffer.from(encoded, "base64").byteLength).toBeLessThanOrEqual(
        QWEN_MAX_NORMALIZED_INPUT_BYTES,
      );
    },
    15_000,
  );
});
