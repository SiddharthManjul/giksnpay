import type {
  ClosedCheckoutMandate,
  ClosedPaymentMandate,
  OpenCheckoutMandate,
  OpenPaymentMandate,
} from "@mindpay/contracts";

/** MindPay is AP2-aligned. This label deliberately does not claim AP2 or SD-JWT conformance. */
export const AP2_ALIGNMENT_LABEL = "AP2_ALIGNED_NOT_CONFORMANT" as const;
export const AP2_MAPPING_VERSION = "mindpay.ap2.mapping.1" as const;

export interface Ap2AlignedMandateMapping {
  readonly alignment: typeof AP2_ALIGNMENT_LABEL;
  readonly mappingVersion: typeof AP2_MAPPING_VERSION;
  readonly mindpaySchemaVersion:
    | OpenCheckoutMandate["schema_version"]
    | OpenPaymentMandate["schema_version"]
    | ClosedCheckoutMandate["schema_version"]
    | ClosedPaymentMandate["schema_version"];
  readonly ap2Concept: "IntentMandate" | "CartMandate" | "PaymentMandate";
  readonly bindings: Readonly<Record<string, unknown>>;
}

export function mapOpenCheckoutMandateToAp2(
  mandate: OpenCheckoutMandate,
): Ap2AlignedMandateMapping {
  return mapping(mandate.schema_version, "IntentMandate", {
    agent: mandate.agent,
    allowed_categories: mandate.allowed_categories,
    allowed_merchants: mandate.allowed_merchants,
    allowed_services: mandate.allowed_services,
    expiry: mandate.expires_at,
    line_item_constraints: mandate.line_item_constraints,
    nonce: mandate.nonce,
    principal: mandate.user_id,
  });
}

export function mapOpenPaymentMandateToAp2(mandate: OpenPaymentMandate): Ap2AlignedMandateMapping {
  return mapping(mandate.schema_version, "PaymentMandate", {
    agent: mandate.agent,
    allowed_payees: mandate.allowed_payees,
    allowed_rails: mandate.allowed_rails,
    approval_threshold_subunits: mandate.approval_threshold_subunits,
    currency: mandate.currency,
    expiry: mandate.expires_at,
    max_attempts_per_transaction: mandate.max_attempts_per_transaction,
    max_transaction_subunits: mandate.max_transaction_subunits,
    max_transactions: mandate.max_transactions,
    nonce: mandate.nonce,
    principal: mandate.user_id,
    total_budget_subunits: mandate.total_budget_subunits,
  });
}

export function mapClosedCheckoutMandateToAp2(
  mandate: ClosedCheckoutMandate,
): Ap2AlignedMandateMapping {
  return mapping(mandate.schema_version, "CartMandate", {
    checkout_hash: mandate.checkout_hash,
    checkout_session_id: mandate.checkout_session_id,
    currency: mandate.currency,
    line_items: mandate.line_items,
    merchant_id: mandate.merchant_id,
    offer_hash: mandate.offer_hash,
    open_mandate_hash: mandate.open_checkout_mandate_hash,
    total_subunits: mandate.total_subunits,
  });
}

export function mapClosedPaymentMandateToAp2(
  mandate: ClosedPaymentMandate,
): Ap2AlignedMandateMapping {
  return mapping(mandate.schema_version, "PaymentMandate", {
    amount_subunits: mandate.amount_subunits,
    checkout_hash: mandate.checkout_hash,
    closed_checkout_mandate_hash: mandate.closed_checkout_mandate_hash,
    currency: mandate.currency,
    open_mandate_hash: mandate.open_payment_mandate_hash,
    payee: mandate.payee,
    payment_attempt: mandate.payment_attempt,
    payment_rail: mandate.payment_rail,
  });
}

function mapping(
  mindpaySchemaVersion: Ap2AlignedMandateMapping["mindpaySchemaVersion"],
  ap2Concept: Ap2AlignedMandateMapping["ap2Concept"],
  bindings: Readonly<Record<string, unknown>>,
): Ap2AlignedMandateMapping {
  return Object.freeze({
    alignment: AP2_ALIGNMENT_LABEL,
    ap2Concept,
    bindings: Object.freeze(bindings),
    mappingVersion: AP2_MAPPING_VERSION,
    mindpaySchemaVersion,
  });
}
