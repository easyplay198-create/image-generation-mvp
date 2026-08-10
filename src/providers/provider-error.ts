export type ProviderErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_POLICY_REJECTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_INVALID_RESPONSE";

export class ProviderAdapterError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    message: string,
    readonly providerRequestId: string | null = null,
  ) {
    super(message);
    this.name = "ProviderAdapterError";
  }
}
