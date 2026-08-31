import { describe, expect, it } from "vitest";
import {
  assertTransactionTransition,
  canTransitionTransaction,
  transactionStateTransitions,
} from "./transaction-state";

describe("transaction lifecycle", () => {
  it("accepts only explicitly listed transitions and freezes terminal states", () => {
    expect(canTransitionTransaction("APPROVAL_REQUIRED", "APPROVED")).toBe(true);
    expect(canTransitionTransaction("APPROVAL_REQUIRED", "ORDER_CREATED")).toBe(false);
    expect(() => assertTransactionTransition("BLOCKED", "ORDER_CREATED")).toThrow(
      "Illegal transaction transition",
    );
    expect(transactionStateTransitions.BLOCKED).toEqual([]);
    expect(transactionStateTransitions.CANCELLED).toEqual([]);
    expect(transactionStateTransitions.EXPIRED).toEqual([]);
    expect(Object.isFrozen(transactionStateTransitions)).toBe(true);
    expect(Object.isFrozen(transactionStateTransitions.APPROVAL_REQUIRED)).toBe(true);
  });
});
