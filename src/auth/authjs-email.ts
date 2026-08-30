import Nodemailer from "next-auth/providers/nodemailer";

import {
  normalizeP2AuthEmail,
  P2_AUTH_VERIFICATION_MAX_AGE_SECONDS,
} from "@/src/auth/authjs-adapter";

export type P2AuthVerificationMessage = Readonly<{
  recipient: string;
  verificationUrl: string;
}>;

export interface P2AuthVerificationSink {
  deliver(message: P2AuthVerificationMessage): Promise<void>;
}

export class P2AuthMailError extends Error {
  constructor(readonly code: "TEST_SINK_REQUIRED" | "TEST_MODE_REQUIRED" | "MESSAGE_INVALID") {
    super(code);
    this.name = "P2AuthMailError";
  }
}

export function createP2AuthEmailProvider(options: Readonly<{
  sink?: P2AuthVerificationSink;
  environment?: Readonly<Record<string, string | undefined>>;
}> = {}) {
  if (options.sink && options.environment?.NODE_ENV !== "test") {
    throw new P2AuthMailError("TEST_MODE_REQUIRED");
  }

  const sendVerificationRequest = async (input: Readonly<{
    identifier: string;
    url: string;
  }>): Promise<void> => {
    if (!options.sink) throw new P2AuthMailError("TEST_SINK_REQUIRED");
    const recipient = normalizeP2AuthEmail(input.identifier);
    const verificationUrl = parseVerificationUrl(input.url);
    await options.sink.deliver(Object.freeze({ recipient, verificationUrl }));
  };

  const provider = Nodemailer({
    server: { jsonTransport: true },
    from: "P2 S1E test only <no-reply@example.invalid>",
    maxAge: P2_AUTH_VERIFICATION_MAX_AGE_SECONDS,
    normalizeIdentifier: normalizeP2AuthEmail,
    sendVerificationRequest,
  });

  // Auth.js normally merges `options` into provider defaults during request
  // initialization. Returning the merged values here also keeps the isolated
  // configuration directly testable without importing the Next.js entrypoint.
  return Object.freeze({ ...provider, ...provider.options, options: provider.options });
}

function parseVerificationUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      !url.searchParams.has("token") ||
      !url.searchParams.has("email")
    ) {
      throw new Error("invalid");
    }
    return url.toString();
  } catch {
    throw new P2AuthMailError("MESSAGE_INVALID");
  }
}
