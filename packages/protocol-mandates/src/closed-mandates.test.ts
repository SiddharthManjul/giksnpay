import {
  closedPaymentMandateSchema,
  closedPaymentMandateFixture,
  openCheckoutMandateFixture,
  openCheckoutMandateSchema,
  openPaymentMandateFixture,
  openPaymentMandateSchema,
  signalWorksCheckoutFixture,
  signalWorksOfferFixture,
} from "@mindpay/contracts";
import {
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importEs256PublicJwk,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { describe, expect, it } from "vitest";
import { AP2_ALIGNMENT_LABEL, mapOpenPaymentMandateToAp2 } from "./ap2-mapping";
import {
  closeCheckoutMandate,
  closePaymentMandate,
  verifyClosedMandateConstraints,
} from "./closed-mandates";

const NOW = Date.parse("2026-08-28T12:06:00.000Z");

describe("AP2-aligned MindPay closed mandates", () => {
  it("signs exact checkout, amount, payee, and rail bindings without claiming AP2 conformance", async () => {
    const keyPair = await generateEs256KeyPair(true);
    const signingKey = {
      kid: "agent-signing-2026-01",
      privateKey: keyPair.privateKey,
      validFromEpochMs: NOW - 1_000,
    } as const;
    const openCheckout = openCheckoutMandateSchema.parse({
      ...openCheckoutMandateFixture,
      expires_at: "2026-08-28T13:00:00.000Z",
    });
    const openPayment = openPaymentMandateSchema.parse({
      ...openPaymentMandateFixture,
      expires_at: "2026-08-28T13:00:00.000Z",
    });
    const checkout = await closeCheckoutMandate(
      {
        audience: openCheckout.audience,
        checkoutHash: "7".repeat(64),
        checkoutSessionId: signalWorksCheckoutFixture.checkout_session_id,
        currency: "INR",
        expiresAt: "2026-08-28T12:30:00.000Z",
        issuedAt: "2026-08-28T12:06:00.000Z",
        issuer: openCheckout.audience,
        lineItems: signalWorksCheckoutFixture.line_items,
        mandateId: "mnd_01JGFJH500H8M2APVYVDZ4R6A5",
        merchantId: signalWorksCheckoutFixture.merchant_id,
        nonce: "nonce_closed_checkout_0001",
        offerHash: "8".repeat(64),
        offerId: signalWorksOfferFixture.offer_id,
        openMandate: openCheckout,
        totalSubunits: signalWorksCheckoutFixture.total_subunits,
      },
      signingKey,
      NOW,
    );
    const payment = await closePaymentMandate(
      {
        amountSubunits: signalWorksCheckoutFixture.total_subunits,
        audience: openPayment.audience,
        checkoutHash: checkout.mandate.checkout_hash,
        checkoutSessionId: checkout.mandate.checkout_session_id,
        closedCheckoutMandateHash: checkout.payloadHash,
        expiresAt: checkout.mandate.expires_at,
        issuedAt: "2026-08-28T12:07:00.000Z",
        issuer: openPayment.audience,
        mandateId: "mnd_01JGFJH600H8M2APVYVDZ4R6A6",
        nonce: "nonce_closed_payment_0001",
        openMandate: openPayment,
        payee: signalWorksCheckoutFixture.merchant_id,
        paymentAttempt: 1,
        paymentRail: "razorpay:test",
      },
      signingKey,
      NOW,
    );

    expect(
      await verifyClosedMandateConstraints({
        closedCheckout: checkout.mandate,
        closedPayment: payment.mandate,
        expectedCheckoutHash: checkout.mandate.checkout_hash,
        openCheckout,
        openPayment,
      }),
    ).toEqual({ valid: true });
    const publicKey = await importEs256PublicJwk(await exportEs256PublicJwk(keyPair.publicKey));
    await expect(
      verifyCanonicalJsonEs256(
        payment.mandate,
        payment.signature,
        [{ kid: signingKey.kid, publicKey, validFromEpochMs: NOW - 1_000 }],
        NOW,
      ),
    ).resolves.toEqual({ kid: signingKey.kid, valid: true });
    expect(payment.mandate).toMatchObject({
      amount_subunits: 29_900,
      checkout_hash: checkout.mandate.checkout_hash,
      closed_checkout_mandate_hash: checkout.payloadHash,
      payee: signalWorksCheckoutFixture.merchant_id,
      payment_rail: "razorpay:test",
      schema_version: "mindpay.mandate.payment.closed.1",
    });
    expect(mapOpenPaymentMandateToAp2(openPayment)).toMatchObject({
      alignment: AP2_ALIGNMENT_LABEL,
      ap2Concept: "PaymentMandate",
      mappingVersion: "mindpay.ap2.mapping.1",
    });
    expect(JSON.stringify(mapOpenPaymentMandateToAp2(openPayment))).not.toContain("SD-JWT");
  });

  it("reports every attempted payment expansion in stable order", async () => {
    const expanded = closedPaymentMandateSchema.parse({
      ...closedPaymentMandateFixture,
      amount_subunits: 79_900,
      expires_at: "2026-08-29T13:00:00.000Z",
      open_payment_mandate_hash: "3".repeat(64),
      payee: "merchant_unapproved_vendor",
      payment_attempt: 3,
    });
    const result = await verifyClosedMandateConstraints({
      closedPayment: expanded,
      openPayment: openPaymentMandateFixture,
    });
    expect(result).toMatchObject({
      reasons: [
        "OPEN_MANDATE_HASH_MISMATCH",
        "EXPIRY_EXPANDED",
        "AMOUNT_EXCEEDED",
        "PAYEE_NOT_ALLOWED",
        "PAYMENT_ATTEMPTS_EXCEEDED",
      ],
      valid: false,
    });
  });

  it("blocks a closed mandate bound to a different merchant checkout hash", async () => {
    await expect(
      verifyClosedMandateConstraints({
        closedPayment: closedPaymentMandateFixture,
        expectedCheckoutHash: "9".repeat(64),
      }),
    ).resolves.toEqual({
      reasons: ["CHECKOUT_HASH_MISMATCH"],
      valid: false,
    });
  });
});
