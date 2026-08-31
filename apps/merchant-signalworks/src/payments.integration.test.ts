import { merchantCheckoutSchema, merchantPaymentOrderResponseSchema } from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import { type RazorpayOrder, type RazorpayPayment, createRazorpayHmacHex } from "@mindpay/razorpay";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "./identity";
import { createMerchantApp } from "./index";
import { seedSignalWorksMachineCredential } from "./machine-auth";
import {
  processSignalWorksRazorpayEvent,
  type SignalWorksPaymentBindings,
  type SignalWorksPaymentQueueMessage,
  type SignalWorksRazorpayClient,
} from "./payments";
import { createSignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-08-31T08:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);
const MACHINE_TOKEN = "mindpay_test_machine_token_0000000001";
const KEY_ID = "rzp_test_1234567890abcdef";
const KEY_SECRET = "razorpay_test_key_secret_00000001";
const WEBHOOK_SECRET = "razorpay_test_webhook_secret_0001";
const ORDER_ID = "order_1234567890abcdef";
const PAYMENT_ID = "pay_1234567890abcdef";

describe("SignalWorks Razorpay Test Mode boundary", () => {
  let database: D1Database;
  let miniflare: Miniflare;
  let bindings: SignalWorksPaymentBindings;
  let checkoutHash: string;
  let authorization: Record<string, unknown>;
  let evidence: Map<string, Uint8Array>;
  let queued: SignalWorksPaymentQueueMessage[];
  let providerOrder: RazorpayOrder;
  let providerPayment: RazorpayPayment;
  let client: SignalWorksRazorpayClient;
  let delivered: unknown[];

  beforeEach(async () => {
    ({ database, miniflare } = await createSignalWorksTestDatabase(
      `mindpay-signalworks-payments-${crypto.randomUUID()}`,
    ));
    await seedSignalWorksIdentity(
      database,
      await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET),
      NOW,
    );
    await seedSignalWorksMachineCredential(database, MACHINE_TOKEN, NOW);
    const checkoutSessionId = `checkout_${createUlid(NOW.getTime())}`;
    const checkout = merchantCheckoutSchema.parse({
      audience: "https://api.mindpay.example/",
      checkout_session_id: checkoutSessionId,
      currency: "INR",
      expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
      fulfilment_terms: {
        delivery_type: "mcp",
        policy_url: "https://merchant-demo.example.com/terms",
        summary: "Issue one scoped SignalWorks entitlement.",
      },
      issued_at: NOW.toISOString(),
      issuer: "https://merchant-demo.example.com/",
      kid: "signalworks.checkout.2026-01",
      line_items: [
        {
          line_total_subunits: 29_900,
          quantity: 1,
          service_id: "market_snapshot",
          service_version: "1.0.0",
          unit_price_subunits: 29_900,
        },
      ],
      merchant_domain: "merchant-demo.example.com",
      merchant_id: "merchant_signalworks",
      nonce: "nonce_payment_checkout_0001",
      schema_version: "1",
      total_subunits: 29_900,
    });
    checkoutHash = await sha256CanonicalJsonHex(checkout);
    await database
      .prepare(
        "INSERT INTO merchant_checkout_sessions (id, credential_id, status, revision, acp_state, acp_state_hash, acp_signature, merchant_checkout, merchant_checkout_signature, created_at, updated_at, expires_at) VALUES (?, 'machine_mindpay_gateway', 'ready_for_payment', 1, '{}', ?, '{}', ?, '{}', ?, ?, ?)",
      )
      .bind(
        checkoutSessionId,
        "a".repeat(64),
        JSON.stringify(checkout),
        NOW.getTime(),
        NOW.getTime(),
        NOW.getTime() + 15 * 60_000,
      )
      .run();
    authorization = {
      agent_id: `agt_${createUlid(NOW.getTime() + 1)}`,
      amount_subunits: 29_900,
      attempt_number: 1,
      checkout_hash: checkoutHash,
      checkout_session_id: checkoutSessionId,
      closed_payment_mandate_hash: "b".repeat(64),
      currency: "INR",
      mandate_id: `mnd_${createUlid(NOW.getTime() + 2)}`,
      payment_rail: "razorpay:test",
      service_id: "market_snapshot",
      transaction_id: `ctx_${createUlid(NOW.getTime() + 3)}`,
    };
    evidence = new Map();
    delivered = [];
    queued = [];
    providerOrder = {
      amount: 29_900,
      amount_due: 29_900,
      amount_paid: 0,
      attempts: 0,
      created_at: Math.floor(NOW.getTime() / 1_000),
      currency: "INR",
      entity: "order",
      id: ORDER_ID,
      notes: {},
      receipt: "replaced_by_mock",
      status: "created",
    };
    providerPayment = {
      amount: 29_900,
      amount_refunded: 0,
      captured: true,
      created_at: Math.floor(NOW.getTime() / 1_000),
      currency: "INR",
      entity: "payment",
      id: PAYMENT_ID,
      order_id: ORDER_ID,
      status: "captured",
    };
    client = {
      createOrder: vi.fn(async (input) => ({
        ...providerOrder,
        notes: input.notes,
        receipt: input.receipt,
      })),
      createRefund: vi.fn(async () => ({
        amount: 29_900,
        created_at: Math.floor(NOW.getTime() / 1_000),
        currency: "INR" as const,
        entity: "refund" as const,
        id: "rfnd_1234567890abcdef",
        payment_id: PAYMENT_ID,
        status: "pending" as const,
      })),
      fetchOrder: vi.fn(async () => providerOrder),
      fetchPayment: vi.fn(async () => providerPayment),
      fetchRefund: vi.fn(async () => {
        throw new Error("not used");
      }),
    };
    bindings = {
      DB: database,
      ENVIRONMENT: "test",
      MINDPAY_GATEWAY: {
        fetch: async (request: Request) => {
          delivered.push(await request.json());
          return new Response(null, { status: 204 });
        },
      } as unknown as Fetcher,
      PAYMENT_EVENTS: {
        send: async (message: SignalWorksPaymentQueueMessage) => {
          queued.push(message);
        },
      } as unknown as Queue<SignalWorksPaymentQueueMessage>,
      PAYMENT_EVIDENCE: {
        get: async (key: string) => {
          const body = evidence.get(key);
          return body === undefined
            ? null
            : ({ arrayBuffer: async () => body.slice().buffer } as unknown as R2ObjectBody);
        },
        put: async (key: string, value: Uint8Array) => {
          evidence.set(key, value.slice());
          return {} as R2Object;
        },
      } as unknown as R2Bucket,
      RAZORPAY_KEY_ID: KEY_ID,
      RAZORPAY_KEY_SECRET: KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
      SIGNALWORKS_MACHINE_AUTH_TOKEN: MACHINE_TOKEN,
    };
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("creates exactly one authorized provider order and exposes only safe checkout fields", async () => {
    const app = appFor(client);
    const first = await createOrder(app, authorization, "payment-order-idempotency-0001");
    expect(first.status).toBe(201);
    const body = merchantPaymentOrderResponseSchema.parse(await first.json());
    expect(body).toMatchObject({
      checkout: { key: KEY_ID, order_id: ORDER_ID, retry: { enabled: false } },
      state: "PAYMENT_PENDING",
    });
    expect(JSON.stringify(body)).not.toContain(KEY_SECRET);
    expect(client.createOrder).toHaveBeenCalledOnce();

    const replay = await createOrder(app, authorization, "payment-order-idempotency-0001");
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(client.createOrder).toHaveBeenCalledOnce();

    const conflict = await createOrder(
      app,
      { ...authorization, amount_subunits: 30_000 },
      "payment-order-idempotency-0001",
    );
    expect(conflict.status).toBe(409);
    expect(client.createOrder).toHaveBeenCalledOnce();
  });

  it("keeps callbacks non-authoritative and fulfils only after captured+paid reconciliation", async () => {
    const app = appFor(client);
    await createOrder(app, authorization, "payment-order-idempotency-0002");
    const invalid = await app.request(
      "https://merchant-demo.example.com/payments/callback",
      {
        body: JSON.stringify({
          razorpay_order_id: ORDER_ID,
          razorpay_payment_id: PAYMENT_ID,
          razorpay_signature: "0".repeat(64),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      bindings,
    );
    expect(invalid.status).toBe(400);
    expect(await count("merchant_payment_callbacks")).toBe(0);

    const signature = await createRazorpayHmacHex(KEY_SECRET, `${ORDER_ID}|${PAYMENT_ID}`);
    const callback = await app.request(
      "https://merchant-demo.example.com/payments/callback",
      {
        body: new URLSearchParams({
          razorpay_order_id: ORDER_ID,
          razorpay_payment_id: PAYMENT_ID,
          razorpay_signature: signature,
        }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
      bindings,
    );
    expect(callback.status).toBe(202);
    expect(await callback.json()).toEqual({
      fulfilment_eligible: false,
      state: "PAYMENT_RECONCILING",
    });

    providerOrder = { ...providerOrder, amount_due: 0, amount_paid: 29_900, status: "paid" };
    const webhook = paymentWebhook("payment.captured", providerPayment);
    expect(await sendWebhook(app, "rzp-event-captured-0001", webhook, WEBHOOK_SECRET)).toBe(204);
    expect(queued).toEqual([{ providerEventId: "rzp-event-captured-0001" }]);
    await processSignalWorksRazorpayEvent(bindings, requiredMessage(queued[0]), {
      now: () => new Date(NOW.getTime() + 1_000),
      razorpayClient: () => client,
    });
    const stored = await database
      .prepare(
        "SELECT status, order_status, payment_status, fulfilment_eligible FROM merchant_payment_orders LIMIT 1",
      )
      .first<Record<string, unknown>>();
    expect(stored).toEqual({
      fulfilment_eligible: 1,
      order_status: "paid",
      payment_status: "captured",
      status: "CAPTURED",
    });
    const publication = await database
      .prepare("SELECT event FROM merchant_payment_events LIMIT 1")
      .first<{ event: string }>();
    expect(JSON.parse(publication?.event ?? "{}")).toMatchObject({
      event_type: "PAYMENT_CAPTURED",
      fulfilment_eligible: true,
    });
    expect(delivered).toHaveLength(1);
    await processSignalWorksRazorpayEvent(bindings, requiredMessage(queued[0]), {
      now: () => new Date(NOW.getTime() + 1_001),
      razorpayClient: () => client,
    });
    expect(delivered).toHaveLength(2);
    expect(await count("merchant_payment_events")).toBe(1);

    expect(await sendWebhook(app, "rzp-event-captured-0001", webhook, WEBHOOK_SECRET)).toBe(204);
    expect(queued).toHaveLength(1);
    expect(await count("merchant_provider_events")).toBe(1);
  });

  it("rejects invalid webhooks without evidence writes and handles paid-before-captured order", async () => {
    const app = appFor(client);
    await createOrder(app, authorization, "payment-order-idempotency-0003");
    providerOrder = { ...providerOrder, amount_due: 0, amount_paid: 29_900, status: "paid" };
    const paidWebhook = orderWebhook(providerOrder);
    expect(
      await sendWebhook(app, "rzp-event-invalid-0001", paidWebhook, "wrong_secret_0000000000"),
    ).toBe(401);
    expect(evidence.size).toBe(0);
    expect(await count("merchant_provider_events")).toBe(0);

    expect(await sendWebhook(app, "rzp-event-order-paid-0001", paidWebhook, WEBHOOK_SECRET)).toBe(
      204,
    );
    await processSignalWorksRazorpayEvent(bindings, requiredMessage(queued.shift()), {
      now: () => new Date(NOW.getTime() + 2_000),
      razorpayClient: () => client,
    });
    expect(
      await database.prepare("SELECT status FROM merchant_payment_orders LIMIT 1").first(),
    ).toEqual({ status: "RECONCILING" });

    const capturedWebhook = paymentWebhook("payment.captured", providerPayment);
    expect(await sendWebhook(app, "rzp-event-captured-0002", capturedWebhook, WEBHOOK_SECRET)).toBe(
      204,
    );
    await processSignalWorksRazorpayEvent(bindings, requiredMessage(queued.shift()), {
      now: () => new Date(NOW.getTime() + 3_000),
      razorpayClient: () => client,
    });
    expect(
      await database
        .prepare("SELECT status, fulfilment_eligible FROM merchant_payment_orders LIMIT 1")
        .first(),
    ).toEqual({ fulfilment_eligible: 1, status: "CAPTURED" });
  });

  it("keeps refunds and provider-status reads unreachable until independently enabled", async () => {
    const app = appFor(client);
    await createOrder(app, authorization, "payment-order-idempotency-0004");
    const headers = {
      Authorization: `Bearer ${MACHINE_TOKEN}`,
      "Content-Type": "application/json",
    };
    const transactionId = String(authorization.transaction_id);
    const disabledRefund = await app.request(
      `https://merchant-demo.example.com/payments/${transactionId}/refunds`,
      { body: JSON.stringify({ amount_subunits: 29_900 }), headers, method: "POST" },
      bindings,
    );
    expect(disabledRefund.status).toBe(404);
    const disabledRead = await app.request(
      `https://merchant-demo.example.com/payments/${transactionId}/provider-status`,
      { headers, method: "GET" },
      bindings,
    );
    expect(disabledRead.status).toBe(404);

    providerOrder = { ...providerOrder, amount_due: 0, amount_paid: 29_900, status: "paid" };
    expect(
      await sendWebhook(
        app,
        "rzp-event-captured-refund-0001",
        paymentWebhook("payment.captured", providerPayment),
        WEBHOOK_SECRET,
      ),
    ).toBe(204);
    await processSignalWorksRazorpayEvent(bindings, requiredMessage(queued.shift()), {
      now: () => new Date(NOW.getTime() + 4_000),
      razorpayClient: () => client,
    });
    bindings = {
      ...bindings,
      RAZORPAY_MCP_READONLY_ENABLED: "true",
      RAZORPAY_REFUNDS_ENABLED: "true",
    };
    const enabledRead = await app.request(
      `https://merchant-demo.example.com/payments/${transactionId}/provider-status`,
      { headers, method: "GET" },
      bindings,
    );
    expect(enabledRead.status).toBe(200);
    await expect(enabledRead.json()).resolves.toMatchObject({
      order_status: "paid",
      payment_status: "captured",
    });
    const refund = await app.request(
      `https://merchant-demo.example.com/payments/${transactionId}/refunds`,
      { body: JSON.stringify({ amount_subunits: 29_900 }), headers, method: "POST" },
      bindings,
    );
    expect(refund.status).toBe(202);
    await expect(refund.json()).resolves.toMatchObject({ state: "REFUND_PENDING" });
    expect(client.createRefund).toHaveBeenCalledOnce();
  });

  function appFor(razorpayClient: SignalWorksRazorpayClient) {
    return createMerchantApp({ now: () => NOW, razorpayClient: () => razorpayClient });
  }

  async function createOrder(
    app: ReturnType<typeof createMerchantApp>,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return app.request(
      "https://merchant-demo.example.com/payments/orders",
      {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${MACHINE_TOKEN}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "Request-Id": `request-${idempotencyKey}`,
        },
        method: "POST",
      },
      bindings,
    );
  }

  async function sendWebhook(
    app: ReturnType<typeof createMerchantApp>,
    eventId: string,
    body: Record<string, unknown>,
    secret: string,
  ) {
    const raw = JSON.stringify(body);
    const signature = await createRazorpayHmacHex(secret, raw);
    return (
      await app.request(
        "https://merchant-demo.example.com/webhooks/razorpay",
        {
          body: raw,
          headers: {
            "Content-Type": "application/json",
            "x-razorpay-event-id": eventId,
            "x-razorpay-signature": signature,
          },
          method: "POST",
        },
        bindings,
      )
    ).status;
  }

  async function count(table: string): Promise<number> {
    const row = await database
      .prepare(`SELECT count(*) AS count FROM ${table}`)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  function requiredMessage(
    message: SignalWorksPaymentQueueMessage | undefined,
  ): SignalWorksPaymentQueueMessage {
    if (message === undefined) throw new Error("Expected a queued Razorpay provider event");
    return message;
  }
});

function paymentWebhook(event: "payment.captured", payment: RazorpayPayment) {
  return {
    account_id: "acc_test_0001",
    contains: ["payment"],
    created_at: Math.floor(NOW.getTime() / 1_000),
    entity: "event",
    event,
    payload: { payment: { entity: payment } },
  };
}

function orderWebhook(order: RazorpayOrder) {
  return {
    account_id: "acc_test_0001",
    contains: ["order"],
    created_at: Math.floor(NOW.getTime() / 1_000),
    entity: "event",
    event: "order.paid",
    payload: { order: { entity: order } },
  };
}
