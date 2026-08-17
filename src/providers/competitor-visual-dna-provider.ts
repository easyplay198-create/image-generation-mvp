import type { CompetitorVisualDnaInput } from "@/src/domain/competitor-visual-dna";

export {
  ProviderAdapterError as CompetitorVisualDnaProviderError,
  type ProviderErrorCode as CompetitorVisualDnaProviderErrorCode,
} from "@/src/providers/provider-error";

export type CompetitorVisualDnaProviderResult = {
  output: unknown;
  providerRequestId: string | null;
};

/**
 * Model-neutral boundary for competitor visual analysis.
 *
 * Adapters may use CLIP, OpenCLIP, another embedding model, a multimodal
 * model, or a hybrid pipeline. Embedding dimensions and clustering strategy
 * stay inside the adapter so callers depend only on the stable V1 contract.
 */
export interface CompetitorVisualDnaProvider {
  readonly name: string;

  analyzeVisualDna(
    input: CompetitorVisualDnaInput,
  ): Promise<CompetitorVisualDnaProviderResult>;
}
