import type { RazorpayOrder, RazorpayPayment, RazorpayRefund } from "./client";

export type RazorpayReconciliationReason =
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "ORDER_ID_MISMATCH"
  | "ORDER_NOT_PAID"
  | "PAYMENT_FAILED"
  | "PAYMENT_NOT_CAPTURED"
  | "REFUND_FAILED"
  | "REFUND_PENDING"
  | "REFUNDED";

export interface RazorpayReconciliationInput {
  readonly expectedAmount: number;
  readonly expectedCurrency: "INR";
  readonly expectedOrderId: string;
  readonly order?: RazorpayOrder;
  readonly payment?: RazorpayPayment;
  readonly refund?: RazorpayRefund;
}

export type RazorpayReconciliationResult = Readonly<{
  fulfilmentEligible: boolean;
  outcome: "CAPTURED_PAID" | "FAILED" | "MISMATCH" | "PENDING" | "REFUNDED" | "REFUND_PENDING";
  reasons: readonly RazorpayReconciliationReason[];
}>;

export function reconcileRazorpayPayment(
  input: RazorpayReconciliationInput,
): RazorpayReconciliationResult {
  const reasons: RazorpayReconciliationReason[] = [];
  if (input.order !== undefined) {
    if (input.order.id !== input.expectedOrderId) reasons.push("ORDER_ID_MISMATCH");
    if (input.order.amount !== input.expectedAmount) reasons.push("AMOUNT_MISMATCH");
    if (input.order.currency !== input.expectedCurrency) reasons.push("CURRENCY_MISMATCH");
  }
  if (input.payment !== undefined) {
    if (input.payment.order_id !== input.expectedOrderId) reasons.push("ORDER_ID_MISMATCH");
    if (input.payment.amount !== input.expectedAmount) reasons.push("AMOUNT_MISMATCH");
    if (input.payment.currency !== input.expectedCurrency) reasons.push("CURRENCY_MISMATCH");
  }
  if (reasons.length > 0) return result("MISMATCH", false, reasons);

  if (input.refund?.status === "processed" || input.payment?.status === "refunded") {
    return result("REFUNDED", false, ["REFUNDED"]);
  }
  if (input.refund?.status === "pending") {
    return result("REFUND_PENDING", false, ["REFUND_PENDING"]);
  }
  if (input.refund?.status === "failed") {
    return result("FAILED", false, ["REFUND_FAILED"]);
  }
  if (input.payment?.status === "failed") {
    return result("FAILED", false, ["PAYMENT_FAILED"]);
  }
  if (
    input.order?.status === "paid" &&
    input.payment?.status === "captured" &&
    input.payment.captured
  ) {
    return result("CAPTURED_PAID", true, []);
  }
  if (input.order !== undefined && input.order.status !== "paid") reasons.push("ORDER_NOT_PAID");
  if (
    input.payment !== undefined &&
    (input.payment.status !== "captured" || !input.payment.captured)
  ) {
    reasons.push("PAYMENT_NOT_CAPTURED");
  }
  return result("PENDING", false, reasons);
}

function result(
  outcome: RazorpayReconciliationResult["outcome"],
  fulfilmentEligible: boolean,
  reasons: readonly RazorpayReconciliationReason[],
): RazorpayReconciliationResult {
  return Object.freeze({
    fulfilmentEligible,
    outcome,
    reasons: Object.freeze([...new Set(reasons)]),
  });
}
