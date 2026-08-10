import type { ImageGenerationProvider } from "@/src/providers/image-generation-provider";
import {
  MOCK_IMAGE_GENERATION_SCENARIOS,
  MockImageGenerationProvider,
  type MockImageGenerationScenario,
} from "@/src/providers/mock-image-generation-provider";
import { PlaceholderImageGenerationProvider } from "@/src/providers/placeholder-image-generation-provider";

type Environment = Record<string, string | undefined>;

export function createImageGenerationProvider(
  environment: Environment = process.env,
): ImageGenerationProvider {
  const providerName =
    environment.IMAGE_GENERATION_PROVIDER?.trim() || "mock";

  if (providerName === "external-placeholder") {
    return new PlaceholderImageGenerationProvider();
  }

  if (providerName !== "mock") {
    throw new Error(`Unsupported IMAGE_GENERATION_PROVIDER: ${providerName}`);
  }

  return new MockImageGenerationProvider(
    parseMockScenario(environment.IMAGE_GENERATION_MOCK_SCENARIO),
  );
}

function parseMockScenario(
  value: string | undefined,
): MockImageGenerationScenario {
  const scenario = value?.trim() || "success";

  if (
    !MOCK_IMAGE_GENERATION_SCENARIOS.includes(
      scenario as MockImageGenerationScenario,
    )
  ) {
    throw new Error(
      `Unsupported IMAGE_GENERATION_MOCK_SCENARIO: ${scenario}`,
    );
  }

  return scenario as MockImageGenerationScenario;
}
