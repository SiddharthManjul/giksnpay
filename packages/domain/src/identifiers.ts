import { decodeTime, isValid, monotonicFactory, ulid } from "ulidx";
import { z } from "zod";

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const REQUEST_ID_PATTERN = /^req_[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const MAX_ULID_TIMESTAMP_MS = 281_474_976_710_655;
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export const ulidSchema = z
  .string()
  .regex(ULID_PATTERN, "ULID must use canonical uppercase Crockford Base32")
  .refine(isValid, "Invalid ULID")
  .brand<"Ulid">();

export const requestIdSchema = z
  .string()
  .regex(REQUEST_ID_PATTERN, "Request ID must be req_ followed by a canonical ULID")
  .brand<"RequestId">();

export const idempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN_LENGTH)
  .max(IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(
    IDEMPOTENCY_KEY_PATTERN,
    "Idempotency key may contain only letters, numbers, period, underscore, colon, and hyphen",
  )
  .brand<"IdempotencyKey">();

export const requestContextSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    requestId: requestIdSchema,
  })
  .strict()
  .readonly();

export type Ulid = z.infer<typeof ulidSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
export type RequestContext = z.infer<typeof requestContextSchema>;

const nextMonotonicUlid = monotonicFactory();

function parseUlidTimestamp(timestampMs: number): number {
  if (
    !Number.isSafeInteger(timestampMs) ||
    timestampMs < 0 ||
    timestampMs > MAX_ULID_TIMESTAMP_MS
  ) {
    throw new RangeError(
      `ULID timestamp must be a safe integer between 0 and ${MAX_ULID_TIMESTAMP_MS}`,
    );
  }

  return timestampMs;
}

export function createUlid(timestampMs?: number): Ulid {
  const parsedTimestamp = parseUlidTimestamp(timestampMs ?? Date.now());
  const generated =
    timestampMs === undefined ? nextMonotonicUlid(parsedTimestamp) : ulid(parsedTimestamp);
  return ulidSchema.parse(generated);
}

export function parseUlid(value: unknown): Ulid {
  return ulidSchema.parse(value);
}

export function decodeUlidTimestamp(ulid: Ulid): number {
  return decodeTime(ulid);
}

export function createRequestId(timestampMs?: number): RequestId {
  return requestIdSchema.parse(`req_${createUlid(timestampMs)}`);
}

export function parseRequestId(value: unknown): RequestId {
  return requestIdSchema.parse(value);
}

export function createIdempotencyKey(timestampMs?: number): IdempotencyKey {
  return idempotencyKeySchema.parse(`idem_${createUlid(timestampMs)}`);
}

export function parseIdempotencyKey(value: unknown): IdempotencyKey {
  return idempotencyKeySchema.parse(value);
}

export function createRequestContext(
  idempotencyKey: IdempotencyKey,
  timestampMs?: number,
): RequestContext {
  return requestContextSchema.parse({
    idempotencyKey,
    requestId: createRequestId(timestampMs),
  });
}
