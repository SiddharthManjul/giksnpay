import { ulidSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const PASSKEY_ID_PATTERN = /^pkc_([0-7][0-9A-HJKMNP-TV-Z]{25})$/u;
const PASSKEY_CHALLENGE_ID_PATTERN = /^pkr_([0-7][0-9A-HJKMNP-TV-Z]{25})$/u;

const prefixedUlidSchema = (pattern: RegExp, description: string) =>
  z
    .string()
    .regex(pattern, description)
    .refine((value) => ulidSchema.safeParse(value.slice(4)).success, description);

const base64UrlSchema = (maximumLength: number) =>
  z.string().min(1).max(maximumLength).regex(BASE64URL_PATTERN, "Expected unpadded base64url data");

export const passkeyCredentialIdSchema = prefixedUlidSchema(
  PASSKEY_ID_PATTERN,
  "Passkey ID must be pkc_ followed by a canonical ULID",
);

export const passkeyRegistrationChallengeIdSchema = prefixedUlidSchema(
  PASSKEY_CHALLENGE_ID_PATTERN,
  "Passkey registration challenge ID must be pkr_ followed by a canonical ULID",
);

export const authenticatorTransportSchema = z.enum([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

export const passkeyCredentialDeviceTypeSchema = z.enum(["singleDevice", "multiDevice"]);

export const passkeyCredentialSchema = z
  .object({
    backedUp: z.boolean(),
    createdAt: utcTimestampSchema,
    deviceType: passkeyCredentialDeviceTypeSchema,
    id: passkeyCredentialIdSchema,
    name: z.string().trim().min(1).max(64).nullable(),
    transports: z
      .array(authenticatorTransportSchema)
      .max(authenticatorTransportSchema.options.length)
      .refine((transports) => new Set(transports).size === transports.length)
      .readonly(),
  })
  .strict()
  .readonly();

export const passkeyCredentialsResponseSchema = z
  .object({
    passkeys: z
      .array(passkeyCredentialSchema)
      .max(32)
      .refine((passkeys) => new Set(passkeys.map((passkey) => passkey.id)).size === passkeys.length)
      .readonly(),
  })
  .strict()
  .readonly();

export const passkeyRegistrationResponseJsonSchema = z
  .object({
    authenticatorAttachment: z.enum(["cross-platform", "platform"]).nullable().optional(),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    id: base64UrlSchema(1_024),
    rawId: base64UrlSchema(1_024),
    response: z
      .object({
        attestationObject: base64UrlSchema(131_072),
        authenticatorData: base64UrlSchema(16_384).optional(),
        clientDataJSON: base64UrlSchema(16_384),
        publicKey: base64UrlSchema(8_192).optional(),
        publicKeyAlgorithm: z.number().int().min(-65_536).max(65_536).optional(),
        transports: z
          .array(authenticatorTransportSchema)
          .max(authenticatorTransportSchema.options.length)
          .refine((transports) => new Set(transports).size === transports.length)
          .optional(),
      })
      .strict()
      .readonly(),
    type: z.literal("public-key"),
  })
  .strict()
  .refine((response) => response.id === response.rawId, {
    message: "Passkey id and rawId must match",
    path: ["rawId"],
  })
  .readonly();

export const verifyPasskeyRegistrationRequestSchema = z
  .object({
    challengeId: passkeyRegistrationChallengeIdSchema,
    name: z.string().trim().min(1).max(64).optional(),
    response: passkeyRegistrationResponseJsonSchema,
  })
  .strict()
  .readonly();

export const updatePasskeyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
  })
  .strict()
  .readonly();

export const passkeyRegistrationOptionsResponseSchema = z
  .object({
    challengeId: passkeyRegistrationChallengeIdSchema,
    options: z
      .object({
        attestation: z.literal("none"),
        authenticatorSelection: z
          .object({
            residentKey: z.literal("required"),
            userVerification: z.literal("required"),
          })
          .passthrough()
          .readonly(),
        challenge: base64UrlSchema(1_024),
        excludeCredentials: z
          .array(
            z
              .object({
                id: base64UrlSchema(1_024),
                transports: z.array(authenticatorTransportSchema).optional(),
                type: z.literal("public-key"),
              })
              .strict()
              .readonly(),
          )
          .max(32)
          .readonly(),
        pubKeyCredParams: z
          .array(
            z
              .object({ alg: z.number().int(), type: z.literal("public-key") })
              .strict()
              .readonly(),
          )
          .min(1)
          .max(16)
          .readonly(),
        rp: z
          .object({ id: z.string().min(1).max(253), name: z.string().min(1).max(128) })
          .strict()
          .readonly(),
        timeout: z
          .number()
          .int()
          .positive()
          .max(10 * 60 * 1_000),
        user: z
          .object({
            displayName: z.string().min(1).max(320),
            id: base64UrlSchema(128),
            name: z.string().min(1).max(320),
          })
          .strict()
          .readonly(),
      })
      .passthrough()
      .readonly(),
  })
  .strict()
  .readonly();

export const passkeyMutationResponseSchema = z
  .object({ passkey: passkeyCredentialSchema })
  .strict()
  .readonly();

export const deletePasskeyResponseSchema = z
  .object({ deleted: z.literal(true) })
  .strict()
  .readonly();

export type AuthenticatorTransport = z.infer<typeof authenticatorTransportSchema>;
export type PasskeyCredential = z.infer<typeof passkeyCredentialSchema>;
export type PasskeyCredentialsResponse = z.infer<typeof passkeyCredentialsResponseSchema>;
export type PasskeyRegistrationResponseJson = z.infer<typeof passkeyRegistrationResponseJsonSchema>;
export type VerifyPasskeyRegistrationRequest = z.infer<
  typeof verifyPasskeyRegistrationRequestSchema
>;
export type UpdatePasskeyRequest = z.infer<typeof updatePasskeyRequestSchema>;
