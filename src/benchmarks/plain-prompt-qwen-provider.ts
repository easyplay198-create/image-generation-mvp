import sharp from "sharp";
import { z } from "zod";

import type {
  GeneratedImagePayload,
  ProductReferenceImage,
} from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";
import {
  normalizeQwenInputImage,
  QWEN_MAX_DOWNLOAD_BYTES,
  readLimitedImageResponseBody,
} from "@/src/providers/qwen-image-boundaries";
import { assertQwenPromptBudget } from "@/src/providers/qwen-prompt";
import {
  DEFAULT_QWEN_ENDPOINT,
  DEFAULT_QWEN_MODEL,
  DEFAULT_QWEN_TIMEOUT_MS,
} from "@/src/providers/qwen-image-generation-provider";

const QWEN_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

const responseSchema = z
  .object({
    request_id: z.string().min(1),
    output: z.object({
      choices: z.array(
        z.object({
          message: z.object({
            content: z.array(z.object({ image: z.string().url() }).passthrough()),
          }).passthrough(),
        }).passthrough(),
      ).min(1),
    }).passthrough(),
    usage: z.object({ image_count: z.number().int().positive().optional() }).passthrough().optional(),
  })
  .passthrough();

export type PlainPromptGenerationResult = {
  providerRequestId: string;
  image: GeneratedImagePayload;
  rawUsage: { generatedImages: number; width: number; height: number };
};

export class PlainPromptQwenProvider {
  readonly name = "qwen";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: {
    apiKey: string;
    endpoint: string;
    modelName: string;
    timeoutMs: number;
    fetchImpl?: typeof fetch;
  }) {
    this.apiKey = options.apiKey.trim();
    this.endpoint = validateEndpoint(options.endpoint);
    this.modelName = options.modelName.trim();
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!this.apiKey || !this.modelName) throw new Error("Qwen benchmark configuration is incomplete.");
  }

  async generate(input: {
    prompt: string;
    productReference: ProductReferenceImage;
    canvas: { width: 800; height: 800 };
  }): Promise<PlainPromptGenerationResult> {
    let providerRequestId: string | null = null;
    try {
      assertQwenPromptBudget(input.prompt);
      const productImage = await normalizeQwenInputImage(
        input.productReference,
        "Benchmark 商品图",
      );
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelName,
          input: {
            messages: [
              {
                role: "user",
                content: [{ image: productImage }, { text: input.prompt }],
              },
            ],
          },
          parameters: {
            size: `${input.canvas.width}*${input.canvas.height}`,
            n: 1,
            watermark: false,
            prompt_extend: false,
          },
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = await readJson(response);
      if (!response.ok) throw mapHttpError(response.status, body);
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) {
        throw invalidResponse(
          null,
          "Qwen Benchmark 返回了无效响应。",
          "MAY_HAVE_BEEN_ACCEPTED",
        );
      }
      providerRequestId = parsed.data.request_id;
      const imageUrl = parsed.data.output.choices
        .flatMap((choice) => choice.message.content)
        .find((item) => item.image)?.image;
      if (!imageUrl) throw invalidResponse(providerRequestId, "Qwen Benchmark 响应缺少图片。");
      const downloaded = await this.download(imageUrl, providerRequestId);
      const image = await normalizeOutput(downloaded, input.canvas, providerRequestId);
      return {
        providerRequestId,
        image,
        rawUsage: {
          generatedImages: parsed.data.usage?.image_count ?? 1,
          width: input.canvas.width,
          height: input.canvas.height,
        },
      };
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      const timeout =
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      throw new ProviderAdapterError(
        "PROVIDER_TIMEOUT",
        true,
        timeout ? "Qwen Benchmark 请求超时。" : "Qwen Benchmark 网络请求失败。",
        providerRequestId,
        "MAY_HAVE_BEEN_ACCEPTED",
      );
    }
  }

  normalizeUsage(raw: PlainPromptGenerationResult["rawUsage"]) {
    return {
      generatedImages: raw.generatedImages,
      inputUnits: null,
      outputPixels: raw.generatedImages * raw.width * raw.height,
      costMetadata: {
        status: "UNKNOWN" as const,
        amount: null,
        currency: null,
        estimated: false as const,
        reason: "PRICING_NOT_VERIFIED" as const,
      },
    };
  }

  private async download(url: string, requestId: string): Promise<GeneratedImagePayload> {
    const safeUrl = validateImageUrl(url, requestId);
    const response = await this.fetchImpl(safeUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok || !response.body) throw invalidResponse(requestId, "Qwen Benchmark 图片下载失败。");
    const declared = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (declared !== "image/png") throw invalidResponse(requestId, "Qwen Benchmark 图片类型不是 PNG。");
    const bytes = await readLimitedImageResponseBody(
      response,
      requestId,
      "Qwen Benchmark 图片",
    );
    return { body: bytes, mimeType: "image/png" };
  }
}

export function createPlainPromptQwenProvider(
  environment: Record<string, string | undefined> = process.env,
) {
  const apiKey = environment.QWEN_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing QWEN_API_KEY.");
  const timeout = environment.QWEN_TIMEOUT_MS?.trim()
    ? Number(environment.QWEN_TIMEOUT_MS)
    : DEFAULT_QWEN_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 600_000) {
    throw new Error("QWEN_TIMEOUT_MS must be an integer between 1000 and 600000.");
  }
  return new PlainPromptQwenProvider({
    apiKey,
    endpoint: environment.QWEN_ENDPOINT?.trim() || DEFAULT_QWEN_ENDPOINT,
    modelName: environment.QWEN_MODEL?.trim() || DEFAULT_QWEN_MODEL,
    timeoutMs: timeout,
  });
}

async function normalizeOutput(
  image: GeneratedImagePayload,
  canvas: { width: 800; height: 800 },
  requestId: string,
): Promise<GeneratedImagePayload> {
  try {
    const normalized = await sharp(image.body, { failOn: "error", limitInputPixels: 100_000_000 })
      .resize(canvas.width, canvas.height, { fit: "contain", background: "#FFFFFF" })
      .png()
      .toBuffer();
    if (normalized.byteLength > QWEN_MAX_DOWNLOAD_BYTES) throw new Error("too large");
    return { body: Uint8Array.from(normalized), mimeType: "image/png" };
  } catch {
    throw invalidResponse(requestId, "Qwen Benchmark 图片归一化失败。");
  }
}

function validateEndpoint(value: string): string {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  const allowedHost =
    host === "dashscope.aliyuncs.com" ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(host);
  if (
    url.protocol !== "https:" ||
    !allowedHost ||
    url.pathname !== QWEN_PATH ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("QWEN_ENDPOINT is not an allowed Qwen generation endpoint.");
  }
  return url.toString();
}

function validateImageUrl(value: string, requestId: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.toLowerCase().endsWith(".aliyuncs.com") ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw invalidResponse(requestId, "Qwen Benchmark 图片 URL 不受信任。");
  }
  return url.toString();
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapHttpError(status: number, body: unknown) {
  const code =
    typeof body === "object" && body && "code" in body && typeof body.code === "string"
      ? body.code.toLowerCase()
      : "";
  if (status === 401 || status === 403) {
    return new ProviderAdapterError(
      "PROVIDER_AUTH_FAILED",
      false,
      "Qwen Benchmark 认证失败。",
      null,
      "REJECTED",
    );
  }
  if (status === 429 || code.includes("rate")) {
    return new ProviderAdapterError(
      "PROVIDER_RATE_LIMITED",
      true,
      "Qwen Benchmark 请求受限。",
      null,
      "REJECTED",
    );
  }
  if (status >= 500 || status === 408) {
    return new ProviderAdapterError(
      "PROVIDER_TIMEOUT",
      true,
      "Qwen Benchmark 暂时不可用。",
      null,
      "MAY_HAVE_BEEN_ACCEPTED",
    );
  }
  return invalidResponse(null, "Qwen Benchmark 请求失败。");
}

function invalidResponse(
  requestId: string | null,
  message: string,
  submissionDisposition:
    | "NOT_SENT"
    | "REJECTED"
    | "MAY_HAVE_BEEN_ACCEPTED" = requestId
    ? "MAY_HAVE_BEEN_ACCEPTED"
    : "NOT_SENT",
) {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    requestId,
    submissionDisposition,
  );
}
