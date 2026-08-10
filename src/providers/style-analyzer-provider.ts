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

export type StyleAnalyzerProviderErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_POLICY_REJECTED"
  | "PROVIDER_TIMEOUT";

export class StyleAnalyzerProviderError extends Error {
  constructor(
    readonly code: StyleAnalyzerProviderErrorCode,
    readonly retryable: boolean,
    message: string,
    readonly providerRequestId: string | null = null,
  ) {
    super(message);
    this.name = "StyleAnalyzerProviderError";
  }
}

export interface StyleAnalyzerProvider {
  readonly name: string;

  analyze(input: {
    projectId: string;
    productInfo: ProductInfo;
    referenceImages: ProviderImageInput[];
  }): Promise<StyleAnalysisResult>;
}
