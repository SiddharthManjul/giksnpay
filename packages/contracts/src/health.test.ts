import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("health response contract", () => {
  it("accepts a known healthy service", () => {
    expect(healthResponseSchema.parse({ service: "mindpay-gateway", status: "ok" })).toEqual({
      service: "mindpay-gateway",
      status: "ok",
    });
  });

  it("rejects invented service state", () => {
    expect(() => healthResponseSchema.parse({ service: "unknown", status: "degraded" })).toThrow();
  });
});
