import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluatePolicy, type PolicyEvaluationInput } from "./policy";

const BASE: PolicyEvaluationInput = Object.freeze({
  agentMatches: true,
  agentVersionMatches: true,
  amountMatches: true,
  amountSubunits: 29_900,
  approvalPresent: false,
  approvalThresholdSubunits: 35_000,
  attemptCount: 0,
  categoryAllowed: true,
  currency: "INR",
  expectedCurrency: "INR",
  idempotencyInputMatches: true,
  mandateExists: true,
  mandateExpiresAtEpochMs: 2_000,
  mandateStatus: "ACTIVE",
  maxAttempts: 2,
  maxTransactionSubunits: 50_000,
  merchantAllowed: true,
  merchantApproved: true,
  nonceUnused: true,
  nowEpochMs: 1_000,
  offerExpiresAtEpochMs: 1_500,
  offerSignatureValid: true,
  paymentRail: "razorpay:test",
  paymentRailAllowed: true,
  reservedSubunits: 0,
  riskOutcome: "ALLOW",
  serviceAllowed: true,
  spentSubunits: 0,
  totalBudgetSubunits: 100_000,
});

describe("deterministic policy", () => {
  it("allows ₹299, requires approval for ₹449, and blocks ₹799 before any order hook", () => {
    expect(evaluatePolicy(BASE)).toMatchObject({ decision: "ALLOW", reservationAmount: 29_900 });
    expect(evaluatePolicy({ ...BASE, amountSubunits: 44_900 })).toMatchObject({
      decision: "APPROVAL_REQUIRED",
      reasons: [{ code: "APPROVAL_REQUIRED" }],
    });
    expect(evaluatePolicy({ ...BASE, amountSubunits: 79_900 })).toMatchObject({
      decision: "BLOCK",
      reasons: [{ code: "AMOUNT_EXCEEDED" }],
    });
  });

  it("returns block reasons in the documented stable rule order", () => {
    const result = evaluatePolicy({
      ...BASE,
      amountMatches: false,
      currency: "USD",
      mandateExpiresAtEpochMs: 999,
      mandateStatus: "REVOKED",
      merchantAllowed: false,
      nonceUnused: false,
      offerSignatureValid: false,
      paymentRailAllowed: false,
      riskOutcome: "BLOCK",
      serviceAllowed: false,
    });
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "MANDATE_NOT_ACTIVE",
      "MANDATE_EXPIRED",
      "MERCHANT_NOT_ALLOWED",
      "SERVICE_NOT_ALLOWED",
      "OFFER_SIGNATURE_INVALID",
      "AMOUNT_MISMATCH",
      "CURRENCY_MISMATCH",
      "PAYMENT_RAIL_NOT_ALLOWED",
      "NONCE_REPLAYED",
      "RISK_BLOCKED",
    ]);
  });

  it("never allows a reservation that would exceed total budget", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 100_000, min: 0 }),
        fc.integer({ max: 100_000, min: 0 }),
        fc.integer({ max: 50_000, min: 0 }),
        (spent, reserved, amount) => {
          const result = evaluatePolicy({
            ...BASE,
            amountSubunits: amount,
            reservedSubunits: reserved,
            spentSubunits: spent,
          });
          if (spent + reserved + amount > BASE.totalBudgetSubunits) {
            expect(result).toMatchObject({ decision: "BLOCK" });
            expect(result.reasons.map((reason) => reason.code)).toContain("BUDGET_EXCEEDED");
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
