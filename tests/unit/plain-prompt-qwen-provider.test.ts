import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { PlainPromptQwenProvider } from "@/src/benchmarks/plain-prompt-qwen-provider";

describe("PlainPromptQwenProvider", () => {
  it("sends only the product image and ordinary prompt, then normalizes to 800 x 800", async () => {
    const product = await sharp({
      create: { width: 500, height: 700, channels: 3, background: "#ee7700" },
    }).png().toBuffer();
    const generated = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: "#eeeeee" },
    }).png().toBuffer();
    let requestBody: unknown;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("dashscope.aliyuncs.com/api/v1/services")) {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          request_id: "plain-request-1",
          output: {
            choices: [{ message: { content: [{ image: "https://result.aliyuncs.com/plain.png" }] } }],
          },
          usage: { image_count: 1 },
        });
      }
      return new Response(generated, {
        headers: { "Content-Type": "image/png" },
      });
    });
    const provider = new PlainPromptQwenProvider({
      apiKey: "test-key",
      endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      modelName: "qwen-image-2.0",
      timeoutMs: 10_000,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await provider.generate({
      prompt: "普通电商主图 Prompt，不使用任何 StyleSpec 或 Reference Image。",
      productReference: { body: product, mimeType: "image/png" },
      canvas: { width: 800, height: 800 },
    });

    const request = requestBody as {
      model: string;
      input: { messages: Array<{ content: Array<{ image?: string; text?: string }> }> };
      parameters: { size: string };
    };
    const content = request.input.messages[0]!.content;
    expect(request.model).toBe("qwen-image-2.0");
    expect(request.parameters.size).toBe("800*800");
    expect(content).toHaveLength(2);
    expect(content.filter((item) => item.image)).toHaveLength(1);
    expect(content[1]?.text).toBe("普通电商主图 Prompt，不使用任何 StyleSpec 或 Reference Image。");
    expect(await sharp(result.image.body).metadata()).toMatchObject({
      width: 800,
      height: 800,
      format: "png",
    });
  });
});
