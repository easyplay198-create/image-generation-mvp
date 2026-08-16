import {
  CompetitorVisualDnaValidationError,
  parseCompetitorVisualDnaInput,
  parseVisualDna,
  type VisualDna,
} from "@/src/domain/competitor-visual-dna";
import type {
  CompetitorVisualDnaProvider,
  CompetitorVisualDnaProviderResult,
} from "@/src/providers/competitor-visual-dna-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";

const MAX_PROVIDER_REQUEST_ID_LENGTH = 200;

/**
 * Phase-one Competitor Visual DNA orchestration.
 *
 * The skill validates contracts only. Feature extraction, embeddings,
 * clustering, transport and model selection belong to the injected provider.
 */
export class CompetitorVisualDnaSkill {
  constructor(private readonly provider: CompetitorVisualDnaProvider) {}

  async execute(input: unknown): Promise<VisualDna> {
    const validatedInput = parseCompetitorVisualDnaInput(input);
    const rawResult: unknown = await this.provider.analyzeVisualDna(
      validatedInput,
    );
    const result = parseProviderResult(rawResult);

    try {
      return parseVisualDna(result.output);
    } catch (error) {
      if (error instanceof CompetitorVisualDnaValidationError) {
        throw invalidProviderResponse(
          "Competitor Visual DNA Provider 返回了无效 Visual DNA。",
          result.providerRequestId,
        );
      }

      throw error;
    }
  }
}

function parseProviderResult(
  input: unknown,
): CompetitorVisualDnaProviderResult {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !("output" in input) ||
    !("providerRequestId" in input)
  ) {
    throw invalidProviderResponse(
      "Competitor Visual DNA Provider 返回了无效响应。",
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
      "Competitor Visual DNA Provider 返回了无效响应。",
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
