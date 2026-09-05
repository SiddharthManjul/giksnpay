import {
  buildSignedAuditEvent,
  verifySignedAuditChain,
  type BuildAuditEventInput,
} from "@mindpay/audit";
import {
  type AuditActor,
  type AuditEvent,
  auditEventSchema,
  type SignedAuditEvent,
  signedAuditEventSchema,
} from "@mindpay/contracts";
import { importEs256PublicJwk } from "@mindpay/crypto";
import type { GatewayAuthBindings } from "./auth";
import { loadOrCreatePlatformSigningKey } from "./platform-signing";

const DEFAULT_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1_000;

export interface AuditEventInput {
  readonly actor: AuditActor;
  readonly eventType: AuditEvent["event_type"];
  readonly payload: unknown;
}

export async function prepareAuditStatements(
  bindings: GatewayAuthBindings,
  transactionId: string,
  inputs: readonly AuditEventInput[],
  occurredAt: Date,
  retentionExpiresAt = occurredAt.getTime() + DEFAULT_RETENTION_MS,
): Promise<
  Readonly<{
    publications: readonly SignedAuditEvent[];
    statements: readonly D1PreparedStatement[];
  }>
> {
  const previous = await readAuditHead(bindings.DB, transactionId);
  const publications = await buildChain(
    bindings,
    transactionId,
    inputs,
    occurredAt,
    retentionExpiresAt,
    previous,
  );
  return Object.freeze({
    publications,
    statements: Object.freeze(
      publications.map((publication) => auditInsert(bindings.DB, publication)),
    ),
  });
}

export async function appendAuditEvents(
  bindings: GatewayAuthBindings,
  transactionId: string,
  inputs: readonly AuditEventInput[],
  occurredAt = new Date(),
  retentionExpiresAt = occurredAt.getTime() + DEFAULT_RETENTION_MS,
): Promise<readonly SignedAuditEvent[]> {
  if (inputs.length === 0) return Object.freeze([]);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const attemptTime = new Date(occurredAt.getTime() + attempt * inputs.length);
    const prepared = await prepareAuditStatements(
      bindings,
      transactionId,
      inputs,
      attemptTime,
      retentionExpiresAt,
    );
    try {
      await bindings.DB.batch([...prepared.statements]);
      await broadcastAuditEvents(bindings, transactionId, prepared.publications);
      return prepared.publications;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("Audit append retry budget exhausted");
}

export async function readSignedAuditEvents(
  database: D1Database,
  transactionId: string,
): Promise<readonly SignedAuditEvent[]> {
  const result = await database
    .prepare(
      `SELECT schema_version, event_type, actor_type, actor_id, issuer, audience, jti,
       payload_json, payload_hash, previous_event_hash, event_hash, signature, kid,
       occurred_at, expires_at, sequence, transaction_id
       FROM audit_events WHERE transaction_id = ? ORDER BY sequence ASC`,
    )
    .bind(transactionId)
    .all();
  return Object.freeze(result.results.map(parseAuditRow));
}

export async function verifyStoredAuditEvents(
  database: D1Database,
  transactionId: string,
  nowEpochMs = Date.now(),
) {
  const publications = await readSignedAuditEvents(database, transactionId);
  const keys = await readAuditVerificationKeys(database);
  return verifySignedAuditChain(publications, keys, nowEpochMs);
}

export async function broadcastAuditEvents(
  bindings: GatewayAuthBindings,
  transactionId: string,
  publications: readonly SignedAuditEvent[],
): Promise<void> {
  if (bindings.TRANSACTION_EVENTS === undefined || publications.length === 0) return;
  const id = bindings.TRANSACTION_EVENTS.idFromName(transactionId);
  const stub = bindings.TRANSACTION_EVENTS.get(id);
  await stub
    .fetch("https://transaction-events.internal/publish", {
      body: JSON.stringify({
        events: publications.map(({ event }) => ({
          eventType: event.event_type,
          sequence: event.sequence,
          transactionId: event.transaction_id,
        })),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    .catch(() => undefined);
}

async function buildChain(
  bindings: GatewayAuthBindings,
  transactionId: string,
  inputs: readonly AuditEventInput[],
  occurredAt: Date,
  retentionExpiresAt: number,
  previous: SignedAuditEvent | null,
): Promise<readonly SignedAuditEvent[]> {
  const signingKey = await loadOrCreatePlatformSigningKey(bindings, occurredAt.getTime());
  const publications: SignedAuditEvent[] = [];
  let previousHash = previous?.event.event_hash ?? null;
  let sequence = (previous?.event.sequence ?? -1) + 1;
  for (const [index, input] of inputs.entries()) {
    const eventTime = new Date(occurredAt.getTime() + index);
    const buildInput: BuildAuditEventInput = {
      actor: input.actor,
      audience: "https://mindpay.example/",
      eventType: input.eventType,
      expiresAt: new Date(retentionExpiresAt),
      issuer: new URL(bindings.MINDPAY_API_AUDIENCE ?? "https://api.mindpay.example/").href,
      occurredAt: eventTime,
      payload: input.payload,
      previousEventHash: previousHash,
      sequence,
      signingKey,
      transactionId,
    };
    const publication = await buildSignedAuditEvent(buildInput);
    publications.push(publication);
    previousHash = publication.event.event_hash;
    sequence += 1;
  }
  return Object.freeze(publications);
}

async function readAuditHead(
  database: D1Database,
  transactionId: string,
): Promise<SignedAuditEvent | null> {
  const row = await database
    .prepare(
      `SELECT schema_version, event_type, actor_type, actor_id, issuer, audience, jti,
       payload_json, payload_hash, previous_event_hash, event_hash, signature, kid,
       occurred_at, expires_at, sequence, transaction_id
       FROM audit_events WHERE transaction_id = ? ORDER BY sequence DESC LIMIT 1`,
    )
    .bind(transactionId)
    .first();
  return row === null ? null : parseAuditRow(row);
}

function parseAuditRow(untrusted: unknown): SignedAuditEvent {
  const row = untrusted as Readonly<Record<string, unknown>>;
  const occurredAt = numberValue(row.occurred_at);
  const event = auditEventSchema.parse({
    actor: { id: row.actor_id, type: row.actor_type },
    audience: row.audience,
    event_hash: row.event_hash,
    event_type: row.event_type,
    expires_at: new Date(numberValue(row.expires_at)).toISOString(),
    issued_at: new Date(occurredAt).toISOString(),
    issuer: row.issuer,
    jti: row.jti,
    kid: row.kid,
    occurred_at: new Date(occurredAt).toISOString(),
    payload_hash: row.payload_hash,
    previous_event_hash: row.previous_event_hash,
    redacted_payload: parseRecord(row.payload_json),
    schema_version: row.schema_version,
    sequence: row.sequence,
    transaction_id: row.transaction_id,
  });
  return signedAuditEventSchema.parse({ event, signature: parseRecord(row.signature) });
}

function auditInsert(database: D1Database, publication: SignedAuditEvent): D1PreparedStatement {
  const { event, signature } = publication;
  return database
    .prepare(
      `INSERT INTO audit_events
       (id, transaction_id, sequence, schema_version, event_type, actor_type, actor_id, issuer,
        audience, jti, payload_json, payload_hash, previous_event_hash, event_hash, signature,
        kid, occurred_at, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.jti,
      event.transaction_id,
      event.sequence,
      event.schema_version,
      event.event_type,
      event.actor.type,
      event.actor.id,
      event.issuer,
      event.audience,
      event.jti,
      JSON.stringify(event.redacted_payload),
      event.payload_hash,
      event.previous_event_hash,
      event.event_hash,
      JSON.stringify(signature),
      event.kid,
      Date.parse(event.occurred_at),
      Date.parse(event.expires_at),
      Date.parse(event.occurred_at),
    );
}

async function readAuditVerificationKeys(database: D1Database) {
  const result = await database
    .prepare(
      `SELECT kid, public_jwk, valid_from, valid_until, revoked_at FROM platform_signing_keys
       ORDER BY valid_from DESC LIMIT 16`,
    )
    .all();
  return Promise.all(
    result.results.map(async (untrusted) => {
      const row = untrusted as Readonly<Record<string, unknown>>;
      const validUntil = nullableNumber(row.valid_until);
      const revokedAt = nullableNumber(row.revoked_at);
      return {
        kid: stringValue(row.kid),
        publicKey: await importEs256PublicJwk(parseRecord(row.public_jwk)),
        validFromEpochMs: numberValue(row.valid_from),
        ...(validUntil === null ? {} : { validUntilEpochMs: validUntil }),
        ...(revokedAt === null ? {} : { revokedAtEpochMs: revokedAt }),
      };
    }),
  );
}

function parseRecord(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Expected a JSON object");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new TypeError("Expected an integer");
  return value;
}

function nullableNumber(value: unknown): number | null {
  return value === null ? null : numberValue(value);
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a string");
  return value;
}
