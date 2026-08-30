import type { MerchantVerificationStatus } from "@mindpay/contracts";

const verificationTransitions = {
  APPROVED: ["REVIEW_REQUIRED", "QUARANTINED"],
  CATALOG_VALIDATED: ["PAYMENT_CONFIGURATION_VERIFIED", "REVIEW_REQUIRED", "QUARANTINED"],
  DOMAIN_VERIFIED: ["KEY_VERIFIED", "REVIEW_REQUIRED", "QUARANTINED"],
  KEY_VERIFIED: ["CATALOG_VALIDATED", "REVIEW_REQUIRED", "QUARANTINED"],
  PAYMENT_CONFIGURATION_VERIFIED: ["APPROVED", "REVIEW_REQUIRED", "QUARANTINED"],
  QUARANTINED: ["DOMAIN_VERIFIED", "REVIEW_REQUIRED"],
  REVIEW_REQUIRED: ["DOMAIN_VERIFIED", "QUARANTINED"],
  SUBMITTED: ["DOMAIN_VERIFIED", "REVIEW_REQUIRED", "QUARANTINED"],
} as const satisfies Readonly<
  Record<MerchantVerificationStatus, readonly MerchantVerificationStatus[]>
>;

const approvalChecks = Object.freeze([
  "DOMAIN_VERIFIED",
  "KEY_VERIFIED",
  "CATALOG_VALIDATED",
  "PAYMENT_CONFIGURATION_VERIFIED",
  "APPROVED",
] as const);

export function merchantVerificationTransitionPath(
  previous: MerchantVerificationStatus,
  next: MerchantVerificationStatus,
): readonly MerchantVerificationStatus[] {
  if (previous === next) return Object.freeze([previous]);
  if (next === "APPROVED") {
    const currentCheckIndex = approvalChecks.indexOf(previous as (typeof approvalChecks)[number]);
    const path =
      currentCheckIndex >= 0
        ? approvalChecks.slice(currentCheckIndex + 1)
        : previous === "SUBMITTED" || previous === "REVIEW_REQUIRED" || previous === "QUARANTINED"
          ? approvalChecks
          : [];
    validatePath(previous, path);
    return Object.freeze([...path]);
  }
  validatePath(previous, [next]);
  return Object.freeze([next]);
}

function validatePath(
  initial: MerchantVerificationStatus,
  path: readonly MerchantVerificationStatus[],
): void {
  let current = initial;
  for (const next of path) {
    const allowed: readonly MerchantVerificationStatus[] = verificationTransitions[current];
    if (!allowed.includes(next)) {
      throw new MerchantVerificationTransitionError(current, next);
    }
    current = next;
  }
}

export class MerchantVerificationTransitionError extends Error {
  constructor(previous: MerchantVerificationStatus, next: MerchantVerificationStatus) {
    super(`Illegal merchant verification transition: ${previous} -> ${next}`);
    this.name = "MerchantVerificationTransitionError";
  }
}
