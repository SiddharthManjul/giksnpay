export type TransactionState =
  | "DRAFT"
  | "DISCOVERING"
  | "OFFER_SELECTED"
  | "VERIFYING"
  | "POLICY_REVIEW"
  | "BLOCKED"
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "BUDGET_RESERVED"
  | "CHECKOUT_CREATED"
  | "ORDER_CREATED"
  | "PAYMENT_PENDING"
  | "PAYMENT_FAILED"
  | "CALLBACK_VERIFIED"
  | "PAYMENT_RECONCILING"
  | "PAYMENT_CAPTURED"
  | "ENTITLEMENT_ISSUED"
  | "FULFILLING"
  | "FULFILMENT_FAILED"
  | "FULFILLED"
  | "EVIDENCE_READY"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "DISPUTED";

const mutableTransitions = {
  APPROVAL_REQUIRED: ["APPROVED", "BLOCKED", "CANCELLED", "EXPIRED"],
  APPROVED: ["BUDGET_RESERVED", "BLOCKED", "CANCELLED", "EXPIRED"],
  BLOCKED: [],
  BUDGET_RESERVED: ["CHECKOUT_CREATED", "CANCELLED", "EXPIRED"],
  CALLBACK_VERIFIED: ["PAYMENT_RECONCILING", "PAYMENT_FAILED"],
  CANCELLED: [],
  CHECKOUT_CREATED: ["ORDER_CREATED", "CANCELLED", "EXPIRED"],
  DISCOVERING: ["OFFER_SELECTED", "BLOCKED", "CANCELLED", "EXPIRED"],
  DISPUTED: ["REFUND_PENDING"],
  DRAFT: ["DISCOVERING", "OFFER_SELECTED", "CANCELLED", "EXPIRED"],
  ENTITLEMENT_ISSUED: ["FULFILLING", "FULFILMENT_FAILED"],
  EVIDENCE_READY: ["DISPUTED", "REFUND_PENDING"],
  EXPIRED: [],
  FULFILLED: ["EVIDENCE_READY", "DISPUTED"],
  FULFILLING: ["FULFILLED", "FULFILMENT_FAILED"],
  FULFILMENT_FAILED: ["FULFILLING", "REFUND_PENDING"],
  OFFER_SELECTED: ["VERIFYING", "BLOCKED", "CANCELLED", "EXPIRED"],
  ORDER_CREATED: ["PAYMENT_PENDING", "PAYMENT_FAILED", "CANCELLED", "EXPIRED"],
  PAYMENT_CAPTURED: ["ENTITLEMENT_ISSUED", "REFUND_PENDING", "DISPUTED"],
  PAYMENT_FAILED: ["BUDGET_RESERVED", "PAYMENT_RECONCILING", "CANCELLED", "EXPIRED"],
  PAYMENT_PENDING: [
    "CALLBACK_VERIFIED",
    "PAYMENT_RECONCILING",
    "PAYMENT_CAPTURED",
    "PAYMENT_FAILED",
    "EXPIRED",
  ],
  PAYMENT_RECONCILING: ["PAYMENT_CAPTURED", "PAYMENT_FAILED"],
  POLICY_REVIEW: ["APPROVAL_REQUIRED", "APPROVED", "BLOCKED"],
  REFUNDED: ["EVIDENCE_READY"],
  REFUND_PENDING: ["REFUNDED", "DISPUTED"],
  VERIFYING: ["POLICY_REVIEW", "BLOCKED", "CANCELLED", "EXPIRED"],
} as const satisfies Readonly<Record<TransactionState, readonly TransactionState[]>>;

for (const transitions of Object.values(mutableTransitions)) Object.freeze(transitions);
export const transactionStateTransitions = Object.freeze(mutableTransitions);

export function canTransitionTransaction(from: TransactionState, to: TransactionState): boolean {
  const allowed: readonly TransactionState[] = transactionStateTransitions[from];
  return allowed.includes(to);
}

export function assertTransactionTransition(from: TransactionState, to: TransactionState): void {
  if (!canTransitionTransaction(from, to)) {
    throw new Error(`Illegal transaction transition: ${from} -> ${to}`);
  }
}
