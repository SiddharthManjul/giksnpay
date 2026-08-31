import {
  type SignedMerchantPaymentEvent,
  signedMerchantPaymentEventSchema,
} from "@mindpay/contracts";
import {
  hexToBytes,
  importEs256PublicJwk,
  sha256CanonicalJsonHex,
  sha256Hex,
  timingSafeEqual,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import { Hono } from "hono";
import type { GatewayEnvironment } from "./authorization";

const PAYMENT_EVENT_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1_000;

export interface MerchantPaymentEventDependencies {
  readonly now?: () => Date;
}

export function createMerchantPaymentEventRoutes(
  dependencies: MerchantPaymentEventDependencies = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const routes = new Hono<GatewayEnvironment>();
  routes.post("/merchant-payment-events", async (context) => {
    const receivedAt = now();
    if (!(await validMachineToken(context.req.header("Authorization"), context.env))) {
      return context.json({ code: "UNAUTHORIZED" }, 401);
    }
    let publication: SignedMerchantPaymentEvent;
    try {
      publication = signedMerchantPaymentEventSchema.parse(await context.req.json());
    } catch {
      return context.json({ code: "INVALID_PAYMENT_EVENT" }, 400);
    }
    const event = publication.event;
    const payloadHash = await sha256CanonicalJsonHex(event);
    const duplicate = await context.env.DB.prepare(
      "SELECT payload_hash FROM consumed_nonces WHERE organization_id = (SELECT organization_id FROM transactions WHERE id = ?) AND scope = 'merchant-payment-event' AND nonce = ? LIMIT 1",
    )
      .bind(event.transaction_id, event.nonce)
      .first<{ payload_hash: string }>();
    if (duplicate !== null) {
      return duplicate.payload_hash === payloadHash
        ? new Response(null, { status: 204 })
        : context.json({ code: "PAYMENT_EVENT_REPLAY_CONFLICT" }, 409);
    }
    const verified = await verifyMerchantPaymentPublication(
      context.env.DB,
      publication,
      context.env.MINDPAY_API_AUDIENCE ?? "https://api.mindpay.example/",
      receivedAt,
    );
    if (!verified) return context.json({ code: "INVALID_PAYMENT_EVENT_SIGNATURE" }, 401);
    const transaction = await context.env.DB.prepare(
      "SELECT id, organization_id, mandate_id, merchant_id, state, retention_expires_at FROM transactions WHERE id = ? AND merchant_id = ? LIMIT 1",
    )
      .bind(event.transaction_id, event.merchant_id)
      .first<{
        id: string;
        mandate_id: string;
        merchant_id: string;
        organization_id: string;
        retention_expires_at: number;
        state: string;
      }>();
    if (transaction === null) return context.json({ code: "PAYMENT_EVENT_NOT_FOUND" }, 404);
    const attempt = await context.env.DB.prepare(
      "SELECT id, provider_order_id, status FROM payment_attempts WHERE transaction_id = ? AND attempt_number = ? LIMIT 1",
    )
      .bind(transaction.id, event.attempt_number)
      .first<{ id: string; provider_order_id: string | null; status: string }>();
    if (attempt === null || attempt.provider_order_id !== event.provider_order_id) {
      return context.json({ code: "PAYMENT_EVENT_MISMATCH" }, 409);
    }
    const activeReservation = await context.env.DB.prepare(
      "SELECT id FROM spend_reservations WHERE transaction_id = ? AND status = 'RESERVED' LIMIT 1",
    )
      .bind(transaction.id)
      .first<{ id: string }>();
    const statements: D1PreparedStatement[] = [];
    let nextState = transaction.state;
    if (event.event_type === "PAYMENT_FAILED") {
      nextState = "PAYMENT_FAILED";
      statements.push(
        context.env.DB.prepare(
          "UPDATE payment_attempts SET provider_payment_id = coalesce(provider_payment_id, ?), status = 'FAILED', order_status = ?, payment_status = 'failed', fulfilment_eligible = 0, provider_snapshot_json = ?, failure_code = 'PAYMENT_FAILED', completed_at = ?, updated_at = ? WHERE id = ? AND status IN ('CREATED', 'PENDING')",
        ).bind(
          event.provider_payment_id ?? null,
          event.order_status,
          JSON.stringify(event),
          receivedAt.getTime(),
          receivedAt.getTime(),
          attempt.id,
        ),
      );
      if (activeReservation !== null) {
        statements.push(
          context.env.DB.prepare(
            "UPDATE spend_reservations SET status = 'RELEASED', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'RESERVED'",
          ).bind(receivedAt.getTime(), receivedAt.getTime(), activeReservation.id),
        );
      }
    } else if (event.fulfilment_eligible) {
      if (activeReservation === null) {
        nextState = "PAYMENT_RECONCILING";
        statements.push(
          context.env.DB.prepare(
            "UPDATE payment_attempts SET provider_payment_id = coalesce(provider_payment_id, ?), order_status = ?, payment_status = ?, fulfilment_eligible = 0, provider_snapshot_json = ?, updated_at = ? WHERE id = ?",
          ).bind(
            event.provider_payment_id ?? null,
            event.order_status,
            event.payment_status,
            JSON.stringify(event),
            receivedAt.getTime(),
            attempt.id,
          ),
        );
      } else {
        nextState = "PAYMENT_CAPTURED";
        statements.push(
          context.env.DB.prepare(
            "UPDATE payment_attempts SET provider_payment_id = ?, status = 'SUCCEEDED', order_status = 'paid', payment_status = 'captured', fulfilment_eligible = 1, provider_snapshot_json = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status IN ('CREATED', 'PENDING')",
          ).bind(
            event.provider_payment_id,
            JSON.stringify(event),
            receivedAt.getTime(),
            receivedAt.getTime(),
            attempt.id,
          ),
          context.env.DB.prepare(
            "UPDATE spend_reservations SET status = 'COMMITTED', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'RESERVED'",
          ).bind(receivedAt.getTime(), receivedAt.getTime(), activeReservation.id),
        );
      }
    } else if (event.event_type === "REFUND_PENDING") {
      nextState = "REFUND_PENDING";
      statements.push(
        context.env.DB.prepare(
          "UPDATE payment_attempts SET payment_status = ?, fulfilment_eligible = 0, provider_snapshot_json = ?, updated_at = ? WHERE id = ?",
        ).bind(event.payment_status, JSON.stringify(event), receivedAt.getTime(), attempt.id),
      );
    } else if (event.event_type === "REFUNDED") {
      nextState = "REFUNDED";
      statements.push(
        context.env.DB.prepare(
          "UPDATE payment_attempts SET payment_status = 'refunded', fulfilment_eligible = 0, provider_snapshot_json = ?, updated_at = ? WHERE id = ?",
        ).bind(JSON.stringify(event), receivedAt.getTime(), attempt.id),
      );
    } else {
      nextState = "PAYMENT_RECONCILING";
      statements.push(
        context.env.DB.prepare(
          "UPDATE payment_attempts SET provider_payment_id = coalesce(provider_payment_id, ?), order_status = ?, payment_status = ?, fulfilment_eligible = 0, provider_snapshot_json = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'",
        ).bind(
          event.provider_payment_id ?? null,
          event.order_status,
          event.payment_status,
          JSON.stringify(event),
          receivedAt.getTime(),
          attempt.id,
        ),
      );
    }
    statements.push(
      context.env.DB.prepare("UPDATE transactions SET state = ?, updated_at = ? WHERE id = ?").bind(
        nextState,
        receivedAt.getTime(),
        transaction.id,
      ),
      context.env.DB.prepare(
        "INSERT INTO consumed_nonces (id, organization_id, mandate_id, transaction_id, source, scope, nonce, payload_hash, consumed_at, retention_expires_at, created_at) VALUES (?, ?, ?, ?, 'MERCHANT_EVENT', 'merchant-payment-event', ?, ?, ?, ?, ?)",
      ).bind(
        `rpn_${createUlid(receivedAt.getTime())}`,
        transaction.organization_id,
        transaction.mandate_id,
        transaction.id,
        event.nonce,
        payloadHash,
        receivedAt.getTime(),
        Math.max(
          transaction.retention_expires_at,
          receivedAt.getTime() + PAYMENT_EVENT_RETENTION_MS,
        ),
        receivedAt.getTime(),
      ),
      context.env.DB.prepare(
        "INSERT INTO provider_events (id, organization_id, transaction_id, payment_attempt_id, provider, provider_event_id, event_type, payload_hash, raw_payload_r2_key, signature_verified, processing_status, received_at, processed_at, retention_expires_at, created_at) VALUES (?, ?, ?, ?, 'RAZORPAY', ?, ?, ?, ?, 1, 'PROCESSED', ?, ?, ?, ?)",
      ).bind(
        `pev_${createUlid(receivedAt.getTime())}`,
        transaction.organization_id,
        transaction.id,
        attempt.id,
        event.event_id,
        event.event_type,
        payloadHash,
        `signalworks-payment-event/${event.event_id}`,
        receivedAt.getTime(),
        receivedAt.getTime(),
        Math.max(
          transaction.retention_expires_at,
          receivedAt.getTime() + PAYMENT_EVENT_RETENTION_MS,
        ),
        receivedAt.getTime(),
      ),
    );
    try {
      await context.env.DB.batch(statements);
    } catch {
      return context.json({ code: "PAYMENT_EVENT_STATE_CONFLICT" }, 409);
    }
    return new Response(null, { status: 204 });
  });
  return routes;
}

async function verifyMerchantPaymentPublication(
  database: D1Database,
  publication: SignedMerchantPaymentEvent,
  expectedAudience: string,
  now: Date,
): Promise<boolean> {
  const event = publication.event;
  if (
    event.audience !== expectedAudience ||
    Date.parse(event.issued_at) > now.getTime() ||
    Date.parse(event.expires_at) <= now.getTime()
  ) {
    return false;
  }
  const row = await database
    .prepare(
      `SELECT m.domain, k.public_jwk, k.valid_from, k.valid_until, k.revoked_at
     FROM merchants m JOIN merchant_keys k ON k.merchant_id = m.id
     WHERE m.id = ? AND k.kid = ? AND k.purpose = 'event' LIMIT 1`,
    )
    .bind(event.merchant_id, event.kid)
    .first<{
      domain: string;
      public_jwk: string;
      revoked_at: number | null;
      valid_from: number;
      valid_until: number | null;
    }>();
  if (row === null || event.issuer !== `https://${row.domain}/`) return false;
  try {
    const verification = await verifyCanonicalJsonEs256(
      event,
      publication.signature,
      [
        {
          kid: event.kid,
          publicKey: await importEs256PublicJwk(JSON.parse(row.public_jwk) as unknown),
          validFromEpochMs: row.valid_from,
          ...(row.valid_until === null ? {} : { validUntilEpochMs: row.valid_until }),
          ...(row.revoked_at === null ? {} : { revokedAtEpochMs: row.revoked_at }),
        },
      ],
      now.getTime(),
    );
    return verification.valid;
  } catch {
    return false;
  }
}

async function validMachineToken(
  authorizationHeader: string | undefined,
  bindings: GatewayEnvironment["Bindings"],
): Promise<boolean> {
  const expected = bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN;
  const received = /^Bearer ([^\s]+)$/u.exec(authorizationHeader ?? "")?.[1];
  if (expected === undefined || received === undefined) return false;
  const [expectedHash, receivedHash] = await Promise.all([
    sha256Hex(expected),
    sha256Hex(received),
  ]);
  return timingSafeEqual(hexToBytes(expectedHash), hexToBytes(receivedHash));
}
