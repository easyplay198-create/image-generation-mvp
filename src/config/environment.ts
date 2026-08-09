export const REQUIRED_SERVER_ENVIRONMENT_VARIABLES = [
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "MVP_DEMO_USER_ID",
] as const;

type Environment = Record<string, string | undefined>;

export function getMissingEnvironmentVariables(
  environment: Environment = process.env,
) {
  return REQUIRED_SERVER_ENVIRONMENT_VARIABLES.filter(
    (name) => !environment[name]?.trim(),
  );
}

export function assertServerEnvironment(
  environment: Environment = process.env,
): void {
  const missing = getMissingEnvironmentVariables(environment);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
