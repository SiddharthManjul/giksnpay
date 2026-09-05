import { currencySubunitsSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import {
  agentIdSchema,
  entitlementIdSchema,
  sha256HexSchema,
  transactionIdSchema,
} from "./cross-party";
import {
  es256CanonicalSignatureSchema,
  merchantHttpsUrlSchema,
  merchantIdSchema,
  stableIdentifierSchema,
} from "./merchant";

const PREFIXED_ULID_SUFFIX = "[0-7][0-9A-HJKMNP-TV-Z]{25}";
const prefixedUlidSchema = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${PREFIXED_ULID_SUFFIX}$`, "u"));

export const fulfilmentIdSchema = prefixedUlidSchema("ful");
export const deliveryReceiptIdSchema = prefixedUlidSchema("dlr");
export const entitlementJwtSchema = z
  .string()
  .min(256)
  .max(8_192)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

export const entitlementJwtHeaderSchema = z
  .object({
    alg: z.literal("ES256"),
    kid: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
    typ: z.literal("JWT"),
  })
  .strict()
  .readonly();

export const entitlementJwtClaimsSchema = z
  .object({
    agent_id: agentIdSchema,
    amount_subunits: currencySubunitsSchema,
    aud: merchantHttpsUrlSchema,
    checkout_hash: sha256HexSchema,
    currency: z.literal("INR"),
    exp: z.number().int().safe().positive(),
    iat: z.number().int().safe().positive(),
    iss: merchantHttpsUrlSchema,
    jti: entitlementIdSchema,
    merchant_id: merchantIdSchema,
    schema_version: z.literal("mindpay.entitlement.jwt.1"),
    scopes: z.tuple([z.literal("service:redeem")]).readonly(),
    service_id: stableIdentifierSchema,
    sub: agentIdSchema,
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((claims, context) => {
    if (claims.sub !== claims.agent_id) {
      context.addIssue({
        code: "custom",
        message: "JWT subject must equal the bound agent",
        path: ["sub"],
      });
    }
    if (claims.exp <= claims.iat || claims.exp - claims.iat > 86_400) {
      context.addIssue({
        code: "custom",
        message: "Entitlements must have a positive lifetime of no more than 24 hours",
        path: ["exp"],
      });
    }
  })
  .readonly();

export const entitlementIssueResponseSchema = z
  .object({
    entitlementId: entitlementIdSchema,
    expiresAt: utcTimestampSchema,
    scopes: z.tuple([z.literal("service:redeem")]).readonly(),
    serviceId: stableIdentifierSchema,
    state: z.literal("ENTITLEMENT_ISSUED"),
    transactionId: transactionIdSchema,
  })
  .strict()
  .readonly();

const companyNameSchema = z.string().trim().min(2).max(160);
const marketNameSchema = z.string().trim().min(2).max(160);

export const redeemMarketSnapshotInputSchema = z
  .object({
    company: companyNameSchema,
    entitlementJwt: entitlementJwtSchema,
    market: marketNameSchema,
  })
  .strict()
  .readonly();

export const redeemCompetitorDossierInputSchema = z
  .object({
    company: companyNameSchema,
    competitors: z
      .array(companyNameSchema)
      .min(1)
      .max(5)
      .refine((values) => new Set(values).size === values.length)
      .readonly(),
    entitlementJwt: entitlementJwtSchema,
    market: marketNameSchema,
  })
  .strict()
  .readonly();

export const getFulfilmentStatusInputSchema = z
  .object({ entitlementJwt: entitlementJwtSchema })
  .strict()
  .readonly();

const reportFindingSchema = z
  .object({
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    evidence: z.string().trim().min(10).max(600),
    finding: z.string().trim().min(5).max(240),
  })
  .strict()
  .readonly();

const reportMetadataShape = {
  data_source: z.literal("DETERMINISTIC_DEMO_FIXTURE"),
  generated_at: utcTimestampSchema,
  market: marketNameSchema,
  subject_company: companyNameSchema,
} as const;

export const marketSnapshotResultSchema = z
  .object({
    ...reportMetadataShape,
    executive_summary: z.string().trim().min(20).max(2_000),
    findings: z.array(reportFindingSchema).min(2).max(8).readonly(),
    schema_version: z.literal("signalworks.market_snapshot.1"),
    service_id: z.literal("market_snapshot"),
  })
  .strict()
  .readonly();

const competitorProfileSchema = z
  .object({
    competitor: companyNameSchema,
    positioning: z.string().trim().min(10).max(600),
    strengths: z.array(z.string().trim().min(3).max(240)).min(1).max(5).readonly(),
    weaknesses: z.array(z.string().trim().min(3).max(240)).min(1).max(5).readonly(),
  })
  .strict()
  .readonly();

export const competitorDossierResultSchema = z
  .object({
    ...reportMetadataShape,
    competitors: z.array(competitorProfileSchema).min(1).max(5).readonly(),
    executive_summary: z.string().trim().min(20).max(2_000),
    recommendations: z.array(z.string().trim().min(5).max(400)).min(2).max(8).readonly(),
    schema_version: z.literal("signalworks.competitor_dossier.1"),
    service_id: z.literal("detailed_competitor_dossier"),
  })
  .strict()
  .readonly();

export const signalWorksServiceResultSchema = z.discriminatedUnion("service_id", [
  marketSnapshotResultSchema,
  competitorDossierResultSchema,
]);

export const deliveryReceiptSchema = z
  .object({
    agent_id: agentIdSchema,
    audience: merchantHttpsUrlSchema,
    completed_at: utcTimestampSchema,
    delivery_receipt_id: deliveryReceiptIdSchema,
    entitlement_id: entitlementIdSchema,
    expires_at: utcTimestampSchema,
    fulfilment_id: fulfilmentIdSchema,
    issued_at: utcTimestampSchema,
    issuer: merchantHttpsUrlSchema,
    jti: deliveryReceiptIdSchema,
    merchant_id: merchantIdSchema,
    output_hash: sha256HexSchema,
    schema_version: z.literal("mindpay.delivery_receipt.1"),
    service_id: stableIdentifierSchema,
    status: z.literal("COMPLETED"),
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.jti !== receipt.delivery_receipt_id) {
      context.addIssue({
        code: "custom",
        message: "Receipt JTI must equal its receipt ID",
        path: ["jti"],
      });
    }
    if (receipt.completed_at !== receipt.issued_at) {
      context.addIssue({
        code: "custom",
        message: "Receipt issue and completion timestamps must match",
        path: ["issued_at"],
      });
    }
    if (Date.parse(receipt.expires_at) <= Date.parse(receipt.issued_at)) {
      context.addIssue({
        code: "custom",
        message: "Receipt expiry must follow issuance",
        path: ["expires_at"],
      });
    }
  })
  .readonly();

export const signedDeliveryPublicationSchema = z
  .object({
    receipt: deliveryReceiptSchema,
    result: signalWorksServiceResultSchema,
    signature: es256CanonicalSignatureSchema,
  })
  .strict()
  .superRefine((publication, context) => {
    if (publication.receipt.service_id !== publication.result.service_id) {
      context.addIssue({
        code: "custom",
        message: "Delivery result must match the purchased service",
        path: ["result", "service_id"],
      });
    }
  })
  .readonly();

export const fulfilmentStatusSchema = z
  .object({
    completedAt: utcTimestampSchema.nullable(),
    entitlementId: entitlementIdSchema,
    failureCode: z.string().min(1).max(64).nullable(),
    fulfilmentId: fulfilmentIdSchema,
    result: signalWorksServiceResultSchema.nullable(),
    state: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
    transactionId: transactionIdSchema,
  })
  .strict()
  .superRefine((status, context) => {
    const completed =
      status.state === "COMPLETED" &&
      status.completedAt !== null &&
      status.failureCode === null &&
      status.result !== null;
    const running =
      status.state === "RUNNING" &&
      status.completedAt === null &&
      status.failureCode === null &&
      status.result === null;
    const failed =
      status.state === "FAILED" &&
      status.completedAt !== null &&
      status.failureCode !== null &&
      status.result === null;
    if (!completed && !running && !failed)
      context.addIssue({ code: "custom", message: "Fulfilment status fields are inconsistent" });
  })
  .readonly();

export const platformJwksSchema = z
  .object({
    keys: z
      .array(
        z
          .object({
            alg: z.literal("ES256"),
            crv: z.literal("P-256"),
            ext: z.boolean().optional(),
            key_ops: z
              .tuple([z.literal("verify")])
              .readonly()
              .optional(),
            kid: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
            kty: z.literal("EC"),
            use: z.literal("sig"),
            x: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
            y: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
          })
          .strict()
          .readonly(),
      )
      .min(0)
      .max(8)
      .readonly(),
  })
  .strict()
  .readonly();

export const mindPayMcpAgentSchema = z.object({ agentId: agentIdSchema }).strict().readonly();

export const mindPayMcpSearchInputSchema = z
  .object({
    agentId: agentIdSchema,
    category: stableIdentifierSchema,
    maximumPriceSubunits: currencySubunitsSchema,
    query: z.string().trim().min(2).max(120),
  })
  .strict()
  .readonly();

export const mindPayMcpServiceInputSchema = z
  .object({
    agentId: agentIdSchema,
    serviceId: z.string().regex(/^service_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
  })
  .strict()
  .readonly();

export const mindPayMcpProposalInputSchema = mindPayMcpServiceInputSchema
  .unwrap()
  .extend({ decisionSummary: z.string().trim().min(10).max(500) })
  .strict()
  .readonly();

export const mindPayMcpTransactionInputSchema = z
  .object({ agentId: agentIdSchema, transactionId: transactionIdSchema })
  .strict()
  .readonly();

export const mindPayMcpProposalSchema = z
  .object({
    amountSubunits: currencySubunitsSchema,
    currency: z.literal("INR"),
    decisionSummary: z.string().trim().min(10).max(500),
    merchantId: merchantIdSchema,
    requiresTransactionCreation: z.literal(true),
    serviceId: z.string().regex(/^service_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
  })
  .strict()
  .readonly();

export const transactionLifecycleStateSchema = z.enum([
  "DRAFT",
  "DISCOVERING",
  "OFFER_SELECTED",
  "VERIFYING",
  "POLICY_REVIEW",
  "BLOCKED",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "BUDGET_RESERVED",
  "CHECKOUT_CREATED",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CALLBACK_VERIFIED",
  "PAYMENT_RECONCILING",
  "PAYMENT_CAPTURED",
  "ENTITLEMENT_ISSUED",
  "FULFILLING",
  "FULFILMENT_FAILED",
  "FULFILLED",
  "EVIDENCE_READY",
  "EXPIRED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "DISPUTED",
]);

export const transactionStatusOutputSchema = z
  .object({
    amountSubunits: currencySubunitsSchema,
    currency: z.literal("INR"),
    id: transactionIdSchema,
    state: transactionLifecycleStateSchema,
  })
  .strict()
  .readonly();

export const evidenceAvailabilitySchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(false),
      reason: z.literal("NOT_YET_CREATED"),
      transactionId: transactionIdSchema,
    })
    .strict()
    .readonly(),
  z
    .object({
      available: z.literal(true),
      bundle: z.record(z.string(), z.unknown()).readonly(),
      transactionId: transactionIdSchema,
    })
    .strict()
    .readonly(),
]);

export const MINDPAY_MCP_TOOL_NAMES = Object.freeze([
  "search_verified_services",
  "get_verified_service",
  "request_signed_offer",
  "propose_purchase",
  "get_transaction_status",
  "get_evidence_bundle",
] as const);

export const SIGNALWORKS_MCP_TOOL_NAMES = Object.freeze([
  "redeem_market_snapshot",
  "redeem_competitor_dossier",
  "get_fulfilment_status",
] as const);

export type EntitlementJwtClaims = z.infer<typeof entitlementJwtClaimsSchema>;
export type SignalWorksServiceResult = z.infer<typeof signalWorksServiceResultSchema>;
export type SignedDeliveryPublication = z.infer<typeof signedDeliveryPublicationSchema>;
export type FulfilmentStatus = z.infer<typeof fulfilmentStatusSchema>;
