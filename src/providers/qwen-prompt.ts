import { ProviderAdapterError } from "@/src/providers/provider-error";

// Qwen Image 2.0 documents a 1300-token prompt limit. This byte budget is a
// conservative local guard that does not require a tokenizer dependency.
export const QWEN_PROMPT_SAFE_UTF8_BYTES = 1_200;
export const QWEN_NEGATIVE_PROMPT_MAX_CHARACTERS = 500;

export function compileQwenPrompt(
  requiredSections: readonly string[],
  optionalSections: readonly string[],
): string {
  const required = requiredSections.filter(Boolean).join("\n");
  if (Buffer.byteLength(required, "utf8") > QWEN_PROMPT_SAFE_UTF8_BYTES) {
    throw promptError("Qwen Prompt 必需安全约束超过本地预算。");
  }

  const accepted = [required];
  for (const section of optionalSections.filter(Boolean)) {
    const candidate = [...accepted, section].join("\n");
    if (Buffer.byteLength(candidate, "utf8") <= QWEN_PROMPT_SAFE_UTF8_BYTES) {
      accepted.push(section);
    }
  }
  return accepted.join("\n");
}

export function assertQwenPromptBudget(prompt: string): void {
  if (Buffer.byteLength(prompt, "utf8") > QWEN_PROMPT_SAFE_UTF8_BYTES) {
    throw promptError("Qwen Prompt 超过本地预算。");
  }
}

export function compileQwenNegativePrompt(
  requiredTerms: readonly string[],
  optionalTerms: readonly string[],
): string {
  const required = requiredTerms.filter(Boolean).join("，");
  if (required.length > QWEN_NEGATIVE_PROMPT_MAX_CHARACTERS) {
    throw promptError("Qwen Negative Prompt 必需安全约束超过 500 字符。");
  }

  const accepted = [...requiredTerms.filter(Boolean)];
  for (const term of optionalTerms.filter(Boolean)) {
    const candidate = [...accepted, term].join("，");
    if (candidate.length <= QWEN_NEGATIVE_PROMPT_MAX_CHARACTERS) {
      accepted.push(term);
    }
  }
  return accepted.join("，");
}

function promptError(message: string): ProviderAdapterError {
  return new ProviderAdapterError(
    "PROVIDER_INVALID_RESPONSE",
    false,
    message,
    null,
    "NOT_SENT",
  );
}
