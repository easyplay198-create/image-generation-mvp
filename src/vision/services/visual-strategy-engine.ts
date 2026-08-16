import { ProviderAdapterError } from "@/src/providers/provider-error";
import {
  parseVisualStrategy,
  parseVisualStrategyInput,
  VisualStrategyValidationError,
  type VisualStrategy,
} from "@/src/vision/contracts/visual-strategy";
import type {
  VisualStrategyProvider,
  VisualStrategyProviderResult,
} from "@/src/vision/visual-strategy/visual-strategy-provider";

const MAX_PROVIDER_REQUEST_ID_LENGTH = 200;

/**
 * Phase-one Visual Strategy Engine orchestration.
 *
 * The engine validates contracts only. Prompting, rule evaluation, transport
 * and model selection stay inside the injected provider.
 */
export class VisualStrategyEngine {
  constructor(private readonly provider: VisualStrategyProvider) {}

  async execute(input: unknown): Promise<VisualStrategy> {
    const validatedInput = parseVisualStrategyInput(input);
    const rawResult: unknown = await this.provider.createStrategy(
      validatedInput,
    );
    const result = parseProviderResult(rawResult);

    try {
      return parseVisualStrategy(result.output);
    } catch (error) {
      if (error instanceof VisualStrategyValidationError) {
        throw invalidProviderResponse(
          "Visual Strategy Provider 返回了无效 Visual Strategy。",
          result.providerRequestId,
        );
      }

      throw error;
    }
  }
}

function parseProviderResult(input: unknown): VisualStrategyProviderResult {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !("output" in input) ||
    !("providerRequestId" in input)
  ) {
    throw invalidProviderResponse(
      "Visual Strategy Provider 返回了无效响应。",
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
      "Visual Strategy Provider 返回了无效响应。",
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
