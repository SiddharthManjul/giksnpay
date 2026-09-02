import { describe, expect, it } from "vitest";
import {
  agentKeyEncryptionSecretSchema,
  parseGatewayAuthEnvironment,
  parseModelProviderEnvironment,
  parseSignalWorksEnvironment,
  parseSignalWorksPaymentEnvironment,
  parseWorkerEnvironment,
} from "./environment";

describe("agent key environment", () => {
  it("requires an unpadded canonical 32-byte encryption secret", () => {
    expect(agentKeyEncryptionSecretSchema.parse("A".repeat(43))).toBe("A".repeat(43));
    for (const invalid of ["short", `${"A".repeat(43)}=`, "!".repeat(43), "B".repeat(43)]) {
      expect(() => agentKeyEncryptionSecretSchema.parse(invalid)).toThrow();
    }
  });
});

describe("model-provider environment", () => {
  const valid = {
    AGENT_MODEL_NAME: "gemini-3.8-flash",
    AGENT_MODEL_PROVIDER: "google",
    GOOGLE_GENERATIVE_AI_API_KEY: "mindpay_test_google_key_00000001",
  } as const;

  it("accepts an explicit supported provider, model, and secret", () => {
    expect(parseModelProviderEnvironment(valid)).toEqual(valid);
  });

  it("rejects unsupported providers, unsafe model names, weak keys, and unknown bindings", () => {
    expect(() =>
      parseModelProviderEnvironment({ ...valid, AGENT_MODEL_PROVIDER: "unsupported" }),
    ).toThrow();
    expect(() =>
      parseModelProviderEnvironment({ ...valid, AGENT_MODEL_NAME: "gpt-5 mini" }),
    ).toThrow();
    expect(() =>
      parseModelProviderEnvironment({ ...valid, GOOGLE_GENERATIVE_AI_API_KEY: "weak" }),
    ).toThrow();
    expect(() =>
      parseModelProviderEnvironment({ ...valid, GOOGLE_BASE_URL: "https://evil.test" }),
    ).toThrow();
  });

  it("keeps OpenAI as an explicit provider alternative", () => {
    const openAI = {
      AGENT_MODEL_NAME: "gpt-5-mini",
      AGENT_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "mindpay_test_openai_key_00000001",
    } as const;

    expect(parseModelProviderEnvironment(openAI)).toEqual(openAI);
    expect(() =>
      parseModelProviderEnvironment({
        ...openAI,
        GOOGLE_GENERATIVE_AI_API_KEY: valid.GOOGLE_GENERATIVE_AI_API_KEY,
      }),
    ).toThrow();
  });
});

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
        BETTER_AUTH_URL: "https://api.mindpay.finance/",
        ENVIRONMENT: "production",
        PASSKEY_RP_ID: "MINDPAY.FINANCE",
        TRUSTED_ORIGINS: "https://mindpay.finance/, https://admin.mindpay.finance",
      }),
    ).toEqual({
      BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
      BETTER_AUTH_URL: "https://api.mindpay.finance",
      ENVIRONMENT: "production",
      PASSKEY_RP_ID: "mindpay.finance",
      TRUSTED_ORIGINS: ["https://mindpay.finance", "https://admin.mindpay.finance"],
    });
  });

  it("rejects weak secrets, URL paths, duplicate origins, and production HTTP", () => {
    const valid = {
      BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
      BETTER_AUTH_URL: "https://api.mindpay.finance",
      ENVIRONMENT: "production",
      PASSKEY_RP_ID: "mindpay.finance",
      TRUSTED_ORIGINS: "https://mindpay.finance",
    };

    expect(() => parseGatewayAuthEnvironment({ ...valid, BETTER_AUTH_SECRET: "weak" })).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        BETTER_AUTH_URL: "https://api.mindpay.finance/auth",
      }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        TRUSTED_ORIGINS: "https://mindpay.finance,https://mindpay.finance/",
      }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, BETTER_AUTH_URL: "http://api.mindpay.finance" }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, TRUSTED_ORIGINS: "http://mindpay.finance" }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({ ...valid, PASSKEY_RP_ID: "https://mindpay.finance" }),
    ).toThrow();
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        PASSKEY_RP_ID: "other.test",
        TRUSTED_ORIGINS: "https://mindpay.finance",
      }),
    ).toThrow(/within the passkey RP ID/);
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        BETTER_AUTH_URL: "https://api.mindpay.invalid",
        PASSKEY_RP_ID: "mindpay.invalid",
        TRUSTED_ORIGINS: "https://app.mindpay.invalid",
      }),
    ).toThrow(/public DNS names/);
    expect(() =>
      parseGatewayAuthEnvironment({
        ...valid,
        BETTER_AUTH_URL: "https://api.other.finance",
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

  it("requires merchant-owned Razorpay Test Mode secrets and explicit feature flags", () => {
    const paymentEnvironment = {
      ENVIRONMENT: "test",
      RAZORPAY_KEY_ID: "rzp_test_MindPay01",
      RAZORPAY_KEY_SECRET: "test_secret_1234567890",
      RAZORPAY_MCP_READONLY_ENABLED: "false",
      RAZORPAY_REFUNDS_ENABLED: "true",
      RAZORPAY_WEBHOOK_SECRET: "webhook_secret_1234567890",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: "A".repeat(43),
      SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
    } as const;
    expect(parseSignalWorksPaymentEnvironment(paymentEnvironment)).toMatchObject({
      RAZORPAY_KEY_ID: "rzp_test_MindPay01",
      RAZORPAY_MCP_READONLY_ENABLED: false,
      RAZORPAY_REFUNDS_ENABLED: true,
    });
    expect(() =>
      parseSignalWorksPaymentEnvironment({
        ...paymentEnvironment,
        RAZORPAY_KEY_ID: "rzp_live_forbidden",
      }),
    ).toThrow(/Test Mode/u);
  });
});
