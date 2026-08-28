import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  createMoney,
  formatMoney,
  moneyFromMajorUnits,
  moneyToMajorUnits,
  parseMoney,
  subtractMoney,
} from "./money";

describe("money validation", () => {
  it("stores the default demo price as integer INR subunits", () => {
    const price = createMoney(29_900);

    expect(price).toEqual({ amountSubunits: 29_900, currency: "INR" });
    expect(Object.isFrozen(price)).toBe(true);
    expect(formatMoney(price)).toBe("INR 299.00");
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe amount %j",
    (amount) => {
      expect(() => createMoney(amount)).toThrow();
    },
  );

  it("rejects wrong currency and unknown fields", () => {
    expect(() => parseMoney({ amountSubunits: 100, currency: "USD" })).toThrow();
    expect(() => parseMoney({ amountSubunits: 100, currency: "INR", floatAmount: 1 })).toThrow();
  });

  it.each([
    ["0", 0],
    ["299", 29_900],
    ["299.9", 29_990],
    ["299.99", 29_999],
  ] as const)("parses exact major-unit string %s", (input, expected) => {
    expect(moneyFromMajorUnits(input).amountSubunits).toBe(expected);
  });

  it.each(["", "-1", "01.00", "1.001", "1e3", " 1.00", "1.00 "])(
    "rejects ambiguous major-unit string %j",
    (input) => {
      expect(() => moneyFromMajorUnits(input)).toThrow();
    },
  );
});

describe("money arithmetic", () => {
  it("adds, subtracts, and compares without floating point", () => {
    const base = createMoney(29_900);
    const tax = createMoney(5_382);
    const total = addMoney(base, tax);

    expect(total.amountSubunits).toBe(35_282);
    expect(subtractMoney(total, tax)).toEqual(base);
    expect(compareMoney(base, total)).toBe(-1);
    expect(compareMoney(total, total)).toBe(0);
  });

  it("rejects overflow and negative subtraction", () => {
    expect(() => addMoney(createMoney(Number.MAX_SAFE_INTEGER), createMoney(1))).toThrow();
    expect(() => subtractMoney(createMoney(0), createMoney(1))).toThrow();
  });

  it("round-trips exact serialized values", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (amountSubunits) => {
        const original = createMoney(amountSubunits);
        const roundTripped = moneyFromMajorUnits(moneyToMajorUnits(original));
        expect(roundTripped).toEqual(original);
      }),
    );
  });

  it("keeps addition commutative inside the safe range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (left, right) => {
          expect(addMoney(createMoney(left), createMoney(right))).toEqual(
            addMoney(createMoney(right), createMoney(left)),
          );
        },
      ),
    );
  });
});
