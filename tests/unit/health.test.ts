import { describe, expect, it } from "vitest";

import { getHealthStatus } from "../../src/health/status";

describe("health status", () => {
  it("reports healthy only after both dependencies respond", async () => {
    await expect(
      getHealthStatus({
        database: async () => undefined,
        objectStorage: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "ok",
      services: {
        web: { status: "ok" },
        database: { status: "ok" },
        objectStorage: { status: "ok" },
      },
    });
  });

  it("reports a dependency failure without exposing its error", async () => {
    await expect(
      getHealthStatus({
        database: async () => {
          throw new Error("secret database detail");
        },
        objectStorage: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "degraded",
      services: {
        web: { status: "ok" },
        database: { status: "unavailable" },
        objectStorage: { status: "ok" },
      },
    });
  });
});
