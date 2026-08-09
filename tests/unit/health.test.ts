import { describe, expect, it } from "vitest";

import { getFoundationHealth } from "../../src/health/status";

describe("foundation health status", () => {
  it("separates web, database, and object-storage state", () => {
    expect(getFoundationHealth()).toEqual({
      status: "degraded",
      services: {
        web: { status: "ok" },
        database: {
          status: "not_checked",
          detail: "Database connectivity is deferred to T-01.",
        },
        objectStorage: {
          status: "not_checked",
          detail: "Object-storage connectivity is deferred to T-01.",
        },
      },
    });
  });
});
