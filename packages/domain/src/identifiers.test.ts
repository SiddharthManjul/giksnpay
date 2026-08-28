import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createIdempotencyKey,
  createRequestContext,
  createRequestId,
  createUlid,
  decodeUlidTimestamp,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  MAX_ULID_TIMESTAMP_MS,
  parseIdempotencyKey,
  parseRequestId,
  parseUlid,
} from "./identifiers";

describe("ULID primitives", () => {
  it("creates canonical time-sortable ULIDs", () => {
    const first = createUlid(1_700_000_000_000);
    const second = createUlid(1_700_000_000_001);

    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(first < second).toBe(true);
    expect(decodeUlidTimestamp(first)).toBe(1_700_000_000_000);
  });

  it("creates monotonically increasing IDs for live calls", () => {
    const first = createUlid();
    const second = createUlid();

    expect(first < second).toBe(true);
  });

  it.each([
    "",
    "01arz3ndektsv4rrffq69g5fav",
    "01ARZ3NDEKTSV4RRFFQ69G5FAI",
    "01ARZ3NDEKTSV4RRFFQ69G5FAV0",
  ])("rejects non-canonical ULID %j", (value) => {
    expect(() => parseUlid(value)).toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_ULID_TIMESTAMP_MS + 1])(
    "rejects invalid ULID timestamp %j",
    (timestamp) => {
      expect(() => createUlid(timestamp)).toThrow(RangeError);
    },
  );

  it("round-trips generated timestamps across the supported commerce range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_102_444_800_000 }), (timestamp) => {
        expect(decodeUlidTimestamp(createUlid(timestamp))).toBe(timestamp);
      }),
    );
  });
});

describe("request identity primitives", () => {
  it("creates request and idempotency identifiers with distinct namespaces", () => {
    const requestId = createRequestId(1_700_000_000_000);
    const idempotencyKey = createIdempotencyKey(1_700_000_000_000);

    expect(requestId).toMatch(/^req_/);
    expect(idempotencyKey).toMatch(/^idem_/);
    expect(parseRequestId(requestId)).toBe(requestId);
    expect(parseIdempotencyKey(idempotencyKey)).toBe(idempotencyKey);
  });

  it("creates a frozen, strict request context", () => {
    const context = createRequestContext(createIdempotencyKey(), 1_700_000_000_000);

    expect(Object.isFrozen(context)).toBe(true);
    expect(context.requestId).toMatch(/^req_/);
  });

  it.each([
    "short",
    "contains whitespace",
    "starts/with/slash-123",
    `a${"b".repeat(IDEMPOTENCY_KEY_MAX_LENGTH)}`,
  ])("rejects unsafe idempotency key %j", (value) => {
    expect(() => parseIdempotencyKey(value)).toThrow();
  });
});
