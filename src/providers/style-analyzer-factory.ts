import {
  MOCK_STYLE_ANALYSIS_SCENARIOS,
  MockStyleAnalyzerProvider,
  type MockStyleAnalysisScenario,
} from "@/src/providers/mock-style-analyzer-provider";
import { PlaceholderStyleAnalyzerProvider } from "@/src/providers/placeholder-style-analyzer-provider";
import type { StyleAnalyzerProvider } from "@/src/providers/style-analyzer-provider";

type Environment = Record<string, string | undefined>;

export function createStyleAnalyzerProvider(
  environment: Environment = process.env,
): StyleAnalyzerProvider {
  const providerName =
    environment.STYLE_ANALYZER_PROVIDER?.trim() || "mock";

  if (providerName === "external-placeholder") {
    return new PlaceholderStyleAnalyzerProvider();
  }

  if (providerName !== "mock") {
    throw new Error(`Unsupported STYLE_ANALYZER_PROVIDER: ${providerName}`);
  }

  return new MockStyleAnalyzerProvider(
    parseMockScenario(environment.STYLE_ANALYZER_MOCK_SCENARIO),
  );
}

function parseMockScenario(value: string | undefined): MockStyleAnalysisScenario {
  const scenario = value?.trim() || "success";

  if (
    !MOCK_STYLE_ANALYSIS_SCENARIOS.includes(
      scenario as MockStyleAnalysisScenario,
    )
  ) {
    throw new Error(
      `Unsupported STYLE_ANALYZER_MOCK_SCENARIO: ${scenario}`,
    );
  }

  return scenario as MockStyleAnalysisScenario;
}
