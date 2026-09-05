import { utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import {
  agentIdSchema,
  auditEventSchema,
  evidenceBundleSchema,
  evidenceIdSchema,
  mandateIdSchema,
} from "./cross-party";
import { transactionLifecycleStateSchema } from "./fulfilment";
import {
  es256CanonicalSignatureSchema,
  paymentRailSchema,
  semanticVersionSchema,
  stableIdentifierSchema,
} from "./merchant";

export const signedAuditEventSchema = z
  .object({
    event: auditEventSchema,
    signature: es256CanonicalSignatureSchema,
  })
  .strict()
  .readonly();

const evidenceAuditSignatureSchema = z
  .object({
    eventId: z.string().regex(/^evt_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    signature: es256CanonicalSignatureSchema,
  })
  .strict()
  .readonly();

const evidenceAuditSignaturesSchema = z
  .array(evidenceAuditSignatureSchema)
  .max(10_000)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.eventId)).size === entries.length,
    "Audit signature event IDs must be unique",
  )
  .readonly();

export const signedEvidenceBundleSchema = z
  .object({
    auditSignatures: evidenceAuditSignaturesSchema,
    bundle: evidenceBundleSchema,
    bundleHash: z.string().regex(/^[0-9a-f]{64}$/u),
    signature: es256CanonicalSignatureSchema,
  })
  .strict()
  .readonly();

export const evidenceProofTypeSchema = z.enum([
  "BUNDLE_SCHEMA",
  "BUNDLE_HASH",
  "BUNDLE_SIGNATURE",
  "AUDIT_CHAIN",
  "AUDIT_SIGNATURES",
  "MERCHANT_CHECKOUT",
  "PAYMENT_EVIDENCE",
  "DELIVERY_RECEIPT",
  "PUBLIC_REDACTION",
]);

export const evidenceProofStatusSchema = z.enum(["PASS", "FAIL", "NOT_APPLICABLE"]);

export const evidenceProofResultSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/u),
    label: z.string().trim().min(3).max(120),
    status: evidenceProofStatusSchema,
    type: evidenceProofTypeSchema,
  })
  .strict()
  .readonly();

export const publicEvidenceBundleSchema = z
  .object({
    auditSignatures: evidenceAuditSignaturesSchema,
    bundle: evidenceBundleSchema.nullable(),
    bundleHash: z.string().regex(/^[0-9a-f]{64}$/u),
    evidenceId: evidenceIdSchema,
    proofResults: z.array(evidenceProofResultSchema).length(9).readonly(),
    signature: es256CanonicalSignatureSchema.nullable(),
    signingKid: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
    verified: z.boolean(),
    verifiedAt: utcTimestampSchema,
  })
  .strict()
  .readonly();

export const transactionAuditEventsResponseSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            event: auditEventSchema,
            signatureVerified: z.boolean(),
          })
          .strict()
          .readonly(),
      )
      .max(10_000)
      .readonly(),
  })
  .strict()
  .readonly();

export const transactionSummarySchema = z
  .object({
    amountSubunits: z.number().int().nonnegative(),
    createdAt: utcTimestampSchema,
    currency: z.literal("INR"),
    id: z.string().regex(/^ctx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    merchantId: z.string().min(3).max(128),
    state: transactionLifecycleStateSchema,
    updatedAt: utcTimestampSchema,
  })
  .strict()
  .readonly();

export const transactionsResponseSchema = z
  .object({ transactions: z.array(transactionSummarySchema).max(1_000).readonly() })
  .strict()
  .readonly();

export const transactionDetailResponseSchema = transactionSummarySchema
  .unwrap()
  .extend({
    agentId: agentIdSchema,
    decisionEvidence: z.record(z.string(), z.unknown()),
    mandateId: mandateIdSchema,
    paymentRail: paymentRailSchema,
    service: z
      .object({
        externalId: stableIdentifierSchema,
        name: z.string().min(2).max(160),
        version: semanticVersionSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export type SignedAuditEvent = z.infer<typeof signedAuditEventSchema>;
export type SignedEvidenceBundle = z.infer<typeof signedEvidenceBundleSchema>;
export type EvidenceProofResult = z.infer<typeof evidenceProofResultSchema>;
export type PublicEvidenceBundle = z.infer<typeof publicEvidenceBundleSchema>;
export type TransactionSummary = z.infer<typeof transactionSummarySchema>;
export type TransactionDetailResponse = z.infer<typeof transactionDetailResponseSchema>;
