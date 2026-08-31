import { describe, expect, it } from "vitest";
import {
  merchantPaymentAuthorizationSchema,
  merchantPaymentEventSchema,
  safeRazorpayCheckoutConfigSchema,
} from "./merchant-payments";

const EVENT = {
  amount_subunits: 29_900,
  attempt_number: 1,
  audience: "https://api.mindpay.example/",
  checkout_hash: "a".repeat(64),
  checkout_session_id: "checkout_01JGFJH900H8M2APVYVDZ4R6P6",
  currency: "INR",
  event_id: "evt_01JGFJH900H8M2APVYVDZ4R6P6",
  event_type: "PAYMENT_CAPTURED",
  expires_at: "2026-08-31T12:10:00.000Z",
  fulfilment_eligible: true,
  issued_at: "2026-08-31T12:00:00.000Z",
  issuer: "https://merchant-demo.example.com/",
  kid: "signalworks.event.2026-01",
  merchant_id: "merchant_signalworks",
  nonce: "razorpay:event:test:0001",
  occurred_at: "2026-08-31T12:00:00.000Z",
  order_status: "paid",
  payment_status: "captured",
  provider_order_id: "order_1234567890abcdef",
  provider_payment_id: "pay_1234567890abcdef",
  schema_version: "mindpay.merchant.payment-event.1",
  transaction_id: "ctx_01JGFJH900H8M2APVYVDZ4R6P6",
} as const;

describe("merchant payment contracts", () => {
  it("binds order authority to one closed mandate, checkout, attempt, and test rail", () => {
    expect(
      merchantPaymentAuthorizationSchema.parse({
        agent_id: "agt_01JGFJH900H8M2APVYVDZ4R6P6",
        amount_subunits: 29_900,
        attempt_number: 1,
        checkout_hash: "a".repeat(64),
        checkout_session_id: "checkout_01JGFJH900H8M2APVYVDZ4R6P6",
        closed_payment_mandate_hash: "b".repeat(64),
        currency: "INR",
        mandate_id: "mnd_01JGFJH900H8M2APVYVDZ4R6P6",
        payment_rail: "razorpay:test",
        service_id: "market_snapshot",
        transaction_id: "ctx_01JGFJH900H8M2APVYVDZ4R6P6",
      }),
    ).toMatchObject({ payment_rail: "razorpay:test" });
  });

  it("keeps checkout output public-only and rejects secret-bearing additions", () => {
    const checkout = {
      amount: 29_900,
      currency: "INR",
      description: "Market snapshot",
      key: "rzp_test_1234567890abcdef",
      name: "SignalWorks",
      order_id: "order_1234567890abcdef",
      retry: { enabled: false },
    } as const;
    expect(safeRazorpayCheckoutConfigSchema.parse(checkout)).toEqual(checkout);
    expect(
      safeRazorpayCheckoutConfigSchema.safeParse({ ...checkout, key_secret: "must-never-leak" })
        .success,
    ).toBe(false);
  });

  it("permits fulfilment only for the exact paid+captured conjunction", () => {
    expect(merchantPaymentEventSchema.parse(EVENT).fulfilment_eligible).toBe(true);
    expect(
      merchantPaymentEventSchema.safeParse({ ...EVENT, payment_status: "authorized" }).success,
    ).toBe(false);
    expect(
      merchantPaymentEventSchema.safeParse({ ...EVENT, order_status: "attempted" }).success,
    ).toBe(false);
  });
});
