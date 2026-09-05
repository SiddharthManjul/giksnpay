import { z } from "zod";
import { agentRunIdSchema } from "./agent-runs";
import { mandateIdSchema, sha256HexSchema, transactionIdSchema } from "./cross-party";
import {
  merchantCheckoutSchema,
  es256CanonicalSignatureSchema,
  offerIdSchema,
  paymentRailSchema,
} from "./merchant";
import { authenticatorTransportSchema, passkeyCredentialIdSchema } from "./passkeys";

export const webAuthenticationOptionsSchema = z
  .object({
    allowCredentials: z
      .array(
        z
          .object({
            id: z.string().min(1).max(1_024),
            transports: z.array(authenticatorTransportSchema).optional(),
            type: z.literal("public-key"),
          })
          .passthrough(),
      )
      .max(32),
    challenge: z.string().min(1).max(1_024),
    rpId: z.string().min(1).max(253).optional(),
    timeout: z
      .number()
      .int()
      .positive()
      .max(10 * 60 * 1_000)
      .optional(),
    userVerification: z.enum(["discouraged", "preferred", "required"]).optional(),
  })
  .passthrough()
  .readonly();

export const authorizationChallengeRequestSchema = z
  .object({ credentialId: passkeyCredentialIdSchema })
  .strict()
  .readonly();

export const mandateChallengeResponseSchema = z
  .object({
    challengeId: z.string().regex(/^apc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    options: webAuthenticationOptionsSchema,
  })
  .strict()
  .readonly();

export const transactionChallengeResponseSchema = mandateChallengeResponseSchema
  .unwrap()
  .extend({ payloadHash: sha256HexSchema })
  .strict()
  .readonly();

export const authorizationApprovalRequestSchema = z
  .object({
    challengeId: z.string().regex(/^apc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    response: z.record(z.string(), z.unknown()),
  })
  .strict()
  .readonly();

export const transactionActionResponseSchema = z
  .object({
    orderCreationInvoked: z.literal(false).optional(),
    reservationId: z.string().regex(/^rsv_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    state: z.literal("BUDGET_RESERVED"),
    transactionId: transactionIdSchema,
  })
  .strict()
  .readonly();

export const createTransactionRequestSchema = z
  .object({
    checkout: merchantCheckoutSchema,
    checkoutMandateId: mandateIdSchema,
    checkoutSignature: es256CanonicalSignatureSchema,
    offerHash: z.string().regex(/^[0-9a-f]{64}$/u),
    offerId: offerIdSchema,
    paymentMandateId: mandateIdSchema,
    paymentRail: paymentRailSchema,
  })
  .strict()
  .readonly();

export const purchasePreparationRequestSchema = z
  .object({ agentRunId: agentRunIdSchema })
  .strict()
  .readonly();

export const purchasePreparationResponseSchema = z
  .object({ transactionRequest: createTransactionRequestSchema })
  .strict()
  .readonly();

export const transactionProposalResponseSchema = z
  .object({
    decision: z
      .object({
        decision: z.enum(["ALLOW", "APPROVAL_REQUIRED", "BLOCK"]),
        reasons: z.array(z.object({ code: z.string(), severity: z.string() }).passthrough()),
      })
      .passthrough(),
    orderCreationInvoked: z.boolean(),
    reservationId: z.string().nullable(),
    risk: z
      .object({
        outcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
        reasons: z.array(z.object({ code: z.string(), severity: z.string() }).passthrough()),
      })
      .passthrough(),
    state: z.string(),
    transactionId: transactionIdSchema,
  })
  .strict()
  .readonly();

export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;
