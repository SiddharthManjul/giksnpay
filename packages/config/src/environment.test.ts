import { describe, expect, it } from "vitest";
import {
  parseGatewayAuthEnvironment,
  parseSignalWorksEnvironment,
  parseWorkerEnvironment,
} from "./environment";

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
        PASSKEY_RP_ID: "MINDPAY.TEST",
        TRUSTED_ORIGINS: "https://mindpay.test/, https://admin.mindpay.test",
      }),
    ).toEqual({
      BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
      BETTER_AUTH_URL: "https://api.mindpay.test",
      ENVIRONMENT: "production",
      PASSKEY_RP_ID: "mindpay.test",
      TRUSTED_ORIGINS: ["https://mindpay.test", "https://admin.mindpay.test"],
    });
  });

  it("rejects weak secrets, URL paths, duplicate origins, and production HTTP", () => {
    const valid = {
      BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
      BETTER_AUTH_URL: "https://api.mindpay.test",
      ENVIRONMENT: "production",
      PASSKEY_RP_ID: "mindpay.test",
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
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, PASSKEY_RP_ID: "https://mindpay.test" }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        PASSKEY_RP_ID: "other.test",
        TRUSTED_ORIGINS: "https://mindpay.test",
      }),
    ).toThrow(/within the passkey RP ID/);
  });
});

describe("SignalWorks environment", () => {
  it("requires a canonical 32-byte key-encryption secret", () => {
    const validSecret = "A".repeat(43);
    expect(
      parseSignalWorksEnvironment({
        ENVIRONMENT: "development",
        SIGNALWORKS_KEY_ENCRYPTION_KEY: validSecret,
        SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
      }),
    ).toEqual({
      ENVIRONMENT: "development",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: validSecret,
      SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
    });

    for (const invalidSecret of ["short", `${validSecret}=`, "!".repeat(43)]) {
      expect(() =>
        parseSignalWorksEnvironment({
          ENVIRONMENT: "development",
          SIGNALWORKS_KEY_ENCRYPTION_KEY: invalidSecret,
          SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
        }),
      ).toThrow();
    }
  });
});
