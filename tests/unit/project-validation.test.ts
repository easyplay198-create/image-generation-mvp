import { describe, expect, it } from "vitest";

import {
  parseProjectCreate,
  parseProjectUpdate,
} from "../../src/domain/project";
import { ApiError } from "../../src/http/api";

const validProject = {
  name: " 夏季主图项目 ",
  productName: " 便携咖啡杯 ",
  category: " 杯具 ",
  sellingPoints: [" 轻量 ", " 保温 6 小时 "],
  targetAudience: " 通勤人群 ",
  forbiddenClaims: [" 永久保温 "],
};

describe("project input validation", () => {
  it("normalizes a valid project payload", () => {
    expect(parseProjectCreate(validProject)).toEqual({
      name: "夏季主图项目",
      productName: "便携咖啡杯",
      category: "杯具",
      sellingPoints: ["轻量", "保温 6 小时"],
      targetAudience: "通勤人群",
      forbiddenClaims: ["永久保温"],
    });
  });

  it("rejects an empty selling point", () => {
    expect(() =>
      parseProjectCreate({
        ...validProject,
        sellingPoints: [""],
      }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("rejects more than five selling points", () => {
    expect(() =>
      parseProjectCreate({
        ...validProject,
        sellingPoints: ["1", "2", "3", "4", "5", "6"],
      }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("rejects an empty update", () => {
    expect(() => parseProjectUpdate({})).toThrowError(ApiError);
  });
});
