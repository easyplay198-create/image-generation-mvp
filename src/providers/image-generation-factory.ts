import type { ImageGenerationProvider } from "@/src/providers/image-generation-provider";
import {
  MOCK_IMAGE_GENERATION_SCENARIOS,
  MockImageGenerationProvider,
  type MockImageGenerationScenario,
} from "@/src/providers/mock-image-generation-provider";
import { PlaceholderImageGenerationProvider } from "@/src/providers/placeholder-image-generation-provider";
import {
  DEFAULT_QWEN_ENDPOINT,
  DEFAULT_QWEN_MODEL,
  DEFAULT_QWEN_TIMEOUT_MS,
  QwenImageGenerationProvider,
} from "@/src/providers/qwen-image-generation-provider";

type Environment = Record<string, string | undefined>;

export function createImageGenerationProvider(
  environment: Environment = process.env,
): ImageGenerationProvider {
  const providerName =
    environment.IMAGE_GENERATION_PROVIDER?.trim() || "mock";

  if (providerName === "external-placeholder") {
    return new PlaceholderImageGenerationProvider();
  }

  if (providerName === "qwen") {
    return new QwenImageGenerationProvider({
      apiKey: requireEnvironmentVariable(environment, "QWEN_API_KEY"),
      endpoint:
        environment.QWEN_ENDPOINT?.trim() || DEFAULT_QWEN_ENDPOINT,
      model: environment.QWEN_MODEL?.trim() || DEFAULT_QWEN_MODEL,
      timeoutMs: parseQwenTimeout(environment.QWEN_TIMEOUT_MS),
    });
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

function requireEnvironmentVariable(
  environment: Environment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseQwenTimeout(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_QWEN_TIMEOUT_MS;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("QWEN_TIMEOUT_MS must be an integer between 1000 and 600000.");
  }

  const timeoutMs = Number(value);
  if (timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("QWEN_TIMEOUT_MS must be an integer between 1000 and 600000.");
  }
  return timeoutMs;
}
