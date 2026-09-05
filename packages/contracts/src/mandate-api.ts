import { utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import { agentIdSchema } from "./cross-party";
import { mandateSchema } from "./cross-party";
import { passkeyCredentialIdSchema } from "./passkeys";

export const createMandateRequestSchema = z
  .object({
    agentId: agentIdSchema,
    allowedCategories: z.array(z.string().min(3).max(96)).min(1).max(100),
    allowedMerchants: z.array(z.string().min(12).max(96)).min(1).max(100),
    allowedRails: z.array(z.literal("razorpay:test")).length(1),
    allowedServices: z.array(z.string().min(3).max(96)).min(1).max(500),
    approvalThresholdSubunits: z.number().int().nonnegative(),
    currency: z.literal("INR"),
    expiresAt: utcTimestampSchema,
    maxAttemptsPerTransaction: z.number().int().min(1).max(10),
    maxLineItems: z.number().int().min(1).max(20),
    maxQuantityPerItem: z.number().int().min(1).max(100),
    maxTransactionSubunits: z.number().int().nonnegative(),
    maxTransactions: z.number().int().min(1).max(1_000),
    maxUnitPriceSubunits: z.number().int().nonnegative(),
    passkeyId: passkeyCredentialIdSchema,
    totalBudgetSubunits: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.approvalThresholdSubunits > value.maxTransactionSubunits) {
      context.addIssue({
        code: "custom",
        message: "Approval threshold cannot exceed the per-transaction maximum",
        path: ["approvalThresholdSubunits"],
      });
    }
    if (value.maxTransactionSubunits > value.totalBudgetSubunits) {
      context.addIssue({
        code: "custom",
        message: "Per-transaction maximum cannot exceed the total budget",
        path: ["maxTransactionSubunits"],
      });
    }
  })
  .readonly();

export const mandateApiStatusSchema = z.enum([
  "ACTIVE",
  "DRAFT",
  "EXHAUSTED",
  "EXPIRED",
  "REVOKED",
  "SUSPENDED",
]);

export const mandateResponseSchema = z
  .object({
    mandate: mandateSchema,
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/u),
    status: mandateApiStatusSchema,
    usage: z
      .object({
        completedTransactions: z.number().int().nonnegative(),
        reservedSubunits: z.number().int().nonnegative(),
        spentSubunits: z.number().int().nonnegative(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const mandatesResponseSchema = z
  .object({ mandates: z.array(mandateResponseSchema).max(2_000).readonly() })
  .strict()
  .readonly();

export const createMandatesResponseSchema = z
  .object({ mandates: z.array(mandateResponseSchema).length(2).readonly() })
  .strict()
  .readonly();

export type CreateMandateRequest = z.infer<typeof createMandateRequestSchema>;
export type MandateResponse = z.infer<typeof mandateResponseSchema>;
