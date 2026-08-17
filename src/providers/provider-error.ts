export type ProviderErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_POLICY_REJECTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_INVALID_RESPONSE";

export type ProviderSubmissionDisposition =
  | "NOT_SENT"
  | "REJECTED"
  | "MAY_HAVE_BEEN_ACCEPTED";

export class ProviderAdapterError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    message: string,
    readonly providerRequestId: string | null = null,
    readonly submissionDisposition: ProviderSubmissionDisposition =
      providerRequestId ? "MAY_HAVE_BEEN_ACCEPTED" : "NOT_SENT",
  ) {
    super(message);
    this.name = "ProviderAdapterError";
  }
}
