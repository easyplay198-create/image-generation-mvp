import type { StyleSpecV1 } from "@/src/domain/style-spec";
import type { ProductInfo } from "@/src/providers/style-analyzer-provider";

export type GeneratedImagePayload = {
  body: Uint8Array;
  mimeType: string;
};

export type ImageGenerationSubmission = {
  providerRequestId: string;
};

export type ImageGenerationStatus =
  | { status: "PENDING" }
  | {
      status: "SUCCEEDED";
      image: GeneratedImagePayload;
      rawUsage: unknown;
    };

export type NormalizedGenerationUsage = {
  generatedImages: number;
  inputUnits: number | null;
  outputPixels: number;
  costMetadata: {
    amount: string;
    currency: string;
    estimated: boolean;
  };
};

export interface ImageGenerationProvider {
  readonly name: string;

  generateBackground(input: {
    projectId: string;
    styleSpec: StyleSpecV1;
    productContext: ProductInfo;
    canvas: { width: number; height: number };
    idempotencyKey: string;
  }): Promise<ImageGenerationSubmission>;

  getJobStatus(input: {
    providerRequestId: string;
  }): Promise<ImageGenerationStatus>;

  normalizeUsage(rawUsage: unknown): NormalizedGenerationUsage;
}
