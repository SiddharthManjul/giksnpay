import { z } from "zod";

const CANONICAL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MIN_DATE_EPOCH_MS = -62_167_219_200_000;
const MAX_DATE_EPOCH_MS = 253_402_300_799_999;

export const utcTimestampSchema = z
  .string()
  .regex(
    CANONICAL_UTC_TIMESTAMP_PATTERN,
    "Timestamp must be canonical UTC with millisecond precision",
  )
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }, "Timestamp must represent a real UTC instant")
  .brand<"UtcTimestamp">();

export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;

function parseEpochMilliseconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < MIN_DATE_EPOCH_MS || value > MAX_DATE_EPOCH_MS) {
    throw new RangeError("Epoch milliseconds must be a safe integer in the JavaScript Date range");
  }

  return value;
}

export function utcTimestampFromDate(value: Date): UtcTimestamp {
  const epochMilliseconds = value.getTime();
  if (Number.isNaN(epochMilliseconds)) {
    throw new RangeError("Cannot create a UTC timestamp from an invalid Date");
  }

  return utcTimestampSchema.parse(value.toISOString());
}

export function utcTimestampFromEpochMilliseconds(value: number): UtcTimestamp {
  return utcTimestampFromDate(new Date(parseEpochMilliseconds(value)));
}

export function currentUtcTimestamp(now: () => Date = () => new Date()): UtcTimestamp {
  return utcTimestampFromDate(now());
}

export function parseUtcTimestamp(value: unknown): UtcTimestamp {
  return utcTimestampSchema.parse(value);
}

export function utcTimestampToEpochMilliseconds(value: UtcTimestamp): number {
  return new Date(value).getTime();
}

export function addMilliseconds(value: UtcTimestamp, milliseconds: number): UtcTimestamp {
  if (!Number.isSafeInteger(milliseconds)) {
    throw new RangeError("Timestamp duration must be a safe integer number of milliseconds");
  }

  return utcTimestampFromEpochMilliseconds(utcTimestampToEpochMilliseconds(value) + milliseconds);
}

export function compareUtcTimestamps(left: UtcTimestamp, right: UtcTimestamp): -1 | 0 | 1 {
  const leftEpoch = utcTimestampToEpochMilliseconds(left);
  const rightEpoch = utcTimestampToEpochMilliseconds(right);

  if (leftEpoch < rightEpoch) {
    return -1;
  }

  if (leftEpoch > rightEpoch) {
    return 1;
  }

  return 0;
}
