export const RISK_RULESET_VERSION = "1.0.0" as const;

export type RiskReasonCode =
  | "MERCHANT_NOT_APPROVED"
  | "MERCHANT_SIGNATURE_INVALID"
  | "MERCHANT_KEY_UNKNOWN"
  | "CHECKOUT_HASH_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "PAYEE_MISMATCH"
  | "OFFER_EXPIRED"
  | "NONCE_REPLAYED"
  | "DUPLICATE_LOGICAL_TRANSACTION"
  | "TOOL_NOT_APPROVED"
  | "SERVICE_VERSION_CHANGED"
  | "PAYMENT_RAIL_NOT_ALLOWED"
  | "MANDATE_EXCEEDED"
  | "MERCHANT_ENDPOINT_CHANGED"
  | "ENTITLEMENT_REPLAYED"
  | "RAZORPAY_CALLBACK_MALFORMED"
  | "RAZORPAY_WEBHOOK_SIGNATURE_INVALID"
  | "AMOUNT_ABOVE_AUTOMATIC_THRESHOLD"
  | "FIRST_PURCHASE_NEW_MERCHANT"
  | "UNUSUAL_AMOUNT_INCREASE"
  | "REPEATED_PAYMENT_FAILURES"
  | "FULFILMENT_DEGRADED"
  | "CATALOG_CHANGED_RECENTLY"
  | "MODEL_SIGNAL_RECORDED";

export interface ModelRiskSignal {
  readonly label: string;
  readonly score: number;
}

export interface RiskEvaluationInput {
  readonly amountAboveAutomaticThreshold: boolean;
  readonly amountMatches: boolean;
  readonly callbackWellFormed: boolean;
  readonly catalogChangedRecently: boolean;
  readonly checkoutHashMatches: boolean;
  readonly currencyMatches: boolean;
  readonly duplicateLogicalTransaction: boolean;
  readonly endpointUnchanged: boolean;
  readonly entitlementUnused: boolean;
  readonly firstPurchaseNewMerchant: boolean;
  readonly fulfilmentDegraded: boolean;
  readonly mandateWithinLimits: boolean;
  readonly merchantApproved: boolean;
  readonly merchantKeyKnown: boolean;
  readonly merchantSignatureValid: boolean;
  readonly modelSignal?: ModelRiskSignal;
  readonly nonceUnused: boolean;
  readonly payeeMatches: boolean;
  readonly paymentFailures: number;
  readonly paymentRailAllowed: boolean;
  readonly serviceVersionUnchanged: boolean;
  readonly offerUnexpired: boolean;
  readonly toolApproved: boolean;
  readonly unusualAmountIncrease: boolean;
  readonly webhookSignatureValid: boolean;
}

export interface RiskReason {
  readonly code: RiskReasonCode;
  readonly evidence: Readonly<Record<string, boolean | number | string>>;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
}

export interface RiskOutcome {
  readonly outcome: "ALLOW" | "BLOCK" | "REVIEW";
  readonly reasons: readonly RiskReason[];
  readonly rulesetVersion: typeof RISK_RULESET_VERSION;
}

/** Optional model data is retained as evidence only and never participates in outcome selection. */
export function evaluateRisk(input: RiskEvaluationInput): RiskOutcome {
  if (!Number.isSafeInteger(input.paymentFailures) || input.paymentFailures < 0) {
    throw new RangeError("paymentFailures must be a non-negative safe integer");
  }
  const blocks: RiskReason[] = [];
  const reviews: RiskReason[] = [];

  blockUnless(blocks, input.merchantApproved, "MERCHANT_NOT_APPROVED");
  blockUnless(blocks, input.merchantSignatureValid, "MERCHANT_SIGNATURE_INVALID");
  blockUnless(blocks, input.merchantKeyKnown, "MERCHANT_KEY_UNKNOWN");
  blockUnless(blocks, input.checkoutHashMatches, "CHECKOUT_HASH_MISMATCH");
  blockUnless(blocks, input.amountMatches, "AMOUNT_MISMATCH");
  blockUnless(blocks, input.currencyMatches, "CURRENCY_MISMATCH");
  blockUnless(blocks, input.payeeMatches, "PAYEE_MISMATCH");
  blockUnless(blocks, input.offerUnexpired, "OFFER_EXPIRED");
  blockUnless(blocks, input.nonceUnused, "NONCE_REPLAYED");
  blockUnless(blocks, !input.duplicateLogicalTransaction, "DUPLICATE_LOGICAL_TRANSACTION");
  blockUnless(blocks, input.toolApproved, "TOOL_NOT_APPROVED");
  blockUnless(blocks, input.serviceVersionUnchanged, "SERVICE_VERSION_CHANGED");
  blockUnless(blocks, input.paymentRailAllowed, "PAYMENT_RAIL_NOT_ALLOWED");
  blockUnless(blocks, input.mandateWithinLimits, "MANDATE_EXCEEDED");
  blockUnless(blocks, input.endpointUnchanged, "MERCHANT_ENDPOINT_CHANGED");
  blockUnless(blocks, input.entitlementUnused, "ENTITLEMENT_REPLAYED");
  blockUnless(blocks, input.callbackWellFormed, "RAZORPAY_CALLBACK_MALFORMED");
  blockUnless(blocks, input.webhookSignatureValid, "RAZORPAY_WEBHOOK_SIGNATURE_INVALID");

  reviewIf(reviews, input.amountAboveAutomaticThreshold, "AMOUNT_ABOVE_AUTOMATIC_THRESHOLD");
  reviewIf(reviews, input.firstPurchaseNewMerchant, "FIRST_PURCHASE_NEW_MERCHANT");
  reviewIf(reviews, input.unusualAmountIncrease, "UNUSUAL_AMOUNT_INCREASE");
  reviewIf(reviews, input.paymentFailures >= 2, "REPEATED_PAYMENT_FAILURES", {
    paymentFailures: input.paymentFailures,
  });
  reviewIf(reviews, input.fulfilmentDegraded, "FULFILMENT_DEGRADED");
  reviewIf(reviews, input.catalogChangedRecently, "CATALOG_CHANGED_RECENTLY");

  const reasons = blocks.length > 0 ? blocks : reviews;
  if (input.modelSignal !== undefined) {
    if (
      !Number.isFinite(input.modelSignal.score) ||
      input.modelSignal.score < 0 ||
      input.modelSignal.score > 1
    ) {
      throw new RangeError("Model risk score must be between zero and one");
    }
    reasons.push(
      riskReason("MODEL_SIGNAL_RECORDED", "INFO", {
        label: input.modelSignal.label,
        score: input.modelSignal.score,
      }),
    );
  }

  return Object.freeze({
    outcome: blocks.length > 0 ? "BLOCK" : reviews.length > 0 ? "REVIEW" : "ALLOW",
    reasons: Object.freeze(reasons),
    rulesetVersion: RISK_RULESET_VERSION,
  });
}

function blockUnless(reasons: RiskReason[], condition: boolean, code: RiskReasonCode): void {
  if (!condition) reasons.push(riskReason(code, "CRITICAL", {}));
}

function reviewIf(
  reasons: RiskReason[],
  condition: boolean,
  code: RiskReasonCode,
  evidence: RiskReason["evidence"] = {},
): void {
  if (condition) reasons.push(riskReason(code, "MEDIUM", evidence));
}

function riskReason(
  code: RiskReasonCode,
  severity: RiskReason["severity"],
  evidence: RiskReason["evidence"],
): RiskReason {
  return Object.freeze({ code, evidence: Object.freeze(evidence), severity });
}
