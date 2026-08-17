import {
  parseProductProfile,
  parseProductUnderstandingInput,
  ProductUnderstandingValidationError,
  type ProductProfile,
} from "@/src/domain/product-understanding";
import { ProviderAdapterError } from "@/src/providers/provider-error";
import type {
  VisionModelProductUnderstandingResult,
  VisionModelProvider,
} from "@/src/providers/vision-model-provider";

const MAX_PROVIDER_REQUEST_ID_LENGTH = 200;

/**
 * Phase-one Product Understanding orchestration.
 *
 * The skill owns contract validation only. Provider-specific authentication,
 * transport and model selection remain inside concrete VisionModelProvider
 * adapters.
 */
export class ProductUnderstandingSkill {
  constructor(private readonly provider: VisionModelProvider) {}

  async execute(input: unknown): Promise<ProductProfile> {
    const validatedInput = parseProductUnderstandingInput(input);
    const rawResult: unknown = await this.provider.understandProduct(
      validatedInput,
    );
    const result = parseProviderResult(rawResult);

    try {
      return parseProductProfile(result.output);
    } catch (error) {
      if (error instanceof ProductUnderstandingValidationError) {
        throw invalidProviderResponse(
          "Vision Model Provider 返回了无效 Product Profile。",
          result.providerRequestId,
        );
      }

      throw error;
    }
  }
}

function parseProviderResult(
  input: unknown,
): VisionModelProductUnderstandingResult {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !("output" in input) ||
    !("providerRequestId" in input)
  ) {
    throw invalidProviderResponse(
      "Vision Model Provider 返回了无效响应。",
      null,
    );
  }

  const providerRequestId = input.providerRequestId;
  if (
    providerRequestId !== null &&
    (typeof providerRequestId !== "string" ||
      providerRequestId.trim().length === 0 ||
      providerRequestId.trim().length > MAX_PROVIDER_REQUEST_ID_LENGTH)
  ) {
    throw invalidProviderResponse(
      "Vision Model Provider 返回了无效响应。",
      null,
    );
  }

  return {
    output: input.output,
    providerRequestId:
      typeof providerRequestId === "string"
        ? providerRequestId.trim()
        : providerRequestId,
  };
}

function invalidProviderResponse(
  message: string,
  providerRequestId: string | null,
): ProviderAdapterError {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    providerRequestId,
  );
}
