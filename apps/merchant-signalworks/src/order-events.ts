import {
  type MerchantOrderLifecycleEvent,
  type SignedMerchantOrderLifecycleEvent,
  merchantOrderEventTypeSchema,
  merchantOrderLifecycleEventSchema,
  signedMerchantOrderLifecycleEventSchema,
} from "@mindpay/contracts";
import { createUlid } from "@mindpay/domain";
import { z } from "zod";
import {
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  selectActiveSignalWorksSigningKey,
  signSignalWorksPayloadWithKey,
} from "./identity";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_ORIGIN } from "./publication";

export const SIGNALWORKS_ORDER_EVENT_TTL_MS = 10 * 60 * 1_000;

const inputSchema = z
  .object({
    checkoutSessionId: z.string(),
    eventId: z.string(),
    eventType: merchantOrderEventTypeSchema,
    nonce: z.string(),
    orderId: z.string().optional(),
    stateHash: z.string(),
    status: z.enum(["ready_for_payment", "completed", "canceled"]),
  })
  .strict();

export interface CreateSignalWorksOrderEventInput {
  readonly checkoutSessionId: string;
  readonly database: D1Database;
  readonly eventId?: string;
  readonly eventType: z.infer<typeof merchantOrderEventTypeSchema>;
  readonly keyEncryptionSecret: unknown;
  readonly nonce?: string;
  readonly now: Date;
  readonly orderId?: string;
  readonly stateHash: string;
  readonly status: "ready_for_payment" | "completed" | "canceled";
}

export async function createSignalWorksOrderEventPublication(
  input: CreateSignalWorksOrderEventInput,
): Promise<SignedMerchantOrderLifecycleEvent> {
  const nowEpochMs = assertDate(input.now).getTime();
  const parsed = inputSchema.parse({
    checkoutSessionId: input.checkoutSessionId,
    eventId: input.eventId ?? `evt_${createUlid(nowEpochMs)}`,
    eventType: input.eventType,
    nonce: input.nonce ?? `nonce_event_${createUlid(nowEpochMs)}`,
    ...(input.orderId === undefined ? {} : { orderId: input.orderId }),
    stateHash: input.stateHash,
    status: input.status,
  });
  const identity = await readSignalWorksPublicIdentity(input.database);
  if (identity.status !== "ACTIVE") {
    throw new SignalWorksOrderEventError("SignalWorks is not active");
  }
  const signingKey = selectActiveSignalWorksSigningKey(identity.signingKeys, "event", nowEpochMs);
  const timestamp = input.now.toISOString();
  const event = merchantOrderLifecycleEventSchema.parse({
    audience: MINDPAY_API_AUDIENCE,
    checkout_session_id: parsed.checkoutSessionId,
    event_id: parsed.eventId,
    event_type: parsed.eventType,
    expires_at: new Date(nowEpochMs + SIGNALWORKS_ORDER_EVENT_TTL_MS).toISOString(),
    issued_at: timestamp,
    issuer: `${SIGNALWORKS_ORIGIN}/`,
    kid: signingKey.kid,
    merchant_id: identity.merchant.merchant_id,
    nonce: parsed.nonce,
    occurred_at: timestamp,
    ...(parsed.orderId === undefined ? {} : { order_id: parsed.orderId }),
    schema_version: "mindpay.merchant.order-event.1",
    state_hash: parsed.stateHash,
    status: parsed.status,
  });
  const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(input.keyEncryptionSecret);
  const signature = await signSignalWorksPayloadWithKey(
    input.database,
    keyEncryptionKey,
    signingKey.kid,
    event,
    nowEpochMs,
  );
  return signedMerchantOrderLifecycleEventSchema.parse({ event, signature });
}

export function prepareSignalWorksOrderEventInsert(
  database: D1Database,
  publication: SignedMerchantOrderLifecycleEvent,
): D1PreparedStatement {
  const event: MerchantOrderLifecycleEvent = publication.event;
  return database
    .prepare(
      "INSERT INTO merchant_outbound_events (event_id, checkout_session_id, event_type, nonce, kid, event, signature, state_hash, occurred_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      event.event_id,
      event.checkout_session_id,
      event.event_type,
      event.nonce,
      event.kid,
      JSON.stringify(event),
      JSON.stringify(publication.signature),
      event.state_hash,
      Date.parse(event.occurred_at),
      Date.parse(event.expires_at),
      Date.parse(event.occurred_at),
    );
}

export function prepareConditionalSignalWorksOrderEventInsert(
  database: D1Database,
  publication: SignedMerchantOrderLifecycleEvent,
  expectedRevision: number,
  expectedStatus: "ready_for_payment",
): D1PreparedStatement {
  const event = publication.event;
  return database
    .prepare(
      "INSERT INTO merchant_outbound_events (event_id, checkout_session_id, event_type, nonce, kid, event, signature, state_hash, occurred_at, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM merchant_checkout_sessions WHERE id = ? AND revision = ? AND status = ?)",
    )
    .bind(
      event.event_id,
      event.checkout_session_id,
      event.event_type,
      event.nonce,
      event.kid,
      JSON.stringify(event),
      JSON.stringify(publication.signature),
      event.state_hash,
      Date.parse(event.occurred_at),
      Date.parse(event.expires_at),
      Date.parse(event.occurred_at),
      event.checkout_session_id,
      expectedRevision,
      expectedStatus,
    );
}

export class SignalWorksOrderEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksOrderEventError";
  }
}

function assertDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime()) || value.getTime() < 0) {
    throw new SignalWorksOrderEventError("Order event time must be a valid date");
  }
  return value;
}
