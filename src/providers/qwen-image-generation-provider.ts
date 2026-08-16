import { z } from "zod";
import sharp from "sharp";

import type {
  ImageGenerationProvider,
  ImageGenerationStatus,
  NormalizedGenerationUsage,
} from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";

export const DEFAULT_QWEN_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
export const DEFAULT_QWEN_MODEL = "qwen-image-2.0";
export const DEFAULT_QWEN_TIMEOUT_MS = 180_000;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_REFERENCE_IMAGE_DIMENSION = 384;
const MAX_REFERENCE_IMAGE_DIMENSION = 3_072;
const MAX_COMPLETED_RESULTS = 4;
const COMPLETED_RESULT_TTL_MS = 10 * 60 * 1_000;
const QWEN_GENERATION_PATH =
  "/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_PUBLIC_HOST = "dashscope.aliyuncs.com";
const QWEN_BEIJING_WORKSPACE_HOST =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cn-beijing\.maas\.aliyuncs\.com$/;
const QWEN_SINGAPORE_WORKSPACE_HOST =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ap-southeast-1\.maas\.aliyuncs\.com$/;

const qwenSuccessResponseSchema = z
  .object({
    request_id: z.string().trim().min(1).max(200),
    output: z
      .object({
        choices: z
          .array(
            z
              .object({
                message: z
                  .object({
                    content: z
                      .array(
                        z
                          .object({ image: z.string().url() })
                          .passthrough(),
                      )
                      .min(1),
                  })
                  .passthrough(),
              })
              .passthrough(),
          )
          .min(1),
      })
      .passthrough(),
    usage: z
      .object({
        image_count: z.number().int().positive().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const qwenErrorResponseSchema = z
  .object({
    request_id: z.string().trim().min(1).max(200).optional(),
    code: z.string().optional(),
  })
  .passthrough();

const qwenUsageSchema = z
  .object({
    generatedImages: z.number().int().min(1).max(6),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

type GenerationInput = Parameters<
  ImageGenerationProvider["generateBackground"]
>[0];
type SucceededStatus = Extract<
  ImageGenerationStatus,
  { status: "SUCCEEDED" }
>;
type CompletedResult = {
  result: SucceededStatus;
  expiresAt: number;
};

export type QwenImageGenerationProviderOptions = {
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

export class QwenImageGenerationProvider
  implements ImageGenerationProvider
{
  readonly name = "qwen";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly completed = new Map<string, CompletedResult>();

  constructor(options: QwenImageGenerationProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.endpoint = validateEndpoint(options.endpoint);
    this.model = options.model.trim();
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (!this.apiKey) throw new Error("Missing QWEN_API_KEY.");
    if (!this.model) throw new Error("Missing QWEN_MODEL.");
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000) {
      throw new Error("QWEN_TIMEOUT_MS must be an integer of at least 1000.");
    }
  }

  async generateBackground(
    input: GenerationInput,
  ): Promise<{ providerRequestId: string }> {
    let providerRequestId: string | null = null;

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildRequestBody(
            this.model,
            input,
            input.productReference
              ? await prepareProductReference(input.productReference)
              : undefined,
            await Promise.all(
              (input.visualReferences ?? []).map(prepareProductReference),
            ),
          ),
        ),
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (isRedirectStatus(response.status)) {
        throw invalidResponse(null, "Qwen Provider Endpoint 不允许重定向。");
      }
      const responseBody = await readJson(response);

      if (!response.ok) {
        throw mapHttpError(response.status, responseBody, null);
      }

      const parsed = qwenSuccessResponseSchema.safeParse(responseBody);
      if (!parsed.success) {
        throw invalidResponse(null, "Qwen Provider 返回了无效生成响应。");
      }

      providerRequestId = parsed.data.request_id;
      const imageUrl = findImageUrl(parsed.data);
      if (!imageUrl) {
        throw invalidResponse(
          providerRequestId,
          "Qwen Provider 响应中缺少生成图片。",
        );
      }

      const downloadedImage = await this.downloadImage(
        imageUrl,
        providerRequestId,
      );
      const image = input.productReference
        ? await normalizeOutputImage(
            downloadedImage,
            input.canvas,
            providerRequestId,
          )
        : downloadedImage;
      const width = input.productReference
        ? input.canvas.width
        : parsed.data.usage?.width ?? input.canvas.width;
      const height = input.productReference
        ? input.canvas.height
        : parsed.data.usage?.height ?? input.canvas.height;
      const generatedImages = parsed.data.usage?.image_count ?? 1;

      this.storeCompletedResult(providerRequestId, {
        status: "SUCCEEDED",
        image,
        rawUsage: { generatedImages, width, height },
      });

      return { providerRequestId };
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      if (isTimeoutError(error)) {
        throw new ProviderAdapterError(
          "PROVIDER_TIMEOUT",
          true,
          "Qwen Provider 请求超时。",
          providerRequestId,
        );
      }
      throw new ProviderAdapterError(
        "PROVIDER_TIMEOUT",
        true,
        "Qwen Provider 网络请求失败。",
        providerRequestId,
      );
    }
  }

  async getJobStatus(input: {
    providerRequestId: string;
  }): Promise<ImageGenerationStatus> {
    this.pruneCompletedResults();
    const completed = this.completed.get(input.providerRequestId);
    if (!completed) {
      throw invalidResponse(
        input.providerRequestId,
        "Qwen Provider 生成结果不存在或已过期。",
      );
    }

    return completed.result;
  }

  normalizeUsage(rawUsage: unknown): NormalizedGenerationUsage {
    const parsed = qwenUsageSchema.safeParse(rawUsage);
    if (!parsed.success) {
      throw invalidResponse(null, "Qwen Provider 返回了无效用量数据。");
    }

    return {
      generatedImages: parsed.data.generatedImages,
      inputUnits: null,
      outputPixels:
        parsed.data.generatedImages * parsed.data.width * parsed.data.height,
      costMetadata: {
        amount: "0.0000",
        currency: "CNY",
        estimated: true,
      },
    };
  }

  private async downloadImage(
    imageUrl: string,
    providerRequestId: string,
  ): Promise<{ body: Uint8Array; mimeType: string }> {
    const safeUrl = validateImageUrl(imageUrl, providerRequestId);
    const response = await this.fetchImpl(safeUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (isRedirectStatus(response.status)) {
      throw invalidResponse(
        providerRequestId,
        "Qwen Provider 图片下载不允许重定向。",
      );
    }
    if (!response.ok) {
      throw mapHttpError(response.status, null, providerRequestId);
    }

    const mimeType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mimeType !== "image/png") {
      throw invalidResponse(
        providerRequestId,
        "Qwen Provider 返回的图片类型不是 PNG。",
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength !== null) {
      const declaredLength = Number(contentLength);
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
        throw invalidResponse(
          providerRequestId,
          "Qwen Provider 图片长度无效。",
        );
      }
      if (declaredLength > MAX_IMAGE_BYTES) {
        throw invalidResponse(providerRequestId, "Qwen Provider 图片过大。");
      }
    }

    const body = await readLimitedImageBody(response, providerRequestId);

    return { body, mimeType };
  }

  private storeCompletedResult(
    providerRequestId: string,
    result: SucceededStatus,
  ): void {
    const now = Date.now();
    this.pruneCompletedResults(now);
    this.completed.delete(providerRequestId);

    while (this.completed.size >= MAX_COMPLETED_RESULTS) {
      const oldestRequestId = this.completed.keys().next().value;
      if (typeof oldestRequestId !== "string") break;
      this.completed.delete(oldestRequestId);
    }

    this.completed.set(providerRequestId, {
      result,
      expiresAt: now + COMPLETED_RESULT_TTL_MS,
    });
  }

  private pruneCompletedResults(now = Date.now()): void {
    for (const [providerRequestId, completed] of this.completed) {
      if (completed.expiresAt <= now) {
        this.completed.delete(providerRequestId);
      }
    }
  }
}

async function readLimitedImageBody(
  response: Response,
  providerRequestId: string,
): Promise<Uint8Array> {
  if (!response.body) {
    throw invalidResponse(providerRequestId, "Qwen Provider 图片响应为空。");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidResponse(providerRequestId, "Qwen Provider 图片过大。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw invalidResponse(providerRequestId, "Qwen Provider 图片大小无效。");
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function buildRequestBody(
  model: string,
  input: GenerationInput,
  productReferenceDataUrl?: string,
  visualReferenceDataUrls: string[] = [],
) {
  return {
    model,
    input: {
      messages: [
        {
          role: "user",
          content: productReferenceDataUrl
            ? [
                { image: productReferenceDataUrl },
                ...visualReferenceDataUrls.map((image) => ({ image })),
                { text: buildProductMainImagePrompt(input) },
              ]
            : [{ text: buildBackgroundPrompt(input) }],
        },
      ],
    },
    parameters: {
      size: `${input.canvas.width}*${input.canvas.height}`,
      n: 1,
      watermark: false,
      prompt_extend: false,
      negative_prompt: buildNegativePrompt(
        input,
        productReferenceDataUrl !== undefined,
      ),
    },
  };
}

function buildProductMainImagePrompt(input: GenerationInput): string {
  const { styleSpec, productContext } = input;
  return [
    "基于输入图片生成一张正方形电商商品主图候选图。",
    "图片1中的橙灰色应急启动电源充气泵是唯一可信的商品主体；必须保持同一设备的外形、颜色、结构、比例、屏幕与实体按键，不得替换型号、增加部件、虚构附件或生成第二个商品。",
    "必须移除图片1中商品机身之外的手、车辆、配件栏、宣传标牌和原背景，只保留完整设备主体并置于新背景中。",
    ...(input.visualReferences?.length
      ? [
          `图片2至图片${input.visualReferences.length + 1}仅用于参考背景、光线、构图和配色；不得复制其中的商品、文字、品牌、商标、包装或未经确认的卖点。`,
        ]
      : []),
    "只允许调整背景、环境、光线、阴影和构图；不得添加人物、手、价格、促销文字、额外商标或水印。",
    "除设备自身屏幕和实体按键外，最终画面不得出现任何文字、字母、数字、单位、参数、徽章、标签、标牌、品牌、商标、logo 或宣传 claim；必须保持商品右侧留白为空白。",
    `以下内容被业务明确禁止，最终画面中不得出现或变形复述：${productContext.forbiddenClaims.join("；")}。`,
    `最终输出必须是 ${input.canvas.width}×${input.canvas.height} 像素完整商品主图。`,
    `商品：${productContext.productName}；类目：${productContext.category}。`,
    `已确认卖点：${productContext.sellingPoints.join("、")}。`,
    productContext.targetAudience
      ? `目标受众：${productContext.targetAudience}。`
      : "",
    `风格摘要：${styleSpec.summary}。`,
    `氛围：${styleSpec.moodKeywords.join("、")}。`,
    `背景场景：${styleSpec.background.scene}；材质：${styleSpec.background.texture}；光线：${styleSpec.background.lighting}。`,
    `构图：商品位置 ${styleSpec.composition.productPlacement}；机位 ${styleSpec.composition.cameraAngle}；留白 ${styleSpec.composition.negativeSpace}。`,
    `配色：${styleSpec.palette.map((color) => `${color.hex} ${color.role}`).join("、")}。`,
    `装饰约束：${styleSpec.decorations.join("、") || "不添加额外装饰"}。`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBackgroundPrompt(input: GenerationInput): string {
  const { styleSpec, productContext } = input;
  return [
    "生成一张正方形电商商品摄影背景图，只生成背景和环境。",
    "不要绘制商品、包装、人物、文字、商标、价格标签或水印；商品将由编辑器作为独立图层叠加。",
    `商品语境（仅用于构图留白，不得画出商品）：${productContext.productName}，${productContext.category}。`,
    `风格摘要：${styleSpec.summary}。`,
    `氛围：${styleSpec.moodKeywords.join("、")}。`,
    `背景场景：${styleSpec.background.scene}；材质：${styleSpec.background.texture}；光线：${styleSpec.background.lighting}。`,
    `构图：商品位置 ${styleSpec.composition.productPlacement}；机位 ${styleSpec.composition.cameraAngle}；留白 ${styleSpec.composition.negativeSpace}。`,
    `配色：${styleSpec.palette.map((color) => `${color.hex} ${color.role}`).join("、")}。`,
  ].join("\n");
}

function buildNegativePrompt(
  input: GenerationInput,
  hasProductReference: boolean,
): string {
  const common = [
    "人物",
    "手",
    "价格标签",
    "水印",
    "宣传文字",
    "字母",
    "数字参数",
    "单位",
    "徽章",
    "标牌",
    "品牌",
    "商标",
    "logo",
    "虚构附件",
  ];
  const modeSpecific = hasProductReference
    ? [
        "第二个商品",
        "重复商品",
        "替换商品",
        "改变商品外形",
        "改变商品颜色",
        "改变原有标签",
        "额外文字",
        "额外商标",
      ]
    : ["商品主体", "产品包装", "文字", "字母", "数字", "logo", "商标"];

  return [
    ...input.productContext.forbiddenClaims,
    ...modeSpecific,
    ...common,
    ...input.styleSpec.negativeConstraints,
  ]
    .join("，")
    .slice(0, 500);
}

async function prepareProductReference(
  reference: NonNullable<GenerationInput["productReference"]>,
): Promise<string> {
  if (
    reference.body.byteLength === 0 ||
    reference.body.byteLength > MAX_IMAGE_BYTES ||
    !["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType) ||
    !Number.isInteger(reference.width) ||
    !Number.isInteger(reference.height) ||
    reference.width <= 0 ||
    reference.height <= 0
  ) {
    throw invalidResponse(null, "Qwen 商品参考图输入无效。");
  }

  let image = sharp(reference.body, {
    failOn: "error",
    limitInputPixels: 100_000_000,
  }).rotate();
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw invalidResponse(null, "Qwen 商品参考图无法解码。");
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width !== reference.width ||
    metadata.height !== reference.height
  ) {
    throw invalidResponse(null, "Qwen 商品参考图尺寸与资产记录不一致。");
  }

  const scale = Math.min(
    1,
    MAX_REFERENCE_IMAGE_DIMENSION / metadata.width,
    MAX_REFERENCE_IMAGE_DIMENSION / metadata.height,
  );
  const targetWidth = Math.max(
    MIN_REFERENCE_IMAGE_DIMENSION,
    Math.round(metadata.width * scale),
  );
  const targetHeight = Math.max(
    MIN_REFERENCE_IMAGE_DIMENSION,
    Math.round(metadata.height * scale),
  );
  image = image.resize(targetWidth, targetHeight, {
    fit: "inside",
    withoutEnlargement:
      metadata.width >= MIN_REFERENCE_IMAGE_DIMENSION &&
      metadata.height >= MIN_REFERENCE_IMAGE_DIMENSION,
  });

  let normalized: Buffer;
  try {
    normalized = await image.png({ compressionLevel: 9 }).toBuffer();
  } catch {
    throw invalidResponse(null, "Qwen 商品参考图归一化失败。");
  }
  let mimeType = "image/png";
  if (normalized.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    try {
      normalized = await image
        .flatten({ background: "#FFFFFF" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } catch {
      throw invalidResponse(null, "Qwen 商品参考图归一化失败。");
    }
    mimeType = "image/jpeg";
  }
  if (normalized.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw invalidResponse(null, "Qwen 商品参考图归一化后仍超过 10 MiB。" );
  }

  return `data:${mimeType};base64,${normalized.toString("base64")}`;
}

async function normalizeOutputImage(
  image: { body: Uint8Array; mimeType: string },
  canvas: { width: number; height: number },
  providerRequestId: string,
): Promise<{ body: Uint8Array; mimeType: string }> {
  let metadata;
  try {
    metadata = await sharp(image.body, {
      failOn: "error",
      limitInputPixels: 100_000_000,
    }).metadata();
  } catch {
    throw invalidResponse(providerRequestId, "Qwen Provider 图片无法解码。");
  }
  if (metadata.width === canvas.width && metadata.height === canvas.height) {
    return image;
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(image.body, {
      failOn: "error",
      limitInputPixels: 100_000_000,
    })
      .resize(canvas.width, canvas.height, {
        fit: "contain",
        background: "#FFFFFF",
      })
      .png()
      .toBuffer();
  } catch {
    throw invalidResponse(providerRequestId, "Qwen Provider 图片归一化失败。");
  }
  if (normalized.byteLength > MAX_IMAGE_BYTES) {
    throw invalidResponse(providerRequestId, "Qwen Provider 归一化图片过大。");
  }
  return { body: Uint8Array.from(normalized), mimeType: "image/png" };
}

function findImageUrl(
  response: z.infer<typeof qwenSuccessResponseSchema>,
): string | undefined {
  for (const choice of response.output.choices) {
    for (const item of choice.message.content) {
      if (item.image) return item.image;
    }
  }
  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapHttpError(
  status: number,
  responseBody: unknown,
  fallbackRequestId: string | null,
): ProviderAdapterError {
  const parsed = qwenErrorResponseSchema.safeParse(responseBody);
  const code = parsed.success ? parsed.data.code?.toLowerCase() ?? "" : "";
  const providerRequestId =
    (parsed.success ? parsed.data.request_id : undefined) ?? fallbackRequestId;

  if (
    status === 401 ||
    status === 403 ||
    code.includes("invalidapikey") ||
    code.includes("authentication")
  ) {
    return new ProviderAdapterError(
      "PROVIDER_AUTH_FAILED",
      false,
      "Qwen Provider 认证失败。",
      providerRequestId,
    );
  }
  if (status === 429 || code.includes("throttl") || code.includes("ratelimit")) {
    return new ProviderAdapterError(
      "PROVIDER_RATE_LIMITED",
      true,
      "Qwen Provider 请求受限。",
      providerRequestId,
    );
  }
  if (
    code.includes("inspection") ||
    code.includes("sensitive") ||
    code.includes("policy")
  ) {
    return new ProviderAdapterError(
      "PROVIDER_POLICY_REJECTED",
      false,
      "Qwen Provider 因内容策略拒绝了请求。",
      providerRequestId,
    );
  }
  if (status === 408 || status === 504 || status >= 500) {
    return new ProviderAdapterError(
      "PROVIDER_TIMEOUT",
      true,
      "Qwen Provider 暂时不可用或请求超时。",
      providerRequestId,
    );
  }
  return invalidResponse(providerRequestId, "Qwen Provider 请求失败。");
}

function validateEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new Error("QWEN_ENDPOINT must be a valid URL.");
  }

  const hostname = endpoint.hostname.toLowerCase();
  const allowedHost =
    hostname === QWEN_PUBLIC_HOST ||
    QWEN_BEIJING_WORKSPACE_HOST.test(hostname) ||
    QWEN_SINGAPORE_WORKSPACE_HOST.test(hostname);
  if (
    endpoint.protocol !== "https:" ||
    !allowedHost ||
    endpoint.port !== "" ||
    endpoint.pathname !== QWEN_GENERATION_PATH ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  ) {
    throw new Error("QWEN_ENDPOINT is not an allowed Qwen generation endpoint.");
  }
  return endpoint.toString();
}

function validateImageUrl(
  value: string,
  providerRequestId: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidResponse(providerRequestId, "Qwen Provider 图片 URL 无效。");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.toLowerCase().endsWith(".aliyuncs.com") ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw invalidResponse(
      providerRequestId,
      "Qwen Provider 图片 URL 不在允许的域名范围内。",
    );
  }
  return url.toString();
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function invalidResponse(
  providerRequestId: string | null,
  message: string,
): ProviderAdapterError {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    providerRequestId,
  );
}
