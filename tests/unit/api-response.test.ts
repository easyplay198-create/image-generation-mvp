import { describe, expect, it, vi } from "vitest";

import { ApiError, errorResponse } from "../../src/http/api";

describe("API error responses", () => {
  it("returns the stable code and requestId for a known error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(
      new ApiError("PROJECT_NOT_FOUND", 404, "项目不存在。"),
      { requestId: "request-1", operation: "project.read" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "项目不存在。",
        requestId: "request-1",
        details: {},
      },
    });
  });

  it("does not expose unknown exception details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new Error("database password leaked"), {
      requestId: "request-2",
      operation: "project.create",
    });
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("database password leaked");
  });
});
