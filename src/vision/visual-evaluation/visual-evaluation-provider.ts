import type { VisualEvaluationInput } from "@/src/vision/contracts/visual-evaluation";

export {
  ProviderAdapterError as VisualEvaluationProviderError,
  type ProviderErrorCode as VisualEvaluationProviderErrorCode,
} from "@/src/providers/provider-error";

export type VisualEvaluationProviderResult = {
  output: unknown;
  providerRequestId: string | null;
};

/**
 * Evaluator-neutral boundary for generated-image assessment.
 *
 * Implementations may use a vision model, CLIP similarity, rules, human
 * feedback, or a hybrid pipeline while returning one stable V1 report.
 */
export interface VisualEvaluationProvider {
  readonly name: string;

  evaluate(
    input: VisualEvaluationInput,
  ): Promise<VisualEvaluationProviderResult>;
}
