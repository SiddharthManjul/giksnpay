import { describe, expect, it } from "vitest";
import { parseWorkerEnvironment } from "./environment";

describe("worker environment", () => {
  it("accepts a named runtime environment", () => {
    expect(parseWorkerEnvironment({ ENVIRONMENT: "test" })).toEqual({ ENVIRONMENT: "test" });
  });

  it("rejects unknown bindings", () => {
    expect(() =>
      parseWorkerEnvironment({ ENVIRONMENT: "development", RAZORPAY_KEY_SECRET: "do-not-pass" }),
    ).toThrow();
  });
});
