import type {
  ImageGenerationProvider,
  ImageGenerationStatus,
  NormalizedGenerationUsage,
} from "@/src/providers/image-generation-provider";
import { ProviderAdapterError } from "@/src/providers/provider-error";

export class PlaceholderImageGenerationProvider
  implements ImageGenerationProvider
{
  readonly name = "external-placeholder";

  async generateBackground(): Promise<{ providerRequestId: string }> {
    throw unavailable();
  }

  async getJobStatus(): Promise<ImageGenerationStatus> {
    throw unavailable();
  }

  normalizeUsage(): NormalizedGenerationUsage {
    throw unavailable();
  }
}

function unavailable() {
  return new ProviderAdapterError(
    "PROVIDER_AUTH_FAILED",
    false,
    "真实图片生成 Provider 尚未配置。",
  );
}
