import {
  type AuditActor,
  type AuditEvent,
  auditEventSchema,
  type SignedAuditEvent,
  signedAuditEventSchema,
} from "@mindpay/contracts";
import {
  type Es256SigningKey,
  type Es256VerificationKey,
  sha256CanonicalJsonHex,
  signCanonicalJsonEs256,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";

const REDACTED = "[REDACTED]";
const REDACTED_KEY_PATTERN =
  /^(?:api[_-]?key|authorization|cookie|password|private[_-]?(?:jwk|key)|prompt|raw[_-]?payload|refresh[_-]?token|secret|session[_-]?token|token|webhook[_-]?secret)$/iu;

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface BuildAuditEventInput {
  readonly actor: AuditActor;
  readonly audience: string;
  readonly eventId?: string;
  readonly eventType: AuditEvent["event_type"];
  readonly expiresAt: Date;
  readonly issuer: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
  readonly previousEventHash: string | null;
  readonly sequence: number;
  readonly signingKey: Es256SigningKey;
  readonly transactionId: string;
}

export async function buildSignedAuditEvent(
  input: BuildAuditEventInput,
): Promise<SignedAuditEvent> {
  const eventId = input.eventId ?? `evt_${createUlid(input.occurredAt.getTime())}`;
  const payloadHash = await sha256CanonicalJsonHex(input.payload);
  const redactedPayload = redactAuditPayload(input.payload);
  if (!isJsonRecord(redactedPayload)) {
    throw new TypeError("Audit payloads must be JSON objects");
  }
  const unsigned = {
    actor: input.actor,
    audience: input.audience,
    event_type: input.eventType,
    expires_at: utcTimestampFromDate(input.expiresAt),
    issued_at: utcTimestampFromDate(input.occurredAt),
    issuer: input.issuer,
    jti: eventId,
    kid: input.signingKey.kid,
    occurred_at: utcTimestampFromDate(input.occurredAt),
    payload_hash: payloadHash,
    previous_event_hash: input.previousEventHash,
    redacted_payload: redactedPayload,
    schema_version: "mindpay.audit.event.1" as const,
    sequence: input.sequence,
    transaction_id: input.transactionId,
  };
  const event = auditEventSchema.parse({
    ...unsigned,
    event_hash: await sha256CanonicalJsonHex(unsigned),
  });
  return signedAuditEventSchema.parse({
    event,
    signature: await signCanonicalJsonEs256(event, input.signingKey, input.occurredAt.getTime()),
  });
}

export async function verifySignedAuditChain(
  publications: readonly SignedAuditEvent[],
  verificationKeys: readonly Es256VerificationKey[],
  nowEpochMs: number,
): Promise<Readonly<{ failures: readonly string[]; valid: boolean }>> {
  const failures: string[] = [];
  let previousHash: string | null = null;
  for (const [index, untrusted] of publications.entries()) {
    const parsed = signedAuditEventSchema.safeParse(untrusted);
    if (!parsed.success) {
      failures.push(`EVENT_${index}_SCHEMA_INVALID`);
      continue;
    }
    const { event, signature } = parsed.data;
    const unsigned = auditHashMaterial(event);
    const expectedHash = await sha256CanonicalJsonHex(unsigned);
    if (event.sequence !== index) failures.push(`EVENT_${index}_SEQUENCE_INVALID`);
    if (event.previous_event_hash !== previousHash) failures.push(`EVENT_${index}_LINK_INVALID`);
    if (event.event_hash !== expectedHash) failures.push(`EVENT_${index}_HASH_INVALID`);
    const signatureResult = await verifyCanonicalJsonEs256(
      event,
      signature,
      verificationKeys,
      nowEpochMs,
    );
    if (!signatureResult.valid) failures.push(`EVENT_${index}_SIGNATURE_INVALID`);
    previousHash = event.event_hash;
  }
  return Object.freeze({ failures: Object.freeze(failures), valid: failures.length === 0 });
}

export function redactAuditPayload(value: unknown): JsonValue {
  return redactValue(value, new WeakSet<object>());
}

function redactValue(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Audit payload numbers must be finite");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("Audit payload must contain JSON data only");
  if (seen.has(value)) throw new TypeError("Audit payload cannot contain cycles");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new TypeError("Audit payload objects must be plain JSON records");
    }
    const entries = Object.entries(value).map(
      ([key, nested]) =>
        [
          key,
          REDACTED_KEY_PATTERN.test(key) && !key.toLowerCase().endsWith("_hash")
            ? REDACTED
            : redactValue(nested, seen),
        ] as const,
    );
    return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string, JsonValue>>;
  } finally {
    seen.delete(value);
  }
}

function auditHashMaterial(event: AuditEvent) {
  return {
    actor: event.actor,
    audience: event.audience,
    event_type: event.event_type,
    expires_at: event.expires_at,
    issued_at: event.issued_at,
    issuer: event.issuer,
    jti: event.jti,
    kid: event.kid,
    occurred_at: event.occurred_at,
    payload_hash: event.payload_hash,
    previous_event_hash: event.previous_event_hash,
    redacted_payload: event.redacted_payload,
    schema_version: event.schema_version,
    sequence: event.sequence,
    transaction_id: event.transaction_id,
  };
}

function isJsonRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
