import {
  type MerchantPaymentEventType,
  type SignedMerchantPaymentEvent,
  merchantPaymentEventSchema,
  signedMerchantPaymentEventSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import {
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  selectActiveSignalWorksSigningKey,
  signSignalWorksPayloadWithKey,
} from "./identity";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_ORIGIN } from "./publication";

export const SIGNALWORKS_PAYMENT_EVENT_TTL_MS = 10 * 60 * 1_000;

export interface CreateSignalWorksPaymentEventInput {
  readonly amountSubunits: number;
  readonly attemptNumber: number;
  readonly checkoutHash: string;
  readonly checkoutSessionId: string;
  readonly currency: "INR";
  readonly database: D1Database;
  readonly eventId: string;
  readonly eventType: MerchantPaymentEventType;
  readonly fulfilmentEligible: boolean;
  readonly keyEncryptionSecret: unknown;
  readonly nonce: string;
  readonly now: Date;
  readonly orderStatus: "attempted" | "created" | "paid";
  readonly paymentStatus: "authorized" | "captured" | "created" | "failed" | "refunded";
  readonly providerOrderId: string;
  readonly providerPaymentId?: string;
  readonly providerRefundId?: string;
  readonly transactionId: string;
}

export async function createSignalWorksPaymentEventPublication(
  input: CreateSignalWorksPaymentEventInput,
): Promise<SignedMerchantPaymentEvent> {
  const nowEpochMs = input.now.getTime();
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new TypeError("Payment event time must be valid");
  }
  const identity = await readSignalWorksPublicIdentity(input.database);
  if (identity.status !== "ACTIVE") {
    throw new TypeError("SignalWorks is not active");
  }
  const signingKey = selectActiveSignalWorksSigningKey(identity.signingKeys, "event", nowEpochMs);
  const timestamp = input.now.toISOString();
  const event = merchantPaymentEventSchema.parse({
    amount_subunits: input.amountSubunits,
    attempt_number: input.attemptNumber,
    audience: MINDPAY_API_AUDIENCE,
    checkout_hash: input.checkoutHash,
    checkout_session_id: input.checkoutSessionId,
    currency: input.currency,
    event_id: input.eventId,
    event_type: input.eventType,
    expires_at: new Date(nowEpochMs + SIGNALWORKS_PAYMENT_EVENT_TTL_MS).toISOString(),
    fulfilment_eligible: input.fulfilmentEligible,
    issued_at: timestamp,
    issuer: `${SIGNALWORKS_ORIGIN}/`,
    kid: signingKey.kid,
    merchant_id: identity.merchant.merchant_id,
    nonce: input.nonce,
    occurred_at: timestamp,
    order_status: input.orderStatus,
    payment_status: input.paymentStatus,
    provider_order_id: input.providerOrderId,
    ...(input.providerPaymentId === undefined
      ? {}
      : { provider_payment_id: input.providerPaymentId }),
    ...(input.providerRefundId === undefined ? {} : { provider_refund_id: input.providerRefundId }),
    schema_version: "mindpay.merchant.payment-event.1",
    transaction_id: input.transactionId,
  });
  const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(input.keyEncryptionSecret);
  const signature = await signSignalWorksPayloadWithKey(
    input.database,
    keyEncryptionKey,
    signingKey.kid,
    event,
    nowEpochMs,
  );
  return signedMerchantPaymentEventSchema.parse({ event, signature });
}

export async function prepareSignalWorksPaymentEventInsert(
  database: D1Database,
  paymentOrderId: string,
  publication: SignedMerchantPaymentEvent,
): Promise<D1PreparedStatement> {
  const event = publication.event;
  return database
    .prepare(
      "INSERT INTO merchant_payment_events (event_id, payment_order_id, event_type, nonce, kid, event, signature, payload_hash, occurred_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      event.event_id,
      paymentOrderId,
      event.event_type,
      event.nonce,
      event.kid,
      JSON.stringify(event),
      JSON.stringify(publication.signature),
      await sha256CanonicalJsonHex(event),
      Date.parse(event.occurred_at),
      Date.parse(event.expires_at),
      Date.parse(event.occurred_at),
    );
}
