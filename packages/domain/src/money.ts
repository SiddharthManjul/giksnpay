import { z } from "zod";

const DECIMAL_MAJOR_UNITS_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export const INR_MINOR_UNIT_SCALE = 2;
export const SUBUNITS_PER_INR = 100;

export const currencyCodeSchema = z.enum(["INR"]);

export const currencySubunitsSchema = z
  .number()
  .int("Money must be stored as integer currency subunits")
  .nonnegative("Money cannot be negative")
  .max(Number.MAX_SAFE_INTEGER, "Money exceeds the safe integer range")
  .brand<"CurrencySubunits">();

export const moneySchema = z
  .object({
    amountSubunits: currencySubunitsSchema,
    currency: currencyCodeSchema,
  })
  .strict()
  .readonly();

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type CurrencySubunits = z.infer<typeof currencySubunitsSchema>;
export type Money = z.infer<typeof moneySchema>;

export function createCurrencySubunits(value: number): CurrencySubunits {
  return currencySubunitsSchema.parse(value);
}

export function createMoney(amountSubunits: number, currency: CurrencyCode = "INR"): Money {
  return moneySchema.parse({ amountSubunits, currency });
}

export function parseMoney(value: unknown): Money {
  return moneySchema.parse(value);
}

export function moneyFromMajorUnits(value: string, currency: CurrencyCode = "INR"): Money {
  const match = DECIMAL_MAJOR_UNITS_PATTERN.exec(value);
  if (!match) {
    throw new TypeError("Major units must be a non-negative decimal string with at most 2 places");
  }

  const wholePart = match[1];
  if (wholePart === undefined) {
    throw new TypeError("Major units are missing the whole-number component");
  }

  const fractionalPart = (match[2] ?? "").padEnd(INR_MINOR_UNIT_SCALE, "0");
  const amountSubunits =
    BigInt(wholePart) * BigInt(SUBUNITS_PER_INR) + BigInt(fractionalPart || "0");

  if (amountSubunits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Money exceeds the safe integer range");
  }

  return createMoney(Number(amountSubunits), currency);
}

export function moneyToMajorUnits(value: Money): string {
  const wholePart = Math.floor(value.amountSubunits / SUBUNITS_PER_INR);
  const fractionalPart = value.amountSubunits % SUBUNITS_PER_INR;
  return `${wholePart}.${fractionalPart.toString().padStart(INR_MINOR_UNIT_SCALE, "0")}`;
}

export function formatMoney(value: Money): string {
  return `${value.currency} ${moneyToMajorUnits(value)}`;
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new TypeError(`Currency mismatch: ${left.currency} does not equal ${right.currency}`);
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(left.amountSubunits + right.amountSubunits, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(left.amountSubunits - right.amountSubunits, left.currency);
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);

  if (left.amountSubunits < right.amountSubunits) {
    return -1;
  }

  if (left.amountSubunits > right.amountSubunits) {
    return 1;
  }

  return 0;
}
