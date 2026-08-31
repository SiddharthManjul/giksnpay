export const POLICY_RULESET_VERSION = "1.0.0" as const;

export type PolicyReasonCode =
  | "MANDATE_NOT_FOUND"
  | "MANDATE_NOT_ACTIVE"
  | "MANDATE_EXPIRED"
  | "AGENT_MISMATCH"
  | "AGENT_VERSION_MISMATCH"
  | "MERCHANT_NOT_APPROVED"
  | "MERCHANT_NOT_ALLOWED"
  | "CATEGORY_NOT_ALLOWED"
  | "SERVICE_NOT_ALLOWED"
  | "OFFER_SIGNATURE_INVALID"
  | "OFFER_EXPIRED"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "PAYMENT_RAIL_NOT_ALLOWED"
  | "AMOUNT_EXCEEDED"
  | "BUDGET_EXCEEDED"
  | "ATTEMPT_LIMIT_EXCEEDED"
  | "NONCE_REPLAYED"
  | "IDEMPOTENCY_MISMATCH"
  | "RISK_BLOCKED"
  | "APPROVAL_REQUIRED";

export interface PolicyReason {
  readonly code: PolicyReasonCode;
  readonly evidence: Readonly<Record<string, boolean | number | string>>;
  readonly severity: "HIGH" | "MEDIUM";
}

export interface PolicyEvaluationInput {
  readonly agentMatches: boolean;
  readonly agentVersionMatches: boolean;
  readonly amountMatches: boolean;
  readonly amountSubunits: number;
  readonly approvalPresent: boolean;
  readonly approvalThresholdSubunits: number;
  readonly attemptCount: number;
  readonly categoryAllowed: boolean;
  readonly currency: string;
  readonly expectedCurrency: string;
  readonly idempotencyInputMatches: boolean;
  readonly mandateExists: boolean;
  readonly mandateExpiresAtEpochMs: number;
  readonly mandateStatus: "ACTIVE" | "DRAFT" | "EXHAUSTED" | "EXPIRED" | "REVOKED" | "SUSPENDED";
  readonly maxAttempts: number;
  readonly maxTransactionSubunits: number;
  readonly merchantAllowed: boolean;
  readonly merchantApproved: boolean;
  readonly nonceUnused: boolean;
  readonly nowEpochMs: number;
  readonly offerExpiresAtEpochMs: number;
  readonly offerSignatureValid: boolean;
  readonly paymentRail: string;
  readonly paymentRailAllowed: boolean;
  readonly reservedSubunits: number;
  readonly riskOutcome: "ALLOW" | "BLOCK" | "REVIEW";
  readonly serviceAllowed: boolean;
  readonly spentSubunits: number;
  readonly totalBudgetSubunits: number;
}

export type PolicyDecision =
  | Readonly<{
      decision: "ALLOW";
      reasons: readonly PolicyReason[];
      reservationAmount: number;
      rulesetVersion: typeof POLICY_RULESET_VERSION;
    }>
  | Readonly<{
      decision: "APPROVAL_REQUIRED";
      reasons: readonly PolicyReason[];
      rulesetVersion: typeof POLICY_RULESET_VERSION;
    }>
  | Readonly<{
      decision: "BLOCK";
      reasons: readonly PolicyReason[];
      rulesetVersion: typeof POLICY_RULESET_VERSION;
    }>;

/**
 * Executes the numbered MindPay policy rules in stable order. The input contains only verified,
 * deterministic facts; there is intentionally no model-output field capable of changing a result.
 */
export function evaluatePolicy(input: PolicyEvaluationInput): PolicyDecision {
  assertSafePolicyInput(input);
  const reasons: PolicyReason[] = [];

  blockUnless(reasons, input.mandateExists, "MANDATE_NOT_FOUND", {});
  blockUnless(reasons, input.mandateStatus === "ACTIVE", "MANDATE_NOT_ACTIVE", {
    status: input.mandateStatus,
  });
  blockUnless(reasons, input.mandateExpiresAtEpochMs > input.nowEpochMs, "MANDATE_EXPIRED", {
    expiresAtEpochMs: input.mandateExpiresAtEpochMs,
    nowEpochMs: input.nowEpochMs,
  });
  blockUnless(reasons, input.agentMatches, "AGENT_MISMATCH", {});
  blockUnless(reasons, input.agentVersionMatches, "AGENT_VERSION_MISMATCH", {});
  blockUnless(reasons, input.merchantApproved, "MERCHANT_NOT_APPROVED", {});
  blockUnless(reasons, input.merchantAllowed, "MERCHANT_NOT_ALLOWED", {});
  blockUnless(reasons, input.categoryAllowed, "CATEGORY_NOT_ALLOWED", {});
  blockUnless(reasons, input.serviceAllowed, "SERVICE_NOT_ALLOWED", {});
  blockUnless(reasons, input.offerSignatureValid, "OFFER_SIGNATURE_INVALID", {});
  blockUnless(reasons, input.offerExpiresAtEpochMs > input.nowEpochMs, "OFFER_EXPIRED", {
    expiresAtEpochMs: input.offerExpiresAtEpochMs,
    nowEpochMs: input.nowEpochMs,
  });
  blockUnless(reasons, input.amountMatches, "AMOUNT_MISMATCH", {
    amountSubunits: input.amountSubunits,
  });
  blockUnless(reasons, input.currency === input.expectedCurrency, "CURRENCY_MISMATCH", {
    actual: input.currency,
    expected: input.expectedCurrency,
  });
  blockUnless(reasons, input.paymentRailAllowed, "PAYMENT_RAIL_NOT_ALLOWED", {
    rail: input.paymentRail,
  });
  blockUnless(reasons, input.amountSubunits <= input.maxTransactionSubunits, "AMOUNT_EXCEEDED", {
    amountSubunits: input.amountSubunits,
    maximumSubunits: input.maxTransactionSubunits,
  });
  blockUnless(
    reasons,
    input.spentSubunits + input.reservedSubunits + input.amountSubunits <=
      input.totalBudgetSubunits,
    "BUDGET_EXCEEDED",
    {
      amountSubunits: input.amountSubunits,
      budgetSubunits: input.totalBudgetSubunits,
      reservedSubunits: input.reservedSubunits,
      spentSubunits: input.spentSubunits,
    },
  );
  blockUnless(reasons, input.attemptCount < input.maxAttempts, "ATTEMPT_LIMIT_EXCEEDED", {
    attemptCount: input.attemptCount,
    maxAttempts: input.maxAttempts,
  });
  blockUnless(reasons, input.nonceUnused, "NONCE_REPLAYED", {});
  blockUnless(reasons, input.idempotencyInputMatches, "IDEMPOTENCY_MISMATCH", {});
  blockUnless(reasons, input.riskOutcome !== "BLOCK", "RISK_BLOCKED", {
    riskOutcome: input.riskOutcome,
  });

  if (reasons.length > 0) {
    return frozenDecision({
      decision: "BLOCK",
      reasons,
      rulesetVersion: POLICY_RULESET_VERSION,
    });
  }

  if (input.amountSubunits > input.approvalThresholdSubunits && !input.approvalPresent) {
    return frozenDecision({
      decision: "APPROVAL_REQUIRED",
      reasons: [
        reason("APPROVAL_REQUIRED", "MEDIUM", {
          amountSubunits: input.amountSubunits,
          thresholdSubunits: input.approvalThresholdSubunits,
        }),
      ],
      rulesetVersion: POLICY_RULESET_VERSION,
    });
  }

  return frozenDecision({
    decision: "ALLOW",
    reasons: [],
    reservationAmount: input.amountSubunits,
    rulesetVersion: POLICY_RULESET_VERSION,
  });
}

function blockUnless(
  reasons: PolicyReason[],
  condition: boolean,
  code: PolicyReasonCode,
  evidence: PolicyReason["evidence"],
): void {
  if (!condition) reasons.push(reason(code, "HIGH", evidence));
}

function reason(
  code: PolicyReasonCode,
  severity: PolicyReason["severity"],
  evidence: PolicyReason["evidence"],
): PolicyReason {
  return Object.freeze({ code, evidence: Object.freeze(evidence), severity });
}

function frozenDecision<TDecision extends PolicyDecision>(decision: TDecision): TDecision {
  Object.freeze(decision.reasons);
  return Object.freeze(decision);
}

function assertSafePolicyInput(input: PolicyEvaluationInput): void {
  const integers = [
    input.amountSubunits,
    input.approvalThresholdSubunits,
    input.attemptCount,
    input.mandateExpiresAtEpochMs,
    input.maxAttempts,
    input.maxTransactionSubunits,
    input.nowEpochMs,
    input.offerExpiresAtEpochMs,
    input.reservedSubunits,
    input.spentSubunits,
    input.totalBudgetSubunits,
  ];
  if (integers.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError("Policy integer inputs must be non-negative safe integers");
  }
}
