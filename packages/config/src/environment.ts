import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum(["development", "test", "preview", "production"]);

const originSchema = z
  .string()
  .trim()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      context.addIssue({ code: "custom", message: "Expected an absolute URL origin" });
    }
  })
  .transform((value) => new URL(value).origin);

const trustedOriginsSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(",").map((origin) => origin.trim()))
  .pipe(z.array(originSchema).min(1).max(16))
  .refine((origins) => new Set(origins).size === origins.length, "Trusted origins must be unique")
  .readonly();

const passkeyRpIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(
    /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/u,
    "Passkey RP ID must be a canonical DNS name or localhost",
  );

const reservedProductionHostnameSuffixes = [".example", ".invalid", ".localhost", ".test"] as const;

function isReservedProductionHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return (
    normalized === "localhost" ||
    reservedProductionHostnameSuffixes.some(
      (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix),
    )
  );
}

function isWithinRpId(hostname: string, rpId: string): boolean {
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

export const signalWorksKeyEncryptionSecretSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{43}$/u,
    "SignalWorks key encryption secret must be 32 bytes of unpadded base64url",
  );

export const agentKeyEncryptionSecretSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u,
    "Agent key encryption secret must be 32 bytes of unpadded base64url",
  );

export const modelProviderNameSchema = z.enum(["google", "openai"]);

export const modelNameSchema = z
  .string()
  .trim()
  .min(1, "Model name is required")
  .max(128, "Model name cannot exceed 128 characters")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)?$/u,
    "Model name must be a safe model ID with at most one provider namespace",
  );

export const modelProviderApiKeySchema = z
  .string()
  .min(20, "Model-provider API key must contain at least 20 characters")
  .max(512, "Model-provider API key cannot exceed 512 characters")
  .regex(/^[\x21-\x7e]+$/u, "Model-provider API key must be printable ASCII without spaces");

export const signalWorksMachineAuthTokenSchema = z
  .string()
  .min(32, "SignalWorks machine token must contain at least 32 characters")
  .max(512, "SignalWorks machine token cannot exceed 512 characters")
  .regex(/^[\x21-\x7e]+$/u, "SignalWorks machine token must be printable ASCII without spaces");

export const razorpayTestKeyIdSchema = z
  .string()
  .regex(/^rzp_test_[A-Za-z0-9]{8,64}$/u, "Razorpay Key ID must be a Test Mode key");

export const razorpaySecretSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[\x21-\x7e]+$/u, "Razorpay secrets must be printable ASCII without spaces");

const booleanFlagSchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const workerEnvironmentSchema = z
  .object({
    ENVIRONMENT: runtimeEnvironmentSchema,
  })
  .strict();

export const gatewayAuthEnvironmentSchema = z
  .object({
    BETTER_AUTH_SECRET: z.string().min(32).max(1024),
    BETTER_AUTH_URL: originSchema,
    ENVIRONMENT: runtimeEnvironmentSchema,
    PASSKEY_RP_ID: passkeyRpIdSchema,
    TRUSTED_ORIGINS: trustedOriginsSchema,
  })
  .strict()
  .superRefine((environment, context) => {
    const isPublicEnvironment =
      environment.ENVIRONMENT === "preview" || environment.ENVIRONMENT === "production";
    if (isPublicEnvironment && !environment.BETTER_AUTH_URL.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        message: "Preview and production authentication require an HTTPS base URL",
        path: ["BETTER_AUTH_URL"],
      });
    }

    if (
      isPublicEnvironment &&
      environment.TRUSTED_ORIGINS.some((origin) => !origin.startsWith("https://"))
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview and production trusted origins must use HTTPS",
        path: ["TRUSTED_ORIGINS"],
      });
    }

    if (isPublicEnvironment) {
      const authHostname = new URL(environment.BETTER_AUTH_URL).hostname.toLowerCase();
      if (
        isReservedProductionHostname(authHostname) ||
        isReservedProductionHostname(environment.PASSKEY_RP_ID)
      ) {
        context.addIssue({
          code: "custom",
          message: "Preview and production authentication require public DNS names",
          path: ["BETTER_AUTH_URL"],
        });
      }
      if (!isWithinRpId(authHostname, environment.PASSKEY_RP_ID)) {
        context.addIssue({
          code: "custom",
          message: "The authentication URL must be within the passkey RP ID",
          path: ["BETTER_AUTH_URL"],
        });
      }
    }

    for (const [index, origin] of environment.TRUSTED_ORIGINS.entries()) {
      const hostname = new URL(origin).hostname.toLowerCase();
      if (isPublicEnvironment && isReservedProductionHostname(hostname)) {
        context.addIssue({
          code: "custom",
          message: "Preview and production trusted origins require public DNS names",
          path: ["TRUSTED_ORIGINS", index],
        });
      }
      if (!isWithinRpId(hostname, environment.PASSKEY_RP_ID)) {
        context.addIssue({
          code: "custom",
          message: "Every trusted origin must be within the passkey RP ID",
          path: ["TRUSTED_ORIGINS", index],
        });
      }
    }
  })
  .readonly();

export const signalWorksEnvironmentSchema = z
  .object({
    ENVIRONMENT: runtimeEnvironmentSchema,
    SIGNALWORKS_KEY_ENCRYPTION_KEY: signalWorksKeyEncryptionSecretSchema,
    SIGNALWORKS_MACHINE_AUTH_TOKEN: signalWorksMachineAuthTokenSchema,
  })
  .strict()
  .readonly();

export const signalWorksPaymentEnvironmentSchema = z
  .object({
    ENVIRONMENT: runtimeEnvironmentSchema,
    RAZORPAY_KEY_ID: razorpayTestKeyIdSchema,
    RAZORPAY_KEY_SECRET: razorpaySecretSchema,
    RAZORPAY_MCP_READONLY_ENABLED: booleanFlagSchema.default(false),
    RAZORPAY_REFUNDS_ENABLED: booleanFlagSchema.default(false),
    RAZORPAY_WEBHOOK_OLD_SECRET: razorpaySecretSchema.optional(),
    RAZORPAY_WEBHOOK_SECRET: razorpaySecretSchema,
    SIGNALWORKS_KEY_ENCRYPTION_KEY: signalWorksKeyEncryptionSecretSchema,
    SIGNALWORKS_MACHINE_AUTH_TOKEN: signalWorksMachineAuthTokenSchema,
  })
  .strict()
  .readonly();

export const modelProviderEnvironmentSchema = z
  .discriminatedUnion("AGENT_MODEL_PROVIDER", [
    z
      .object({
        AGENT_MODEL_NAME: modelNameSchema,
        AGENT_MODEL_PROVIDER: z.literal("google"),
        GOOGLE_GENERATIVE_AI_API_KEY: modelProviderApiKeySchema,
      })
      .strict(),
    z
      .object({
        AGENT_MODEL_NAME: modelNameSchema,
        AGENT_MODEL_PROVIDER: z.literal("openai"),
        OPENAI_API_KEY: modelProviderApiKeySchema,
      })
      .strict(),
  ])
  .readonly();

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type GatewayAuthEnvironment = z.infer<typeof gatewayAuthEnvironmentSchema>;
export type ModelProviderEnvironment = z.infer<typeof modelProviderEnvironmentSchema>;
export type ModelProviderName = z.infer<typeof modelProviderNameSchema>;
export type SignalWorksEnvironment = z.infer<typeof signalWorksEnvironmentSchema>;
export type SignalWorksPaymentEnvironment = z.infer<typeof signalWorksPaymentEnvironmentSchema>;

export function parseWorkerEnvironment(input: unknown): WorkerEnvironment {
  return workerEnvironmentSchema.parse(input);
}

export function parseGatewayAuthEnvironment(input: unknown): GatewayAuthEnvironment {
  return gatewayAuthEnvironmentSchema.parse(input);
}

export function parseSignalWorksEnvironment(input: unknown): SignalWorksEnvironment {
  return signalWorksEnvironmentSchema.parse(input);
}

export function parseSignalWorksPaymentEnvironment(input: unknown): SignalWorksPaymentEnvironment {
  return signalWorksPaymentEnvironmentSchema.parse(input);
}

export function parseModelProviderEnvironment(input: unknown): ModelProviderEnvironment {
  return modelProviderEnvironmentSchema.parse(input);
}
