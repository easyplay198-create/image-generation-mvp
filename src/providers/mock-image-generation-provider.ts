import { createHash } from "node:crypto";

import sharp from "sharp";
import { z } from "zod";

import type {
  ImageGenerationProvider,
  ImageGenerationStatus,
  NormalizedGenerationUsage,
} from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";

export const MOCK_IMAGE_GENERATION_SCENARIOS = [
  "success",
  "timeout",
  "rate-limited",
  "invalid-response",
  "policy-rejected",
] as const;

export type MockImageGenerationScenario =
  (typeof MOCK_IMAGE_GENERATION_SCENARIOS)[number];

const rawUsageSchema = z
  .object({
    generatedImages: z.number().int().min(1).max(10),
    inputUnits: z.number().int().nonnegative().nullable(),
    outputPixels: z.number().int().positive(),
    cost: z
      .object({
        amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
        currency: z.string().regex(/^[A-Z]{3}$/),
        estimated: z.boolean(),
      })
      .strict(),
  })
  .strict();

type GenerationInput = Parameters<
  ImageGenerationProvider["generateBackground"]
>[0];

export class MockImageGenerationProvider
  implements ImageGenerationProvider
{
  readonly name = "mock";
  private readonly requests = new Map<string, GenerationInput>();

  constructor(
    private readonly scenario: MockImageGenerationScenario = "success",
  ) {}

  async generateBackground(
    input: GenerationInput,
  ): Promise<{ providerRequestId: string }> {
    const providerRequestId = createProviderRequestId(
      input.projectId,
      input.idempotencyKey,
    );

    switch (this.scenario) {
      case "timeout":
        throw new ProviderAdapterError(
          "PROVIDER_TIMEOUT",
          true,
          "图片生成 Provider 请求超时。",
          providerRequestId,
        );
      case "rate-limited":
        throw new ProviderAdapterError(
          "PROVIDER_RATE_LIMITED",
          true,
          "图片生成 Provider 请求受限。",
          providerRequestId,
        );
      case "policy-rejected":
        throw new ProviderAdapterError(
          "PROVIDER_POLICY_REJECTED",
          false,
          "图片生成请求被 Provider 策略拒绝。",
          providerRequestId,
        );
      case "invalid-response":
      case "success":
        this.requests.set(providerRequestId, input);
        return { providerRequestId };
    }
  }

  async getJobStatus(input: {
    providerRequestId: string;
  }): Promise<ImageGenerationStatus> {
    const request = this.requests.get(input.providerRequestId);
    if (!request || this.scenario === "invalid-response") {
      throw new ProviderAdapterError(
        "PROVIDER_INVALID_RESPONSE",
        false,
        "图片生成 Provider 返回了无效任务状态。",
        input.providerRequestId,
      );
    }

    const buffer = await sharp({
      create: {
        width: request.canvas.width,
        height: request.canvas.height,
        channels: 4,
        background: request.styleSpec.palette[0]?.hex ?? "#F4F4F4",
      },
    })
      .png()
      .toBuffer();

    return {
      status: "SUCCEEDED",
      image: {
        body: Uint8Array.from(buffer),
        mimeType: "image/png",
      },
      rawUsage: {
        generatedImages: 1,
        inputUnits: 200 + request.styleSpec.moodKeywords.length,
        outputPixels: request.canvas.width * request.canvas.height,
        cost: {
          amount: "0.0000",
          currency: "USD",
          estimated: true,
        },
      },
    };
  }

  normalizeUsage(rawUsage: unknown): NormalizedGenerationUsage {
    const result = rawUsageSchema.safeParse(rawUsage);
    if (!result.success) {
      throw new ProviderAdapterError(
        "PROVIDER_INVALID_RESPONSE",
        false,
        "图片生成 Provider 返回了无效用量数据。",
      );
    }

    return {
      generatedImages: result.data.generatedImages,
      inputUnits: result.data.inputUnits,
      outputPixels: result.data.outputPixels,
      costMetadata: result.data.cost,
    };
  }
}

function createProviderRequestId(
  projectId: string,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256")
    .update(`${projectId}:${idempotencyKey}`)
    .digest("hex")
    .slice(0, 24);

  return `mock-generation-${digest}`;
}
