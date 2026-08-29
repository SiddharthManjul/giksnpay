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

export const signalWorksKeyEncryptionSecretSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{43}$/u,
    "SignalWorks key encryption secret must be 32 bytes of unpadded base64url",
  );

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
    if (
      (environment.ENVIRONMENT === "preview" || environment.ENVIRONMENT === "production") &&
      !environment.BETTER_AUTH_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview and production authentication require an HTTPS base URL",
        path: ["BETTER_AUTH_URL"],
      });
    }

    if (
      (environment.ENVIRONMENT === "preview" || environment.ENVIRONMENT === "production") &&
      environment.TRUSTED_ORIGINS.some((origin) => !origin.startsWith("https://"))
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview and production trusted origins must use HTTPS",
        path: ["TRUSTED_ORIGINS"],
      });
    }

    for (const [index, origin] of environment.TRUSTED_ORIGINS.entries()) {
      const hostname = new URL(origin).hostname.toLowerCase();
      if (
        hostname !== environment.PASSKEY_RP_ID &&
        !hostname.endsWith(`.${environment.PASSKEY_RP_ID}`)
      ) {
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
  })
  .strict()
  .readonly();

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type GatewayAuthEnvironment = z.infer<typeof gatewayAuthEnvironmentSchema>;
export type SignalWorksEnvironment = z.infer<typeof signalWorksEnvironmentSchema>;

export function parseWorkerEnvironment(input: unknown): WorkerEnvironment {
  return workerEnvironmentSchema.parse(input);
}

export function parseGatewayAuthEnvironment(input: unknown): GatewayAuthEnvironment {
  return gatewayAuthEnvironmentSchema.parse(input);
}

export function parseSignalWorksEnvironment(input: unknown): SignalWorksEnvironment {
  return signalWorksEnvironmentSchema.parse(input);
}
