export type ProductInfo = {
  productName: string;
  category: string;
  sellingPoints: string[];
  targetAudience: string | null;
  forbiddenClaims: string[];
};

export type ProviderImageInput = {
  assetId: string;
  mimeType: string;
  width: number;
  height: number;
  body: Uint8Array;
};

export type StyleAnalysisResult = {
  output: unknown;
  providerRequestId: string | null;
};

export { ProviderAdapterError as StyleAnalyzerProviderError } from "@/src/providers/provider-error";
export type { ProviderErrorCode as StyleAnalyzerProviderErrorCode } from "@/src/providers/provider-error";

export interface StyleAnalyzerProvider {
  readonly name: string;

  analyze(input: {
    projectId: string;
    productInfo: ProductInfo;
    referenceImages: ProviderImageInput[];
  }): Promise<StyleAnalysisResult>;
}
