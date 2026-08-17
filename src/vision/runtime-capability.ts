export const VISUAL_PIPELINE_CAPABILITY = {
  status: "CONTRACTS_AND_SCAFFOLDING_ONLY",
  runtimeAvailable: false,
  components: [
    "Product Understanding contracts",
    "Visual DNA contracts and validator",
    "Visual Strategy contracts",
    "Evaluation injection interface",
  ],
  limitation:
    "No end-to-end production runtime is implemented for these components in this release.",
} as const;

export const BENCHMARK_RUNTIME_CAPABILITIES = [
  "AVAILABLE",
  "UNAVAILABLE",
] as const;

export type BenchmarkRuntimeCapability =
  (typeof BENCHMARK_RUNTIME_CAPABILITIES)[number];

type Environment = Record<string, string | undefined>;

const DEFAULT_QWEN_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

export function resolveBenchmarkRuntimeCapability(
  environment: Environment,
): BenchmarkRuntimeCapability {
  if (environment.IMAGE_GENERATION_PROVIDER?.trim() !== "qwen") {
    return "UNAVAILABLE";
  }
  if (!environment.QWEN_API_KEY?.trim()) return "UNAVAILABLE";
  if (!isValidQwenTimeout(environment.QWEN_TIMEOUT_MS)) return "UNAVAILABLE";
  if (!isValidQwenEndpoint(environment.QWEN_ENDPOINT)) return "UNAVAILABLE";
  return "AVAILABLE";
}

function isValidQwenTimeout(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  if (!/^\d+$/.test(value.trim())) return false;
  const timeout = Number(value);
  return timeout >= 1_000 && timeout <= 600_000;
}

function isValidQwenEndpoint(value: string | undefined): boolean {
  let endpoint: URL;
  try {
    endpoint = new URL(value?.trim() || DEFAULT_QWEN_ENDPOINT);
  } catch {
    return false;
  }
  const host = endpoint.hostname.toLowerCase();
  const allowedHost =
    host === "dashscope.aliyuncs.com" ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(
      host,
    );
  return (
    endpoint.protocol === "https:" &&
    allowedHost &&
    endpoint.pathname ===
      "/api/v1/services/aigc/multimodal-generation/generation" &&
    !endpoint.port &&
    !endpoint.username &&
    !endpoint.password &&
    !endpoint.search &&
    !endpoint.hash
  );
}
