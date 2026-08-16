import type { VisualStrategyInput } from "@/src/vision/contracts/visual-strategy";

export {
  ProviderAdapterError as VisualStrategyProviderError,
  type ProviderErrorCode as VisualStrategyProviderErrorCode,
} from "@/src/providers/provider-error";

export type VisualStrategyProviderResult = {
  output: unknown;
  providerRequestId: string | null;
};

/**
 * Model-neutral boundary for strategy generation.
 *
 * Implementations may use an LLM, a rules engine, or a hybrid pipeline. The
 * caller depends only on the stable Visual Strategy V1 contracts.
 */
export interface VisualStrategyProvider {
  readonly name: string;

  createStrategy(
    input: VisualStrategyInput,
  ): Promise<VisualStrategyProviderResult>;
}
