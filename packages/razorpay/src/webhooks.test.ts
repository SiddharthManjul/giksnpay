import { describe, expect, it } from "vitest";
import { parseRazorpayWebhook } from "./webhooks";

describe("Razorpay webhook contracts", () => {
  it("parses supported payment events only after exact-byte verification", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        account_id: "acc_test",
        contains: ["payment"],
        created_at: 1,
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              amount: 29_900,
              amount_refunded: 0,
              captured: true,
              created_at: 1,
              currency: "INR",
              entity: "payment",
              id: "pay_MindPay0001",
              order_id: "order_MindPay0001",
              status: "captured",
            },
          },
        },
      }),
    );
    expect(parseRazorpayWebhook(raw)).toMatchObject({ event: "payment.captured" });
  });

  it("rejects unsupported, malformed, and entity-mismatched events", () => {
    for (const value of [
      "not-json",
      JSON.stringify({ entity: "event", event: "payment.authorized", payload: {} }),
      JSON.stringify({
        account_id: "acc_test",
        contains: ["payment"],
        created_at: 1,
        entity: "event",
        event: "payment.failed",
        payload: {},
      }),
    ]) {
      expect(() => parseRazorpayWebhook(new TextEncoder().encode(value))).toThrow();
    }
  });
});
