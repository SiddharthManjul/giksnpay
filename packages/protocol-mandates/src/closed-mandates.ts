import {
  type CheckoutLineItem,
  type ClosedCheckoutMandate,
  type ClosedPaymentMandate,
  closedCheckoutMandateSchema,
  closedPaymentMandateSchema,
  type OpenCheckoutMandate,
  type OpenPaymentMandate,
} from "@mindpay/contracts";
import {
  type Es256CanonicalSignature,
  type Es256SigningKey,
  sha256CanonicalJsonHex,
  signCanonicalJsonEs256,
} from "@mindpay/crypto";

export interface SignedClosedMandate<TMandate> {
  readonly mandate: TMandate;
  readonly payloadHash: string;
  readonly signature: Es256CanonicalSignature;
}

interface ClosedMandateClaimsInput {
  readonly audience: string;
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly issuer: string;
  readonly mandateId: string;
  readonly nonce: string;
}

export interface CloseCheckoutMandateInput extends ClosedMandateClaimsInput {
  readonly checkoutHash: string;
  readonly checkoutSessionId: string;
  readonly currency: string;
  readonly lineItems: readonly CheckoutLineItem[];
  readonly merchantId: string;
  readonly offerHash: string;
  readonly offerId: string;
  readonly openMandate: OpenCheckoutMandate;
  readonly totalSubunits: number;
}

export interface ClosePaymentMandateInput extends ClosedMandateClaimsInput {
  readonly amountSubunits: number;
  readonly checkoutHash: string;
  readonly checkoutSessionId: string;
  readonly closedCheckoutMandateHash: string;
  readonly openMandate: OpenPaymentMandate;
  readonly payee: string;
  readonly paymentAttempt: number;
  readonly paymentRail: string;
}

export type ClosedMandateConstraintFailure =
  | "AGENT_MISMATCH"
  | "AGENT_VERSION_MISMATCH"
  | "AMOUNT_EXCEEDED"
  | "CHECKOUT_HASH_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "EXPIRY_EXPANDED"
  | "LINE_ITEM_COUNT_EXCEEDED"
  | "MERCHANT_NOT_ALLOWED"
  | "OPEN_MANDATE_HASH_MISMATCH"
  | "OPEN_MANDATE_ID_MISMATCH"
  | "PAYEE_NOT_ALLOWED"
  | "PAYMENT_ATTEMPTS_EXCEEDED"
  | "QUANTITY_EXCEEDED"
  | "RAIL_NOT_ALLOWED"
  | "SERVICE_NOT_ALLOWED"
  | "UNIT_PRICE_EXCEEDED"
  | "USER_MISMATCH";

export type ClosedMandateConstraintResult =
  | Readonly<{ valid: true }>
  | Readonly<{ reasons: readonly ClosedMandateConstraintFailure[]; valid: false }>;

export async function closeCheckoutMandate(
  input: CloseCheckoutMandateInput,
  signingKey: Es256SigningKey,
  nowEpochMs = Date.now(),
): Promise<SignedClosedMandate<ClosedCheckoutMandate>> {
  const openHash = await sha256CanonicalJsonHex(input.openMandate);
  const mandate = closedCheckoutMandateSchema.parse({
    agent_id: input.openMandate.agent.agent_id,
    agent_version: input.openMandate.agent.agent_version,
    audience: input.audience,
    checkout_hash: input.checkoutHash,
    checkout_session_id: input.checkoutSessionId,
    currency: input.currency,
    expires_at: input.expiresAt,
    issued_at: input.issuedAt,
    issuer: input.issuer,
    kid: signingKey.kid,
    line_items: input.lineItems,
    mandate_id: input.mandateId,
    merchant_id: input.merchantId,
    nonce: input.nonce,
    offer_hash: input.offerHash,
    offer_id: input.offerId,
    open_checkout_mandate_hash: openHash,
    open_checkout_mandate_id: input.openMandate.mandate_id,
    schema_version: "mindpay.mandate.checkout.closed.1",
    total_subunits: input.totalSubunits,
    user_id: input.openMandate.user_id,
  });
  assertNoConstraintExpansion(
    await verifyClosedMandateConstraints({
      closedCheckout: mandate,
      openCheckout: input.openMandate,
    }),
  );
  return signed(mandate, signingKey, nowEpochMs);
}

export async function closePaymentMandate(
  input: ClosePaymentMandateInput,
  signingKey: Es256SigningKey,
  nowEpochMs = Date.now(),
): Promise<SignedClosedMandate<ClosedPaymentMandate>> {
  const openHash = await sha256CanonicalJsonHex(input.openMandate);
  const mandate = closedPaymentMandateSchema.parse({
    agent_id: input.openMandate.agent.agent_id,
    agent_version: input.openMandate.agent.agent_version,
    amount_subunits: input.amountSubunits,
    audience: input.audience,
    checkout_hash: input.checkoutHash,
    checkout_session_id: input.checkoutSessionId,
    closed_checkout_mandate_hash: input.closedCheckoutMandateHash,
    currency: input.openMandate.currency,
    expires_at: input.expiresAt,
    issued_at: input.issuedAt,
    issuer: input.issuer,
    kid: signingKey.kid,
    mandate_id: input.mandateId,
    nonce: input.nonce,
    open_payment_mandate_hash: openHash,
    open_payment_mandate_id: input.openMandate.mandate_id,
    payee: input.payee,
    payment_attempt: input.paymentAttempt,
    payment_rail: input.paymentRail,
    schema_version: "mindpay.mandate.payment.closed.1",
    user_id: input.openMandate.user_id,
  });
  assertNoConstraintExpansion(
    await verifyClosedMandateConstraints({
      closedPayment: mandate,
      openPayment: input.openMandate,
    }),
  );
  return signed(mandate, signingKey, nowEpochMs);
}

export async function verifyClosedMandateConstraints(input: {
  readonly closedCheckout?: ClosedCheckoutMandate;
  readonly closedPayment?: ClosedPaymentMandate;
  readonly openCheckout?: OpenCheckoutMandate;
  readonly openPayment?: OpenPaymentMandate;
  readonly expectedCheckoutHash?: string;
}): Promise<ClosedMandateConstraintResult> {
  const reasons: ClosedMandateConstraintFailure[] = [];
  if (input.openCheckout !== undefined && input.closedCheckout !== undefined) {
    const open = input.openCheckout;
    const closed = input.closedCheckout;
    addIf(reasons, closed.open_checkout_mandate_id !== open.mandate_id, "OPEN_MANDATE_ID_MISMATCH");
    addIf(
      reasons,
      closed.open_checkout_mandate_hash !== (await sha256CanonicalJsonHex(open)),
      "OPEN_MANDATE_HASH_MISMATCH",
    );
    addIf(reasons, closed.agent_id !== open.agent.agent_id, "AGENT_MISMATCH");
    addIf(reasons, closed.agent_version !== open.agent.agent_version, "AGENT_VERSION_MISMATCH");
    addIf(reasons, closed.user_id !== open.user_id, "USER_MISMATCH");
    addIf(reasons, Date.parse(closed.expires_at) > Date.parse(open.expires_at), "EXPIRY_EXPANDED");
    addIf(reasons, closed.currency !== open.line_item_constraints.currency, "CURRENCY_MISMATCH");
    addIf(reasons, !open.allowed_merchants.includes(closed.merchant_id), "MERCHANT_NOT_ALLOWED");
    addIf(
      reasons,
      closed.line_items.length > open.line_item_constraints.max_line_items,
      "LINE_ITEM_COUNT_EXCEEDED",
    );
    for (const item of closed.line_items) {
      addIf(reasons, !open.allowed_services.includes(item.service_id), "SERVICE_NOT_ALLOWED");
      addIf(
        reasons,
        item.quantity > open.line_item_constraints.max_quantity_per_item,
        "QUANTITY_EXCEEDED",
      );
      addIf(
        reasons,
        item.unit_price_subunits > open.line_item_constraints.max_unit_price_subunits,
        "UNIT_PRICE_EXCEEDED",
      );
    }
  }

  if (input.openPayment !== undefined && input.closedPayment !== undefined) {
    const open = input.openPayment;
    const closed = input.closedPayment;
    addIf(reasons, closed.open_payment_mandate_id !== open.mandate_id, "OPEN_MANDATE_ID_MISMATCH");
    addIf(
      reasons,
      closed.open_payment_mandate_hash !== (await sha256CanonicalJsonHex(open)),
      "OPEN_MANDATE_HASH_MISMATCH",
    );
    addIf(reasons, closed.agent_id !== open.agent.agent_id, "AGENT_MISMATCH");
    addIf(reasons, closed.agent_version !== open.agent.agent_version, "AGENT_VERSION_MISMATCH");
    addIf(reasons, closed.user_id !== open.user_id, "USER_MISMATCH");
    addIf(reasons, Date.parse(closed.expires_at) > Date.parse(open.expires_at), "EXPIRY_EXPANDED");
    addIf(reasons, closed.currency !== open.currency, "CURRENCY_MISMATCH");
    addIf(reasons, closed.amount_subunits > open.max_transaction_subunits, "AMOUNT_EXCEEDED");
    addIf(reasons, !open.allowed_payees.includes(closed.payee), "PAYEE_NOT_ALLOWED");
    addIf(reasons, !open.allowed_rails.includes(closed.payment_rail), "RAIL_NOT_ALLOWED");
    addIf(
      reasons,
      closed.payment_attempt > open.max_attempts_per_transaction,
      "PAYMENT_ATTEMPTS_EXCEEDED",
    );
  }

  if (
    input.expectedCheckoutHash !== undefined &&
    ((input.closedCheckout !== undefined &&
      input.closedCheckout.checkout_hash !== input.expectedCheckoutHash) ||
      (input.closedPayment !== undefined &&
        input.closedPayment.checkout_hash !== input.expectedCheckoutHash))
  ) {
    addIf(reasons, true, "CHECKOUT_HASH_MISMATCH");
  }

  const stableReasons = [...new Set(reasons)];
  return stableReasons.length === 0
    ? Object.freeze({ valid: true })
    : Object.freeze({ reasons: Object.freeze(stableReasons), valid: false });
}

async function signed<TMandate>(
  mandate: TMandate,
  signingKey: Es256SigningKey,
  nowEpochMs: number,
): Promise<SignedClosedMandate<TMandate>> {
  return Object.freeze({
    mandate,
    payloadHash: await sha256CanonicalJsonHex(mandate),
    signature: await signCanonicalJsonEs256(mandate, signingKey, nowEpochMs),
  });
}

function assertNoConstraintExpansion(result: ClosedMandateConstraintResult): void {
  if (!result.valid) {
    throw new Error(`Closed mandate expands open constraints: ${result.reasons.join(",")}`);
  }
}

function addIf(
  reasons: ClosedMandateConstraintFailure[],
  condition: boolean,
  reason: ClosedMandateConstraintFailure,
): void {
  if (condition) reasons.push(reason);
}
