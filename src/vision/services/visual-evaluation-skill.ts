import { ProviderAdapterError } from "@/src/providers/provider-error";
import {
  parseVisualEvaluationInput,
  parseVisualEvaluationReport,
  VisualEvaluationValidationError,
  type VisualEvaluationReport,
} from "@/src/vision/contracts/visual-evaluation";
import type {
  VisualEvaluationProvider,
  VisualEvaluationProviderResult,
} from "@/src/vision/visual-evaluation/visual-evaluation-provider";

const MAX_PROVIDER_REQUEST_ID_LENGTH = 200;

/**
 * Phase-one Visual Evaluation orchestration.
 *
 * The skill validates input and output contracts only. Evaluation algorithms,
 * transport, model selection and human-review workflows stay in providers.
 */
export class VisualEvaluationSkill {
  constructor(private readonly provider: VisualEvaluationProvider) {}

  async execute(input: unknown): Promise<VisualEvaluationReport> {
    const validatedInput = parseVisualEvaluationInput(input);
    const rawResult: unknown = await this.provider.evaluate(validatedInput);
    const result = parseProviderResult(rawResult);

    try {
      return parseVisualEvaluationReport(result.output);
    } catch (error) {
      if (error instanceof VisualEvaluationValidationError) {
        throw invalidProviderResponse(
          "Visual Evaluation Provider 返回了无效评估报告。",
          result.providerRequestId,
        );
      }

      throw error;
    }
  }
}

function parseProviderResult(
  input: unknown,
): VisualEvaluationProviderResult {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !("output" in input) ||
    !("providerRequestId" in input)
  ) {
    throw invalidProviderResponse(
      "Visual Evaluation Provider 返回了无效响应。",
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
      "Visual Evaluation Provider 返回了无效响应。",
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
