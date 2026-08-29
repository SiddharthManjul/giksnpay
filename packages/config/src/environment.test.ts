import { describe, expect, it } from "vitest";
import { parseGatewayAuthEnvironment, parseWorkerEnvironment } from "./environment";

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

describe("gateway auth environment", () => {
  it("parses and normalizes explicit authentication origins", () => {
    expect(
      parseGatewayAuthEnvironment({
        BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
        BETTER_AUTH_URL: "https://api.mindpay.test/",
        ENVIRONMENT: "production",
        TRUSTED_ORIGINS: "https://mindpay.test/, https://admin.mindpay.test",
      }),
    ).toEqual({
      BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
      BETTER_AUTH_URL: "https://api.mindpay.test",
      ENVIRONMENT: "production",
      TRUSTED_ORIGINS: ["https://mindpay.test", "https://admin.mindpay.test"],
    });
  });

  it("rejects weak secrets, URL paths, duplicate origins, and production HTTP", () => {
    const valid = {
      BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
      BETTER_AUTH_URL: "https://api.mindpay.test",
      ENVIRONMENT: "production",
      TRUSTED_ORIGINS: "https://mindpay.test",
    };

    expect(() => parseGatewayAuthEnvironment({ ...valid, BETTER_AUTH_SECRET: "weak" })).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, BETTER_AUTH_URL: "https://api.mindpay.test/auth" }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        TRUSTED_ORIGINS: "https://mindpay.test,https://mindpay.test/",
      }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, BETTER_AUTH_URL: "http://api.mindpay.test" }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, TRUSTED_ORIGINS: "http://mindpay.test" }),
    ).toThrow();
  });
});
