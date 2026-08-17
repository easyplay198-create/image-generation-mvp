import type { ProductUnderstandingInput } from "@/src/domain/product-understanding";

export {
  ProviderAdapterError as VisionModelProviderError,
  type ProviderErrorCode as VisionModelProviderErrorCode,
} from "@/src/providers/provider-error";

export type VisionModelProductUnderstandingResult = {
  output: unknown;
  providerRequestId: string | null;
};

/**
 * Model-neutral boundary for visual product analysis.
 *
 * Concrete adapters such as Qwen-VL can translate this contract into their
 * provider-specific request and return the untrusted model output here.
 */
export interface VisionModelProvider {
  readonly name: string;

  understandProduct(
    input: ProductUnderstandingInput,
  ): Promise<VisionModelProductUnderstandingResult>;
}
