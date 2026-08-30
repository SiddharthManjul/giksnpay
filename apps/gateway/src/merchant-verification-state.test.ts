import { describe, expect, it } from "vitest";
import {
  MerchantVerificationTransitionError,
  merchantVerificationTransitionPath,
} from "./merchant-verification-state";

describe("merchant verification state machine", () => {
  it("requires every approval check in order", () => {
    expect(merchantVerificationTransitionPath("SUBMITTED", "APPROVED")).toEqual([
      "DOMAIN_VERIFIED",
      "KEY_VERIFIED",
      "CATALOG_VALIDATED",
      "PAYMENT_CONFIGURATION_VERIFIED",
      "APPROVED",
    ]);
    expect(merchantVerificationTransitionPath("REVIEW_REQUIRED", "APPROVED")).toEqual([
      "DOMAIN_VERIFIED",
      "KEY_VERIFIED",
      "CATALOG_VALIDATED",
      "PAYMENT_CONFIGURATION_VERIFIED",
      "APPROVED",
    ]);
  });

  it("permits material review and immediate quarantine but rejects skipped partial states", () => {
    expect(merchantVerificationTransitionPath("APPROVED", "REVIEW_REQUIRED")).toEqual([
      "REVIEW_REQUIRED",
    ]);
    expect(merchantVerificationTransitionPath("APPROVED", "QUARANTINED")).toEqual(["QUARANTINED"]);
    expect(() => merchantVerificationTransitionPath("APPROVED", "KEY_VERIFIED")).toThrow(
      MerchantVerificationTransitionError,
    );
  });
});
