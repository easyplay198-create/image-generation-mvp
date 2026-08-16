import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateGeneratedBackground } from "../../src/domain/generated-background";
import { createImageGenerationProvider } from "../../src/providers/image-generation-factory";
import { QwenImageGenerationProvider } from "../../src/providers/qwen-image-generation-provider";

const endpoint =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const imageUrl =
  "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/result.png";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const COMPLETED_RESULT_TTL_MS = 10 * 60 * 1_000;

const input = {
  projectId: "project-qwen",
  styleSpec: {
    schemaVersion: "1.0" as const,
    summary: "Clean premium studio background",
    moodKeywords: ["clean", "premium"],
    palette: [{ hex: "#F4F4F4", role: "Background" }],
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
    negativeConstraints: ["Avoid visual clutter"],
  },
  productContext: {
    productName: "Transparent spray bottle",
    category: "Beauty",
    sellingPoints: ["Fine mist"],
    targetAudience: "Premium shoppers",
    forbiddenClaims: [],
  },
  canvas: { width: 1080, height: 1080 },
  idempotencyKey: "qwen-generation-0001",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("Qwen ImageGenerationProvider", () => {
  it("maps a synchronous Qwen response into the existing provider contract", async () => {
    const png = await createValidPng();
    const responses = [
      qwenSuccessResponse("qwen-request-1"),
      imageResponse(png),
    ];
    const fetchMock = vi.fn(
      async (
        fetchInput: string | URL | Request,
        fetchInit?: RequestInit,
      ): Promise<Response> => {
        void fetchInput;
        void fetchInit;
        const response = responses.shift();
        if (!response) throw new Error("Unexpected fetch call");
        return response;
      },
    );
    const provider = createProvider(fetchMock as typeof fetch);

    const submission = await provider.generateBackground(input);
    const status = await provider.getJobStatus(submission);

    expect(submission).toEqual({ providerRequestId: "qwen-request-1" });
    expect(status.status).toBe("SUCCEEDED");
    if (status.status !== "SUCCEEDED") throw new Error("Expected success");
    expect(status.image.mimeType).toBe("image/png");
    expect(status.image.body).toEqual(png);
    await expect(
      validateGeneratedBackground(
        status.image,
        input.canvas,
        submission.providerRequestId,
      ),
    ).resolves.toMatchObject({
      mimeType: "image/png",
      width: 1080,
      height: 1080,
    });
    expect(provider.normalizeUsage(status.rawUsage)).toEqual({
      generatedImages: 1,
      inputUnits: null,
      outputPixels: 1080 * 1080,
      costMetadata: {
        amount: "0.0000",
        currency: "CNY",
        estimated: true,
      },
    });

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "qwen-image-2.0",
      parameters: {
        size: "1080*1080",
        n: 1,
        watermark: false,
        prompt_extend: false,
      },
    });
    expect(JSON.stringify(request)).toContain("只生成背景");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer test-qwen-key",
      "Content-Type": "application/json",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(imageUrl);
    expect(fetchMock.mock.calls[1]?.[1]?.redirect).toBe("manual");
    await expect(provider.getJobStatus(submission)).resolves.toEqual(status);
  });

  it("sends a normalized product reference to Qwen Image Edit", async () => {
    const productReference = Uint8Array.from(
      await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: "#C8D4E0",
        },
      })
        .png()
        .toBuffer(),
    );
    const output = Uint8Array.from(
      await sharp({
        create: {
          width: 1088,
          height: 1088,
          channels: 4,
          background: "#F4F4F4",
        },
      })
        .png()
        .toBuffer(),
    );
    const fetchMock = sequenceFetch([
      qwenSuccessResponse("qwen-reference-1", imageUrl, 1088, 1088),
      imageResponse(output),
    ]);
    const provider = createProvider(fetchMock as typeof fetch);

    const submission = await provider.generateBackground({
      ...input,
      productContext: {
        ...input.productContext,
        forbiddenClaims: ["medical cure"],
      },
      productReference: {
        assetId: "product-asset-1",
        body: productReference,
        mimeType: "image/png",
        width: 512,
        height: 512,
      },
      visualReferences: [
        {
          assetId: "visual-reference-1",
          body: productReference,
          mimeType: "image/png",
          width: 512,
          height: 512,
        },
      ],
    });
    const status = await provider.getJobStatus(submission);
    expect(status.status).toBe("SUCCEEDED");
    if (status.status !== "SUCCEEDED") throw new Error("Expected success");
    await expect(
      validateGeneratedBackground(
        status.image,
        input.canvas,
        submission.providerRequestId,
      ),
    ).resolves.toMatchObject({ width: 1080, height: 1080 });

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as {
      input: { messages: Array<{ content: Array<Record<string, string>> }> };
      parameters: { n: number; negative_prompt: string };
    };
    const content = request.input.messages[0]?.content ?? [];
    expect(content).toHaveLength(3);
    expect(content[0]?.image).toMatch(/^data:image\/png;base64,/);
    expect(content[1]?.image).toMatch(/^data:image\/png;base64,/);
    expect(content[2]?.text).toContain("唯一可信的商品主体");
    expect(content[2]?.text).toContain("不得复制其中的商品、文字、品牌");
    expect(content[2]?.text).toContain("保持同一设备");
    expect(content[2]?.text).toContain("虚构附件");
    expect(content[2]?.text).toContain("不得出现任何文字、字母、数字");
    expect(content[2]?.text).toContain("medical cure");
    expect(request.parameters.n).toBe(1);
    expect(request.parameters.negative_prompt).toContain("medical cure");
    expect(JSON.stringify(request)).not.toContain("product-asset-1");
    expect(JSON.stringify(request)).not.toContain("只生成背景");
  });

  it("rejects invalid product reference metadata before calling Qwen", async () => {
    const fetchMock = vi.fn();
    const productReference = await createValidPng();

    await expect(
      createProvider(fetchMock as typeof fetch).generateBackground({
        ...input,
        productReference: {
          assetId: "product-asset-invalid",
          body: productReference,
          mimeType: "image/png",
          width: 512,
          height: 512,
        },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, { code: "InvalidApiKey" }, "PROVIDER_AUTH_FAILED", false],
    [429, { code: "Throttling" }, "PROVIDER_RATE_LIMITED", true],
    [400, { code: "DataInspectionFailed" }, "PROVIDER_POLICY_REJECTED", false],
    [503, { code: "ServiceUnavailable" }, "PROVIDER_TIMEOUT", true],
  ] as const)(
    "maps HTTP %s to %s",
    async (status, body, code, retryable) => {
      const fetchMock = vi.fn(async () => jsonResponse(body, status));
      await expect(
        createProvider(fetchMock as typeof fetch).generateBackground(input),
      ).rejects.toMatchObject({ code, retryable });
    },
  );

  it("maps an aborted request to a retryable timeout", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    });

    await expect(
      createProvider(fetchMock as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
  });

  it("rejects malformed responses and non-Aliyun image URLs", async () => {
    const malformedFetch = vi.fn(async () => jsonResponse({ output: {} }));
    await expect(
      createProvider(malformedFetch as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });

    const unsafeUrlFetch = vi.fn(async () =>
      jsonResponse({
        request_id: "qwen-request-unsafe",
        output: {
          choices: [
            {
              message: {
                content: [{ image: "https://example.com/result.png" }],
              },
            },
          ],
        },
      }),
    );
    await expect(
      createProvider(unsafeUrlFetch as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it.each([
    "http://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/result.png",
    "https://example.com/result.png",
    "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com:444/result.png",
    "https://user:password@dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/result.png",
  ])("rejects unsafe image source %s", async (unsafeImageUrl) => {
    const fetchMock = sequenceFetch([
      qwenSuccessResponse("qwen-unsafe-image-source", unsafeImageUrl),
    ]);

    await expect(
      createProvider(fetchMock as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts only approved public, Beijing, and Singapore endpoints", () => {
    const fetchMock = vi.fn();
    expect(createProvider(fetchMock as typeof fetch).name).toBe("qwen");
    expect(
      createProvider(
        fetchMock as typeof fetch,
        "https://workspace-123.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      ).name,
    ).toBe("qwen");
    expect(
      createProvider(
        fetchMock as typeof fetch,
        "https://workspace-123.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      ).name,
    ).toBe("qwen");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://example.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://evilaliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://oss-cn-shanghai.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://dashscope.aliyuncs.com:444/api/v1/services/aigc/multimodal-generation/generation",
    "https://user:password@dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/other",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation?target=other",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation#fragment",
    "https://nested.workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  ])("rejects unsafe endpoint %s before fetch", (unsafeEndpoint) => {
    const fetchMock = vi.fn();
    let thrown: unknown;

    try {
      createProvider(fetchMock as typeof fetch, unsafeEndpoint);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain("test-qwen-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an authenticated API redirect without following it", async () => {
    const fetchMock = sequenceFetch([
      redirectResponse(307, "https://example.com/capture-key"),
    ]);

    await expect(
      createProvider(fetchMock as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([301, 302, 303, 307, 308])(
    "rejects image HTTP %s without following it",
    async (status) => {
      const fetchMock = sequenceFetch([
        qwenSuccessResponse(`qwen-image-redirect-${status}`),
        redirectResponse(status, "http://169.254.169.254/latest/meta-data"),
      ]);

      await expect(
        createProvider(fetchMock as typeof fetch).generateBackground(input),
      ).rejects.toMatchObject({
        code: "PROVIDER_INVALID_RESPONSE",
        retryable: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[1]?.redirect).toBe("manual");
    },
  );

  it("rejects a declared oversized image before reading a body", async () => {
    const fetchMock = sequenceFetch([
      qwenSuccessResponse("qwen-declared-oversized"),
      new Response(null, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(MAX_IMAGE_BYTES + 1),
        },
      }),
    ]);

    await expect(
      createProvider(fetchMock as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
      message: "Qwen Provider 图片过大。",
    });
  });

  it.each([
    ["missing Content-Length", undefined],
    ["forged small Content-Length", "1"],
  ] as const)(
    "cancels an oversized stream with %s",
    async (_scenario, declaredLength) => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES));
          controller.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelled = true;
        },
      });
      const headers: Record<string, string> = {
        "Content-Type": "image/png",
      };
      if (declaredLength !== undefined) {
        headers["Content-Length"] = declaredLength;
      }
      const fetchMock = sequenceFetch([
        qwenSuccessResponse(`qwen-stream-${declaredLength ?? "missing"}`),
        new Response(stream, { headers }),
      ]);

      await expect(
        createProvider(fetchMock as typeof fetch).generateBackground(input),
      ).rejects.toMatchObject({
        code: "PROVIDER_INVALID_RESPONSE",
        retryable: false,
        message: "Qwen Provider 图片过大。",
      });
      expect(cancelled).toBe(true);
    },
  );

  it.each([
    [
      "null body",
      () => new Response(null, { headers: { "Content-Type": "image/png" } }),
    ],
    [
      "empty body",
      () => new Response("", { headers: { "Content-Type": "image/png" } }),
    ],
    [
      "wrong MIME",
      () => new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }),
    ],
  ] as const)("rejects an image with %s", async (_scenario, imageFactory) => {
    const fetchMock = sequenceFetch([
      qwenSuccessResponse(`qwen-invalid-image-${_scenario}`),
      imageFactory(),
    ]);

    await expect(
      createProvider(fetchMock as typeof fetch).generateBackground(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("expires a completed result after ten minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T00:00:00.000Z"));
    const fetchMock = sequenceFetch([
      qwenSuccessResponse("qwen-cache-expiry"),
      imageResponse("png"),
    ]);
    const provider = createProvider(fetchMock as typeof fetch);
    const submission = await provider.generateBackground(input);

    await expect(provider.getJobStatus(submission)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
    vi.advanceTimersByTime(COMPLETED_RESULT_TTL_MS);
    await expect(provider.getJobStatus(submission)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("evicts the oldest completed result when capacity exceeds four", async () => {
    let requestNumber = 0;
    const fetchMock = vi.fn(
      async (
        _fetchInput: string | URL | Request,
        fetchInit?: RequestInit,
      ): Promise<Response> => {
        if (fetchInit?.method === "POST") {
          requestNumber += 1;
          return qwenSuccessResponse(`qwen-cache-${requestNumber}`);
        }
        return imageResponse(`png-${requestNumber}`);
      },
    );
    const provider = createProvider(fetchMock as typeof fetch);
    const submissions = [];

    for (let index = 0; index < 5; index += 1) {
      submissions.push(
        await provider.generateBackground({
          ...input,
          idempotencyKey: `qwen-capacity-${index}`,
        }),
      );
    }

    await expect(provider.getJobStatus(submissions[0]!)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
      retryable: false,
    });
    await expect(provider.getJobStatus(submissions[1]!)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
  });

  it("keeps mock as the default and selects Qwen only when configured", () => {
    expect(createImageGenerationProvider({}).name).toBe("mock");
    expect(
      createImageGenerationProvider({
        IMAGE_GENERATION_PROVIDER: "qwen",
        QWEN_API_KEY: "test-qwen-key",
        QWEN_ENDPOINT: endpoint,
        QWEN_MODEL: "qwen-image-2.0",
        QWEN_TIMEOUT_MS: "180000",
      }).name,
    ).toBe("qwen");
    expect(() =>
      createImageGenerationProvider({ IMAGE_GENERATION_PROVIDER: "qwen" }),
    ).toThrow("Missing required environment variable: QWEN_API_KEY");
    expect(() =>
      createImageGenerationProvider({
        IMAGE_GENERATION_PROVIDER: "qwen",
        QWEN_API_KEY: "test-qwen-key",
        QWEN_TIMEOUT_MS: "not-a-number",
      }),
    ).toThrow("QWEN_TIMEOUT_MS must be an integer");
  });
});

function createProvider(fetchImpl: typeof fetch, providerEndpoint = endpoint) {
  return new QwenImageGenerationProvider({
    apiKey: "test-qwen-key",
    endpoint: providerEndpoint,
    model: "qwen-image-2.0",
    timeoutMs: 180_000,
    fetchImpl,
  });
}

function qwenSuccessResponse(
  providerRequestId: string,
  resultImageUrl = imageUrl,
  width = 1080,
  height = 1080,
): Response {
  return jsonResponse({
    request_id: providerRequestId,
    output: {
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: [{ image: resultImageUrl }],
          },
        },
      ],
    },
    usage: { image_count: 1, width, height },
  });
}

function imageResponse(body: string | Uint8Array): Response {
  let responseBody: BodyInit;
  if (typeof body === "string") {
    responseBody = body;
  } else {
    const copy = new Uint8Array(body.byteLength);
    copy.set(body);
    responseBody = copy.buffer;
  }

  return new Response(responseBody, {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}

function redirectResponse(status: number, location: string): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

function sequenceFetch(responses: Response[]) {
  return vi.fn(
    async (
      fetchInput: string | URL | Request,
      fetchInit?: RequestInit,
    ): Promise<Response> => {
      void fetchInput;
      void fetchInit;
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fetch call");
      return response;
    },
  );
}

async function createValidPng(): Promise<Uint8Array> {
  return Uint8Array.from(
    await sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 4,
        background: "#F4F4F4",
      },
    })
      .png()
      .toBuffer(),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
