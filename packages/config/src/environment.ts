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
  })
  .readonly();

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type GatewayAuthEnvironment = z.infer<typeof gatewayAuthEnvironmentSchema>;

export function parseWorkerEnvironment(input: unknown): WorkerEnvironment {
  return workerEnvironmentSchema.parse(input);
}

export function parseGatewayAuthEnvironment(input: unknown): GatewayAuthEnvironment {
  return gatewayAuthEnvironmentSchema.parse(input);
}
