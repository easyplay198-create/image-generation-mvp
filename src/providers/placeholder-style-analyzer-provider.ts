import type {
  StyleAnalysisResult,
  StyleAnalyzerProvider,
} from "@/src/providers/style-analyzer-provider";
import { StyleAnalyzerProviderError } from "@/src/providers/style-analyzer-provider";

export class PlaceholderStyleAnalyzerProvider
  implements StyleAnalyzerProvider
{
  readonly name = "external-placeholder";

  async analyze(): Promise<StyleAnalysisResult> {
    throw new StyleAnalyzerProviderError(
      "PROVIDER_AUTH_FAILED",
      false,
      "真实风格分析 Provider 尚未配置。",
    );
  }
}
