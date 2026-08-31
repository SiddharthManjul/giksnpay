import { describe, expect, it } from "vitest";
import { reconcileRazorpayPayment } from "./reconciliation";

const order = {
  amount: 29_900,
  amount_due: 0,
  amount_paid: 29_900,
  attempts: 1,
  created_at: 1,
  currency: "INR",
  entity: "order",
  id: "order_MindPay0001",
  notes: {},
  receipt: "mp_test_1",
  status: "paid",
} as const;
const payment = {
  amount: 29_900,
  amount_refunded: 0,
  captured: true,
  created_at: 2,
  currency: "INR",
  entity: "payment",
  id: "pay_MindPay0001",
  order_id: order.id,
  status: "captured",
} as const;

describe("Razorpay reconciliation", () => {
  it("allows fulfilment only for exact captured payment plus paid order", () => {
    expect(
      reconcileRazorpayPayment({
        expectedAmount: 29_900,
        expectedCurrency: "INR",
        expectedOrderId: order.id,
        order,
        payment,
      }),
    ).toEqual({ fulfilmentEligible: true, outcome: "CAPTURED_PAID", reasons: [] });
    expect(
      reconcileRazorpayPayment({
        expectedAmount: 44_900,
        expectedCurrency: "INR",
        expectedOrderId: order.id,
        order,
        payment,
      }),
    ).toMatchObject({ fulfilmentEligible: false, outcome: "MISMATCH" });
  });

  it("keeps callback-only, failed, and refunded evidence ineligible", () => {
    expect(
      reconcileRazorpayPayment({
        expectedAmount: 29_900,
        expectedCurrency: "INR",
        expectedOrderId: order.id,
      }),
    ).toMatchObject({ fulfilmentEligible: false, outcome: "PENDING" });
    expect(
      reconcileRazorpayPayment({
        expectedAmount: 29_900,
        expectedCurrency: "INR",
        expectedOrderId: order.id,
        payment: { ...payment, captured: false, status: "failed" },
      }),
    ).toMatchObject({ fulfilmentEligible: false, outcome: "FAILED" });
    expect(
      reconcileRazorpayPayment({
        expectedAmount: 29_900,
        expectedCurrency: "INR",
        expectedOrderId: order.id,
        order,
        payment: { ...payment, status: "refunded" },
      }),
    ).toMatchObject({ fulfilmentEligible: false, outcome: "REFUNDED" });
  });
});
