import { describe, expect, it } from "vitest";

import {
  assertServerEnvironment,
  getMissingEnvironmentVariables,
  REQUIRED_SERVER_ENVIRONMENT_VARIABLES,
} from "../../src/config/environment";

const validEnvironment = Object.fromEntries(
  REQUIRED_SERVER_ENVIRONMENT_VARIABLES.map((name) => [name, `${name}-value`]),
);

describe("server environment validation", () => {
  it("reports every missing required variable", () => {
    expect(getMissingEnvironmentVariables({})).toEqual(
      REQUIRED_SERVER_ENVIRONMENT_VARIABLES,
    );
  });

  it("accepts a complete environment", () => {
    expect(() => assertServerEnvironment(validEnvironment)).not.toThrow();
  });

  it("names missing variables without exposing configured values", () => {
    const environment = { ...validEnvironment, DATABASE_URL: "" };

    expect(() => assertServerEnvironment(environment)).toThrowError(
      "Missing required environment variables: DATABASE_URL",
    );
    expect(() => assertServerEnvironment(environment)).not.toThrowError(
      /S3_SECRET_ACCESS_KEY-value/,
    );
  });
});
