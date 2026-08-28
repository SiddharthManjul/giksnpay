import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addMilliseconds,
  compareUtcTimestamps,
  currentUtcTimestamp,
  parseUtcTimestamp,
  utcTimestampFromDate,
  utcTimestampFromEpochMilliseconds,
  utcTimestampToEpochMilliseconds,
} from "./time";

describe("UTC timestamp primitives", () => {
  it("serializes canonical UTC with millisecond precision", () => {
    const timestamp = utcTimestampFromDate(new Date("2026-08-28T12:34:56.789Z"));

    expect(timestamp).toBe("2026-08-28T12:34:56.789Z");
    expect(utcTimestampToEpochMilliseconds(timestamp)).toBe(1_787_920_496_789);
  });

  it("uses an injectable clock", () => {
    expect(currentUtcTimestamp(() => new Date("2026-08-28T00:00:00.000Z"))).toBe(
      "2026-08-28T00:00:00.000Z",
    );
  });

  it.each([
    "2026-08-28",
    "2026-08-28T00:00:00Z",
    "2026-08-28T00:00:00.000+00:00",
    "2026-02-30T00:00:00.000Z",
    "not-a-date",
  ])("rejects non-canonical timestamp %j", (value) => {
    expect(() => parseUtcTimestamp(value)).toThrow();
  });

  it("adds and compares exact millisecond durations", () => {
    const start = parseUtcTimestamp("2026-08-28T00:00:00.000Z");
    const end = addMilliseconds(start, 1_500);

    expect(end).toBe("2026-08-28T00:00:01.500Z");
    expect(compareUtcTimestamps(start, end)).toBe(-1);
    expect(compareUtcTimestamps(end, end)).toBe(0);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid duration %j",
    (duration) => {
      expect(() =>
        addMilliseconds(parseUtcTimestamp("2026-08-28T00:00:00.000Z"), duration),
      ).toThrow(RangeError);
    },
  );

  it("round-trips epoch milliseconds across supported product dates", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_102_444_800_000 }), (epochMilliseconds) => {
        const timestamp = utcTimestampFromEpochMilliseconds(epochMilliseconds);
        expect(utcTimestampToEpochMilliseconds(timestamp)).toBe(epochMilliseconds);
      }),
    );
  });
});
