import { describe, expect, it } from "vitest";
import { evaluateRisk, type RiskEvaluationInput } from "./risk";

const BASE: RiskEvaluationInput = Object.freeze({
  amountAboveAutomaticThreshold: false,
  amountMatches: true,
  callbackWellFormed: true,
  catalogChangedRecently: false,
  checkoutHashMatches: true,
  currencyMatches: true,
  duplicateLogicalTransaction: false,
  endpointUnchanged: true,
  entitlementUnused: true,
  firstPurchaseNewMerchant: false,
  fulfilmentDegraded: false,
  mandateWithinLimits: true,
  merchantApproved: true,
  merchantKeyKnown: true,
  merchantSignatureValid: true,
  nonceUnused: true,
  offerUnexpired: true,
  payeeMatches: true,
  paymentFailures: 0,
  paymentRailAllowed: true,
  serviceVersionUnchanged: true,
  toolApproved: true,
  unusualAmountIncrease: false,
  webhookSignatureValid: true,
});

describe("deterministic risk", () => {
  it("keeps deterministic blocks authoritative regardless of a favorable model signal", () => {
    expect(
      evaluateRisk({
        ...BASE,
        merchantSignatureValid: false,
        modelSignal: { label: "safe", score: 0 },
      }),
    ).toMatchObject({
      outcome: "BLOCK",
      reasons: [
        { code: "MERCHANT_SIGNATURE_INVALID", severity: "CRITICAL" },
        { code: "MODEL_SIGNAL_RECORDED", severity: "INFO" },
      ],
      rulesetVersion: "1.0.0",
    });
  });

  it("never silently upgrades a deterministic review to allow", () => {
    const result = evaluateRisk({
      ...BASE,
      amountAboveAutomaticThreshold: true,
      modelSignal: { label: "safe", score: 0 },
    });
    expect(result.outcome).toBe("REVIEW");
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "AMOUNT_ABOVE_AUTOMATIC_THRESHOLD",
      "MODEL_SIGNAL_RECORDED",
    ]);
  });
});
