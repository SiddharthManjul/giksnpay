import {
  currencyCodeSchema,
  currencySubunitsSchema,
  ulidSchema,
  utcTimestampSchema,
} from "@mindpay/domain";
import { z } from "zod";
import {
  checkoutLineItemSchema,
  checkoutSessionIdSchema,
  es256PublicJwkSchema,
  merchantHttpsUrlSchema,
  merchantIdSchema,
  offerIdSchema,
  offerNonceSchema,
  paymentRailSchema,
  semanticVersionSchema,
  stableIdentifierSchema,
} from "./merchant";

const KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SHA_256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const EXTERNAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const PREFIXED_ULID_SUFFIX = "[0-7][0-9A-HJKMNP-TV-Z]{25}";

type ReadonlyJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ReadonlyJsonValue[]
  | { readonly [key: string]: ReadonlyJsonValue };

const readonlyJsonValueSchema: z.ZodType<ReadonlyJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(readonlyJsonValueSchema).readonly(),
    z.record(z.string(), readonlyJsonValueSchema).readonly(),
  ]),
);

const signedClaimsShape = {
  audience: merchantHttpsUrlSchema,
  expires_at: utcTimestampSchema,
  issued_at: utcTimestampSchema,
  issuer: merchantHttpsUrlSchema,
  kid: z.string().regex(KEY_ID_PATTERN, "Key ID is not canonical"),
} as const;

const nonceClaimsShape = {
  ...signedClaimsShape,
  nonce: offerNonceSchema,
} as const;

const jtiClaimsShape = {
  ...signedClaimsShape,
  jti: z
    .string()
    .regex(
      new RegExp(`^[a-z][a-z0-9_]*_${PREFIXED_ULID_SUFFIX}$`, "u"),
      "JTI must be a stable prefix followed by a canonical ULID",
    )
    .refine(hasCanonicalUlidSuffix, "JTI must end with a valid canonical ULID"),
} as const;

const prefixedUlidSchema = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}_${PREFIXED_ULID_SUFFIX}$`, "u"),
      `ID must be ${prefix}_ followed by a canonical ULID`,
    )
    .refine(hasCanonicalUlidSuffix, `ID must contain a valid canonical ULID after ${prefix}_`);

const uniqueStrings = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const uniqueStringArray = <T extends z.ZodType<string>>(schema: T, maximum: number) =>
  z.array(schema).min(1).max(maximum).refine(uniqueStrings, "Values must be unique").readonly();

const externalReferenceSchema = z
  .string()
  .regex(EXTERNAL_REFERENCE_PATTERN, "External reference is not canonical");

export const sha256HexSchema = z
  .string()
  .regex(SHA_256_HEX_PATTERN, "Hash must be 64 lowercase hexadecimal SHA-256 characters");

export const userIdSchema = prefixedUlidSchema("usr");
export const organizationIdSchema = prefixedUlidSchema("org");
export const agentIdSchema = prefixedUlidSchema("agt");
export const mandateIdSchema = prefixedUlidSchema("mnd");
export const transactionIdSchema = prefixedUlidSchema("ctx");
export const entitlementIdSchema = prefixedUlidSchema("ent");
export const auditEventIdSchema = prefixedUlidSchema("evt");
export const evidenceIdSchema = prefixedUlidSchema("evd");

export const signedObjectClaimsSchema = z.union([
  z.object(nonceClaimsShape).strict().readonly(),
  z.object(jtiClaimsShape).strict().readonly(),
]);

export const mandateSchemaVersionSchema = z.enum([
  "mindpay.mandate.checkout.open.1",
  "mindpay.mandate.payment.open.1",
  "mindpay.mandate.checkout.closed.1",
  "mindpay.mandate.payment.closed.1",
]);

export const mandateAgentBindingSchema = z
  .object({
    agent_id: agentIdSchema,
    agent_version: semanticVersionSchema,
    key_id: z.string().regex(KEY_ID_PATTERN, "Agent key ID is not canonical"),
    public_jwk: es256PublicJwkSchema,
  })
  .strict()
  .readonly();

const allowedMerchantsSchema = uniqueStringArray(merchantIdSchema, 100);
const allowedCategoriesSchema = uniqueStringArray(stableIdentifierSchema, 100);
const allowedServicesSchema = uniqueStringArray(stableIdentifierSchema, 500);
const allowedPaymentRailsSchema = uniqueStringArray(paymentRailSchema, 10);

export const checkoutLineItemConstraintsSchema = z
  .object({
    currency: currencyCodeSchema,
    max_line_items: z.number().int().positive().max(20),
    max_quantity_per_item: z.number().int().positive().max(100),
    max_unit_price_subunits: currencySubunitsSchema,
  })
  .strict()
  .readonly();

const mandateIdentityShape = {
  agent: mandateAgentBindingSchema,
  mandate_id: mandateIdSchema,
  organization_id: organizationIdSchema,
  user_id: userIdSchema,
} as const;

export const openCheckoutMandateSchema = z
  .object({
    ...nonceClaimsShape,
    ...mandateIdentityShape,
    allowed_categories: allowedCategoriesSchema,
    allowed_merchants: allowedMerchantsSchema,
    allowed_services: allowedServicesSchema,
    line_item_constraints: checkoutLineItemConstraintsSchema,
    schema_version: z.literal("mindpay.mandate.checkout.open.1"),
  })
  .strict()
  .superRefine(validateSignedLifetime)
  .readonly();

export const openPaymentMandateSchema = z
  .object({
    ...nonceClaimsShape,
    ...mandateIdentityShape,
    allowed_payees: allowedMerchantsSchema,
    allowed_rails: allowedPaymentRailsSchema,
    approval_threshold_subunits: currencySubunitsSchema,
    currency: currencyCodeSchema,
    max_attempts_per_transaction: z.number().int().positive().max(10),
    max_transaction_subunits: currencySubunitsSchema,
    max_transactions: z.number().int().positive().max(1_000),
    schema_version: z.literal("mindpay.mandate.payment.open.1"),
    total_budget_subunits: currencySubunitsSchema,
  })
  .strict()
  .superRefine((mandate, context) => {
    validateSignedLifetime(mandate, context);
    if (mandate.approval_threshold_subunits > mandate.max_transaction_subunits) {
      context.addIssue({
        code: "custom",
        message: "Approval threshold cannot exceed the per-transaction maximum",
        path: ["approval_threshold_subunits"],
      });
    }
    if (mandate.max_transaction_subunits > mandate.total_budget_subunits) {
      context.addIssue({
        code: "custom",
        message: "Per-transaction maximum cannot exceed the total budget",
        path: ["max_transaction_subunits"],
      });
    }
  })
  .readonly();

export const closedCheckoutMandateSchema = z
  .object({
    ...nonceClaimsShape,
    agent_id: agentIdSchema,
    agent_version: semanticVersionSchema,
    checkout_hash: sha256HexSchema,
    checkout_session_id: checkoutSessionIdSchema,
    currency: currencyCodeSchema,
    line_items: z.array(checkoutLineItemSchema).min(1).max(20).readonly(),
    merchant_id: merchantIdSchema,
    mandate_id: mandateIdSchema,
    offer_hash: sha256HexSchema,
    offer_id: offerIdSchema,
    open_checkout_mandate_hash: sha256HexSchema,
    open_checkout_mandate_id: mandateIdSchema,
    schema_version: z.literal("mindpay.mandate.checkout.closed.1"),
    total_subunits: currencySubunitsSchema,
    user_id: userIdSchema,
  })
  .strict()
  .superRefine((mandate, context) => {
    validateSignedLifetime(mandate, context);
    const calculatedTotal = mandate.line_items.reduce(
      (total, item) => total + BigInt(item.line_total_subunits),
      0n,
    );
    if (calculatedTotal !== BigInt(mandate.total_subunits)) {
      context.addIssue({
        code: "custom",
        message: "Closed checkout total must equal the sum of line totals",
        path: ["total_subunits"],
      });
    }
  })
  .readonly();

export const closedPaymentMandateSchema = z
  .object({
    ...nonceClaimsShape,
    agent_id: agentIdSchema,
    agent_version: semanticVersionSchema,
    amount_subunits: currencySubunitsSchema,
    checkout_hash: sha256HexSchema,
    checkout_session_id: checkoutSessionIdSchema,
    closed_checkout_mandate_hash: sha256HexSchema,
    currency: currencyCodeSchema,
    mandate_id: mandateIdSchema,
    open_payment_mandate_hash: sha256HexSchema,
    open_payment_mandate_id: mandateIdSchema,
    payee: merchantIdSchema,
    payment_attempt: z.number().int().positive().max(10),
    payment_rail: paymentRailSchema,
    schema_version: z.literal("mindpay.mandate.payment.closed.1"),
    user_id: userIdSchema,
  })
  .strict()
  .superRefine(validateSignedLifetime)
  .readonly();

export const mandateSchema = z.discriminatedUnion("schema_version", [
  openCheckoutMandateSchema,
  openPaymentMandateSchema,
  closedCheckoutMandateSchema,
  closedPaymentMandateSchema,
]);

export const merchantEventSchemaVersionSchema = z.literal("mindpay.merchant.event.1");
export const merchantEventTypeSchema = z.enum([
  "PAYMENT_CALLBACK_VERIFIED",
  "PAYMENT_FAILED",
  "PAYMENT_CAPTURED",
  "ORDER_PAID",
  "PAYMENT_RECONCILED",
  "FULFILMENT_COMPLETED",
]);

export const merchantPaymentProofSchema = z
  .object({
    amount_subunits: currencySubunitsSchema,
    captured: z.boolean(),
    currency: currencyCodeSchema,
    evidence_hash: sha256HexSchema,
    mode: z.literal("TEST"),
    order_paid: z.boolean(),
    provider: z.literal("RAZORPAY"),
    provider_event_id: externalReferenceSchema,
    provider_order_id: externalReferenceSchema,
    provider_payment_id: externalReferenceSchema,
    verification_source: z.enum(["CALLBACK", "WEBHOOK", "SERVER_FETCH"]),
  })
  .strict()
  .readonly();

export const merchantEventSchema = z
  .object({
    ...jtiClaimsShape,
    amount_subunits: currencySubunitsSchema,
    checkout_hash: sha256HexSchema,
    checkout_session_id: checkoutSessionIdSchema,
    currency: currencyCodeSchema,
    delivery_receipt_hash: sha256HexSchema.optional(),
    event_type: merchantEventTypeSchema,
    merchant_id: merchantIdSchema,
    occurred_at: utcTimestampSchema,
    payment: merchantPaymentProofSchema,
    schema_version: merchantEventSchemaVersionSchema,
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((event, context) => {
    validateSignedLifetime(event, context);
    if (Date.parse(event.occurred_at) > Date.parse(event.issued_at)) {
      context.addIssue({
        code: "custom",
        message: "Merchant event cannot occur after it is issued",
        path: ["occurred_at"],
      });
    }
    validateMatchingMoney(
      event.amount_subunits,
      event.currency,
      event.payment.amount_subunits,
      event.payment.currency,
      ["payment"],
      context,
    );

    const requiresCapture = [
      "PAYMENT_CAPTURED",
      "PAYMENT_RECONCILED",
      "FULFILMENT_COMPLETED",
    ].includes(event.event_type);
    const requiresPaidOrder = ["ORDER_PAID", "PAYMENT_RECONCILED", "FULFILMENT_COMPLETED"].includes(
      event.event_type,
    );

    if (requiresCapture && !event.payment.captured) {
      context.addIssue({
        code: "custom",
        message: "Event type requires captured payment proof",
        path: ["payment", "captured"],
      });
    }
    if (requiresPaidOrder && !event.payment.order_paid) {
      context.addIssue({
        code: "custom",
        message: "Event type requires paid-order proof",
        path: ["payment", "order_paid"],
      });
    }
    if (
      event.event_type === "PAYMENT_FAILED" &&
      (event.payment.captured || event.payment.order_paid)
    ) {
      context.addIssue({
        code: "custom",
        message: "A failed-payment event cannot claim capture or a paid order",
        path: ["payment"],
      });
    }
    if (event.event_type === "FULFILMENT_COMPLETED" && event.delivery_receipt_hash === undefined) {
      context.addIssue({
        code: "custom",
        message: "Fulfilment completion requires a delivery-receipt hash",
        path: ["delivery_receipt_hash"],
      });
    }
    if (event.event_type !== "FULFILMENT_COMPLETED" && event.delivery_receipt_hash !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only fulfilment completion may carry a delivery-receipt hash",
        path: ["delivery_receipt_hash"],
      });
    }
    if (
      event.payment.verification_source === "CALLBACK" &&
      event.event_type !== "PAYMENT_CALLBACK_VERIFIED"
    ) {
      context.addIssue({
        code: "custom",
        message: "Browser callback proof can only assert callback verification",
        path: ["payment", "verification_source"],
      });
    }
    if (
      event.event_type === "PAYMENT_CALLBACK_VERIFIED" &&
      (event.payment.captured || event.payment.order_paid)
    ) {
      context.addIssue({
        code: "custom",
        message: "Browser callback verification cannot assert capture or a paid order",
        path: ["payment"],
      });
    }
  })
  .readonly();

export const auditEventSchemaVersionSchema = z.literal("mindpay.audit.event.1");
export const auditEventTypeSchema = z.enum([
  "USER_INTENT_RECEIVED",
  "AGENT_RUN_STARTED",
  "MARKETPLACE_SEARCHED",
  "MERCHANT_VERIFIED",
  "OFFER_RECEIVED",
  "OFFER_VERIFIED",
  "OFFER_INTEGRITY_FAILED",
  "POLICY_EVALUATED",
  "RISK_EVALUATED",
  "USER_APPROVAL_REQUESTED",
  "USER_APPROVAL_VERIFIED",
  "BUDGET_RESERVED",
  "CHECKOUT_CREATED",
  "RAZORPAY_ORDER_CREATED",
  "RAZORPAY_CALLBACK_VERIFIED",
  "RAZORPAY_WEBHOOK_VERIFIED",
  "PAYMENT_FAILED",
  "PAYMENT_CAPTURED",
  "ENTITLEMENT_ISSUED",
  "ENTITLEMENT_REDEEMED",
  "FULFILMENT_COMPLETED",
  "BUDGET_COMMITTED",
  "BUDGET_RELEASED",
  "EVIDENCE_BUNDLE_CREATED",
  "TRANSACTION_BLOCKED",
  "TRANSACTION_COMPLETED",
]);

export const auditActorSchema = z
  .object({
    id: z.string().min(3).max(128).regex(EXTERNAL_REFERENCE_PATTERN),
    type: z.enum(["USER", "AGENT", "MINDPAY", "MERCHANT", "PAYMENT_PROVIDER", "SYSTEM"]),
  })
  .strict()
  .readonly();

export const auditEventSchema = z
  .object({
    ...jtiClaimsShape,
    actor: auditActorSchema,
    event_hash: sha256HexSchema,
    event_type: auditEventTypeSchema,
    occurred_at: utcTimestampSchema,
    payload_hash: sha256HexSchema,
    previous_event_hash: sha256HexSchema.nullable(),
    redacted_payload: z.record(z.string().min(1).max(128), readonlyJsonValueSchema).readonly(),
    schema_version: auditEventSchemaVersionSchema,
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((event, context) => {
    validateSignedLifetime(event, context);
    if (event.occurred_at !== event.issued_at) {
      context.addIssue({
        code: "custom",
        message: "Audit occurrence must equal the signed issuance timestamp",
        path: ["occurred_at"],
      });
    }
    if (event.sequence === 0 && event.previous_event_hash !== null) {
      context.addIssue({
        code: "custom",
        message: "The root audit event cannot have a previous hash",
        path: ["previous_event_hash"],
      });
    }
    if (event.sequence > 0 && event.previous_event_hash === null) {
      context.addIssue({
        code: "custom",
        message: "Non-root audit events require a previous hash",
        path: ["previous_event_hash"],
      });
    }
  })
  .readonly();

export const entitlementSchemaVersionSchema = z.literal("mindpay.entitlement.1");
export const entitlementScopeSchema = z.enum(["service:redeem"]);

export const entitlementSchema = z
  .object({
    ...jtiClaimsShape,
    agent_id: agentIdSchema,
    amount_subunits: currencySubunitsSchema,
    checkout_hash: sha256HexSchema,
    currency: currencyCodeSchema,
    entitlement_id: entitlementIdSchema,
    merchant_id: merchantIdSchema,
    schema_version: entitlementSchemaVersionSchema,
    scopes: uniqueStringArray(entitlementScopeSchema, 10),
    service_id: stableIdentifierSchema,
    subject: agentIdSchema,
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((entitlement, context) => {
    validateSignedLifetime(entitlement, context);
    if (entitlement.jti !== entitlement.entitlement_id) {
      context.addIssue({
        code: "custom",
        message: "Entitlement JTI must equal the one-time entitlement ID",
        path: ["jti"],
      });
    }
    if (entitlement.subject !== entitlement.agent_id) {
      context.addIssue({
        code: "custom",
        message: "Entitlement subject must equal the bound agent ID",
        path: ["subject"],
      });
    }
  })
  .readonly();

export const evidenceSchemaVersionSchema = z.literal("mindpay.evidence.1");
export const evidenceTransactionStateSchema = z.enum([
  "EVIDENCE_READY",
  "BLOCKED",
  "PAYMENT_FAILED",
]);

export const evidenceTransactionSchema = z
  .object({
    amount_subunits: currencySubunitsSchema,
    checkout_session_id: checkoutSessionIdSchema,
    completed_at: utcTimestampSchema,
    created_at: utcTimestampSchema,
    currency: currencyCodeSchema,
    mandate_id: mandateIdSchema,
    state: evidenceTransactionStateSchema,
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((transaction, context) => {
    if (Date.parse(transaction.completed_at) < Date.parse(transaction.created_at)) {
      context.addIssue({
        code: "custom",
        message: "Transaction completion cannot precede creation",
        path: ["completed_at"],
      });
    }
  })
  .readonly();

export const mandateProofSchema = z
  .object({
    challenge_hash: sha256HexSchema,
    credential_id_hash: sha256HexSchema,
    proof_type: z.literal("WEBAUTHN_ASSERTION"),
    signed_payload_hash: sha256HexSchema,
    verified_at: utcTimestampSchema,
  })
  .strict()
  .readonly();

export const evidenceUserMandateSchema = z
  .object({
    mandate_id: mandateIdSchema,
    payload_hash: sha256HexSchema,
    proof: mandateProofSchema,
  })
  .strict()
  .superRefine((mandate, context) => {
    if (mandate.payload_hash !== mandate.proof.signed_payload_hash) {
      context.addIssue({
        code: "custom",
        message: "Mandate proof must bind the exact mandate payload hash",
        path: ["proof", "signed_payload_hash"],
      });
    }
  })
  .readonly();

export const evidenceAgentSchema = z
  .object({
    agent_id: agentIdSchema,
    agent_version: semanticVersionSchema,
    system_policy_hash: sha256HexSchema,
    tool_versions: z
      .array(
        z
          .object({
            tool_id: stableIdentifierSchema,
            version: semanticVersionSchema,
          })
          .strict()
          .readonly(),
      )
      .max(100)
      .readonly(),
  })
  .strict()
  .superRefine((agent, context) => {
    if (!uniqueStrings(agent.tool_versions.map((tool) => tool.tool_id))) {
      context.addIssue({
        code: "custom",
        message: "Evidence tool IDs must be unique",
        path: ["tool_versions"],
      });
    }
  })
  .readonly();

export const evidenceMerchantSchema = z
  .object({
    catalog_hash: sha256HexSchema,
    checkout_amount_subunits: currencySubunitsSchema,
    checkout_currency: currencyCodeSchema,
    checkout_hash: sha256HexSchema,
    checkout_session_id: checkoutSessionIdSchema,
    checkout_signature_verified: z.boolean(),
    manifest_hash: sha256HexSchema,
    merchant_id: merchantIdSchema,
    offer_signature_verified: z.boolean(),
  })
  .strict()
  .readonly();

export const evidenceDecisionReasonSchema = z
  .object({
    code: stableIdentifierSchema,
    severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  })
  .strict()
  .readonly();

export const evidencePolicySchema = z
  .object({
    decision: z.enum(["ALLOW", "APPROVAL_REQUIRED", "BLOCK"]),
    reasons: z.array(evidenceDecisionReasonSchema).max(100).readonly(),
    ruleset_version: semanticVersionSchema,
  })
  .strict()
  .readonly();

export const evidenceRiskSchema = z
  .object({
    outcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
    reasons: z.array(evidenceDecisionReasonSchema).max(100).readonly(),
    ruleset_version: semanticVersionSchema,
  })
  .strict()
  .readonly();

export const evidencePaymentSchema = z
  .object({
    amount_subunits: currencySubunitsSchema,
    callback_signature_verified: z.boolean(),
    captured: z.boolean(),
    currency: currencyCodeSchema,
    evidence_hash: sha256HexSchema,
    mode: z.literal("TEST"),
    order_paid: z.boolean(),
    provider: z.literal("RAZORPAY"),
    provider_order_id: externalReferenceSchema,
    provider_payment_id: externalReferenceSchema,
    transaction_id: transactionIdSchema,
    verification_sources: uniqueStringArray(z.enum(["CALLBACK", "WEBHOOK", "SERVER_FETCH"]), 3),
    webhook_signature_verified: z.boolean(),
  })
  .strict()
  .superRefine((payment, context) => {
    if (payment.callback_signature_verified !== payment.verification_sources.includes("CALLBACK")) {
      context.addIssue({
        code: "custom",
        message: "Callback verification flag must match verification sources",
        path: ["callback_signature_verified"],
      });
    }
    if (payment.webhook_signature_verified !== payment.verification_sources.includes("WEBHOOK")) {
      context.addIssue({
        code: "custom",
        message: "Webhook verification flag must match verification sources",
        path: ["webhook_signature_verified"],
      });
    }
  })
  .readonly();

export const evidenceFulfilmentSchema = z
  .object({
    delivery_receipt_hash: sha256HexSchema,
    entitlement_consumed: z.boolean(),
    entitlement_id: entitlementIdSchema,
    merchant_receipt_signature_verified: z.boolean(),
    output_hash: sha256HexSchema,
    transaction_id: transactionIdSchema,
  })
  .strict()
  .readonly();

export const evidenceAuditSchema = z
  .object({
    event_count: z.number().int().positive().max(10_000),
    events: z.array(auditEventSchema).min(1).max(10_000).readonly(),
    final_event_hash: sha256HexSchema,
    root_event_hash: sha256HexSchema,
  })
  .strict()
  .readonly();

export const evidenceBundleSchema = z
  .object({
    ...jtiClaimsShape,
    agent: evidenceAgentSchema,
    audit: evidenceAuditSchema,
    created_at: utcTimestampSchema,
    evidence_id: evidenceIdSchema,
    fulfilment: evidenceFulfilmentSchema.nullable(),
    merchant: evidenceMerchantSchema,
    payment: evidencePaymentSchema.nullable(),
    policy: evidencePolicySchema,
    risk: evidenceRiskSchema,
    schema_version: evidenceSchemaVersionSchema,
    transaction: evidenceTransactionSchema,
    user_mandate: evidenceUserMandateSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    validateSignedLifetime(bundle, context);
    if (bundle.jti !== bundle.evidence_id) {
      context.addIssue({
        code: "custom",
        message: "Evidence JTI must equal the evidence ID",
        path: ["jti"],
      });
    }
    if (bundle.created_at !== bundle.issued_at) {
      context.addIssue({
        code: "custom",
        message: "Evidence creation must equal signed issuance",
        path: ["created_at"],
      });
    }
    if (bundle.user_mandate.mandate_id !== bundle.transaction.mandate_id) {
      context.addIssue({
        code: "custom",
        message: "Evidence mandate proof must bind the transaction mandate",
        path: ["user_mandate", "mandate_id"],
      });
    }
    if (bundle.merchant.checkout_session_id !== bundle.transaction.checkout_session_id) {
      context.addIssue({
        code: "custom",
        message: "Merchant proof must bind the transaction checkout session",
        path: ["merchant", "checkout_session_id"],
      });
    }
    validateMatchingMoney(
      bundle.transaction.amount_subunits,
      bundle.transaction.currency,
      bundle.merchant.checkout_amount_subunits,
      bundle.merchant.checkout_currency,
      ["merchant"],
      context,
    );

    if (bundle.payment !== null) {
      validateTransactionBinding(
        bundle.transaction.transaction_id,
        bundle.payment.transaction_id,
        ["payment", "transaction_id"],
        context,
      );
      validateMatchingMoney(
        bundle.transaction.amount_subunits,
        bundle.transaction.currency,
        bundle.payment.amount_subunits,
        bundle.payment.currency,
        ["payment"],
        context,
      );
    }
    if (bundle.fulfilment !== null) {
      validateTransactionBinding(
        bundle.transaction.transaction_id,
        bundle.fulfilment.transaction_id,
        ["fulfilment", "transaction_id"],
        context,
      );
    }

    validateEvidenceAudit(bundle.audit, bundle.transaction.transaction_id, context);
    validateEvidenceOutcome(bundle, context);
  })
  .readonly();

export type SignedObjectClaims = z.infer<typeof signedObjectClaimsSchema>;
export type MandateAgentBinding = z.infer<typeof mandateAgentBindingSchema>;
export type CheckoutLineItemConstraints = z.infer<typeof checkoutLineItemConstraintsSchema>;
export type OpenCheckoutMandate = z.infer<typeof openCheckoutMandateSchema>;
export type OpenPaymentMandate = z.infer<typeof openPaymentMandateSchema>;
export type ClosedCheckoutMandate = z.infer<typeof closedCheckoutMandateSchema>;
export type ClosedPaymentMandate = z.infer<typeof closedPaymentMandateSchema>;
export type Mandate = z.infer<typeof mandateSchema>;
export type MerchantPaymentProof = z.infer<typeof merchantPaymentProofSchema>;
export type MerchantEvent = z.infer<typeof merchantEventSchema>;
export type AuditActor = z.infer<typeof auditActorSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type Entitlement = z.infer<typeof entitlementSchema>;
export type EvidenceTransaction = z.infer<typeof evidenceTransactionSchema>;
export type MandateProof = z.infer<typeof mandateProofSchema>;
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;

function validateSignedLifetime(
  value: { issued_at: string; expires_at: string },
  context: z.RefinementCtx,
): void {
  if (Date.parse(value.expires_at) <= Date.parse(value.issued_at)) {
    context.addIssue({
      code: "custom",
      message: "Signed-object expiry must be later than issuance",
      path: ["expires_at"],
    });
  }
}

function hasCanonicalUlidSuffix(value: string): boolean {
  return ulidSchema.safeParse(value.slice(value.lastIndexOf("_") + 1)).success;
}

function validateMatchingMoney(
  expectedAmount: number,
  expectedCurrency: string,
  actualAmount: number,
  actualCurrency: string,
  path: readonly (string | number)[],
  context: z.RefinementCtx,
): void {
  if (actualAmount !== expectedAmount || actualCurrency !== expectedCurrency) {
    context.addIssue({
      code: "custom",
      message: "Amount and currency must match the bound transaction",
      path: [...path, "amount_subunits"],
    });
  }
}

function validateTransactionBinding(
  transactionId: string,
  boundTransactionId: string,
  path: readonly (string | number)[],
  context: z.RefinementCtx,
): void {
  if (boundTransactionId !== transactionId) {
    context.addIssue({
      code: "custom",
      message: "Proof must bind the evidence transaction ID",
      path: [...path],
    });
  }
}

function validateEvidenceAudit(
  audit: z.infer<typeof evidenceAuditSchema>,
  transactionId: string,
  context: z.RefinementCtx,
): void {
  if (audit.event_count !== audit.events.length) {
    context.addIssue({
      code: "custom",
      message: "Audit event count must equal the included event count",
      path: ["audit", "event_count"],
    });
  }

  for (const [index, event] of audit.events.entries()) {
    if (event.transaction_id !== transactionId) {
      context.addIssue({
        code: "custom",
        message: "Every audit event must bind the evidence transaction",
        path: ["audit", "events", index, "transaction_id"],
      });
    }
    if (event.sequence !== index) {
      context.addIssue({
        code: "custom",
        message: "Audit sequence must be contiguous and zero-based",
        path: ["audit", "events", index, "sequence"],
      });
    }
    if (index > 0 && event.previous_event_hash !== audit.events[index - 1]?.event_hash) {
      context.addIssue({
        code: "custom",
        message: "Audit previous hash must match the preceding event hash",
        path: ["audit", "events", index, "previous_event_hash"],
      });
    }
  }

  if (!uniqueStrings(audit.events.map((event) => event.jti))) {
    context.addIssue({
      code: "custom",
      message: "Audit event JTIs must be unique",
      path: ["audit", "events"],
    });
  }
  if (!uniqueStrings(audit.events.map((event) => event.event_hash))) {
    context.addIssue({
      code: "custom",
      message: "Audit event hashes must be unique",
      path: ["audit", "events"],
    });
  }

  if (audit.events[0]?.event_hash !== audit.root_event_hash) {
    context.addIssue({
      code: "custom",
      message: "Audit root hash must match the first event",
      path: ["audit", "root_event_hash"],
    });
  }
  if (audit.events.at(-1)?.event_hash !== audit.final_event_hash) {
    context.addIssue({
      code: "custom",
      message: "Audit final hash must match the last event",
      path: ["audit", "final_event_hash"],
    });
  }
}

function validateEvidenceOutcome(
  bundle: z.infer<typeof evidenceBundleSchema>,
  context: z.RefinementCtx,
): void {
  if (bundle.transaction.state === "EVIDENCE_READY") {
    if (bundle.payment === null || bundle.fulfilment === null) {
      context.addIssue({
        code: "custom",
        message: "Completed evidence requires payment and fulfilment proofs",
        path: [bundle.payment === null ? "payment" : "fulfilment"],
      });
      return;
    }
    if (!bundle.payment.captured || !bundle.payment.order_paid) {
      context.addIssue({
        code: "custom",
        message: "Completed evidence requires captured and paid payment proof",
        path: ["payment"],
      });
    }
    if (
      !bundle.payment.webhook_signature_verified &&
      !bundle.payment.verification_sources.includes("SERVER_FETCH")
    ) {
      context.addIssue({
        code: "custom",
        message: "Completed evidence requires webhook or server-fetch reconciliation proof",
        path: ["payment", "verification_sources"],
      });
    }
    if (
      !bundle.fulfilment.entitlement_consumed ||
      !bundle.fulfilment.merchant_receipt_signature_verified
    ) {
      context.addIssue({
        code: "custom",
        message: "Completed evidence requires consumed entitlement and verified receipt",
        path: ["fulfilment"],
      });
    }
    if (!bundle.merchant.checkout_signature_verified || !bundle.merchant.offer_signature_verified) {
      context.addIssue({
        code: "custom",
        message: "Completed evidence requires verified merchant checkout and offer proofs",
        path: ["merchant"],
      });
    }
    if (bundle.policy.decision === "BLOCK" || bundle.risk.outcome === "BLOCK") {
      context.addIssue({
        code: "custom",
        message: "Completed evidence cannot contain a blocking policy or risk decision",
        path: [bundle.policy.decision === "BLOCK" ? "policy" : "risk"],
      });
    }
  }

  if (bundle.transaction.state === "BLOCKED") {
    if (
      bundle.policy.decision !== "BLOCK" ||
      bundle.payment !== null ||
      bundle.fulfilment !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Blocked evidence requires a block decision and no payment or fulfilment proof",
        path: ["transaction", "state"],
      });
    }
  }

  if (bundle.transaction.state === "PAYMENT_FAILED") {
    if (bundle.payment === null || bundle.payment.captured || bundle.fulfilment !== null) {
      context.addIssue({
        code: "custom",
        message: "Failed-payment evidence requires uncaptured payment proof and no fulfilment",
        path: ["transaction", "state"],
      });
    }
  }
}
