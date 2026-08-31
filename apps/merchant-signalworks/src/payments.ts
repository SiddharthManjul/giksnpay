import { parseSignalWorksPaymentEnvironment } from "@mindpay/config";
import {
  type MerchantPaymentAuthorization,
  type MerchantPaymentOrderResponse,
  merchantCheckoutSchema,
  merchantPaymentAuthorizationSchema,
  merchantPaymentOrderResponseSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex, sha256Hex } from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import {
  RazorpayClient,
  type RazorpayOrder,
  type RazorpayPayment,
  type RazorpayRefund,
  parseRazorpayWebhook,
  reconcileRazorpayPayment,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "@mindpay/razorpay";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { authenticateSignalWorksMachine } from "./machine-auth";
import {
  createSignalWorksPaymentEventPublication,
  prepareSignalWorksPaymentEventInsert,
} from "./payment-events";

const PAYMENT_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1_000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const paymentOrderRowSchema = z
  .object({
    agent_id: z.string(),
    amount_subunits: z.number().int().positive(),
    attempt_number: z.number().int().positive(),
    checkout_hash: z.string(),
    checkout_session_id: z.string(),
    closed_payment_mandate_hash: z.string(),
    currency: z.literal("INR"),
    failure_code: z.string().nullable(),
    fulfilment_eligible: z.union([z.literal(0), z.literal(1)]),
    id: z.string(),
    mandate_id: z.string(),
    order_status: z.enum(["created", "attempted", "paid"]).nullable(),
    payment_status: z.enum(["created", "authorized", "captured", "refunded", "failed"]).nullable(),
    provider_order_id: z.string().nullable(),
    provider_order_snapshot: z.string().nullable(),
    provider_payment_id: z.string().nullable(),
    provider_payment_snapshot: z.string().nullable(),
    provider_refund_id: z.string().nullable(),
    receipt: z.string(),
    service_id: z.string(),
    status: z.enum([
      "CREATING",
      "CREATED",
      "PENDING",
      "RECONCILING",
      "FAILED",
      "CAPTURED",
      "REFUND_PENDING",
      "REFUNDED",
    ]),
    transaction_id: z.string(),
  })
  .strict();
type PaymentOrderRow = z.infer<typeof paymentOrderRowSchema>;

const providerEventRowSchema = z
  .object({
    event_type: z.string(),
    id: z.string(),
    payload_hash: z.string(),
    processing_status: z.enum(["VERIFIED", "PROCESSED", "REJECTED"]),
    provider_event_id: z.string(),
    raw_payload_r2_key: z.string(),
  })
  .strict();

const callbackSchema = z
  .object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{8,64}$/u),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{8,64}$/u),
    razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

const refundRequestSchema = z.object({ amount_subunits: z.number().int().positive() }).strict();

export interface SignalWorksPaymentQueueMessage {
  readonly providerEventId: string;
}

export interface SignalWorksPaymentBindings {
  DB: D1Database;
  ENVIRONMENT: string;
  MINDPAY_GATEWAY: Fetcher;
  PAYMENT_EVENTS: Queue<SignalWorksPaymentQueueMessage>;
  PAYMENT_EVIDENCE: R2Bucket;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_MCP_READONLY_ENABLED?: string;
  RAZORPAY_REFUNDS_ENABLED?: string;
  RAZORPAY_WEBHOOK_OLD_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  SIGNALWORKS_KEY_ENCRYPTION_KEY: string;
  SIGNALWORKS_MACHINE_AUTH_TOKEN: string;
}

export type SignalWorksRazorpayClient = Pick<
  RazorpayClient,
  "createOrder" | "createRefund" | "fetchOrder" | "fetchPayment" | "fetchRefund"
>;

export interface SignalWorksPaymentDependencies {
  readonly createCallbackId: (now: Date) => string;
  readonly createPaymentEventId: (now: Date) => string;
  readonly createPaymentOrderId: (now: Date) => string;
  readonly createProviderEventId: (now: Date) => string;
  readonly now: () => Date;
  readonly razorpayClient: (bindings: SignalWorksPaymentBindings) => SignalWorksRazorpayClient;
}

const defaultDependencies: Omit<SignalWorksPaymentDependencies, "razorpayClient"> = Object.freeze({
  createCallbackId: (now: Date) => `pcb_${createUlid(now.getTime())}`,
  createPaymentEventId: (now: Date) => `evt_${createUlid(now.getTime())}`,
  createPaymentOrderId: (now: Date) => `mpo_${createUlid(now.getTime())}`,
  createProviderEventId: (now: Date) => `rpe_${createUlid(now.getTime())}`,
  now: () => new Date(),
});

export function createSignalWorksPaymentRoutes(
  overrides: Partial<SignalWorksPaymentDependencies> = {},
): Hono<{ Bindings: SignalWorksPaymentBindings }> {
  const dependencies = resolveDependencies(overrides);
  const routes = new Hono<{ Bindings: SignalWorksPaymentBindings }>();

  routes.post("/payments/orders", async (context) => createPaymentOrder(context, dependencies));
  routes.post("/payments/callback", async (context) =>
    verifyCheckoutCallback(context, dependencies),
  );
  routes.post("/webhooks/razorpay", async (context) => acceptWebhook(context, dependencies));
  routes.post("/payments/:transactionId/refunds", async (context) =>
    createPaymentRefund(context, dependencies),
  );
  routes.get("/payments/:transactionId/provider-status", async (context) =>
    readProviderStatus(context, dependencies),
  );
  return routes;
}

async function createPaymentOrder(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  dependencies: SignalWorksPaymentDependencies,
): Promise<Response> {
  const now = dependencies.now();
  if (!(await authenticate(context, now))) return jsonError(context, 401, "UNAUTHORIZED");
  const body = await readJson(context.req.raw);
  const parsed = merchantPaymentAuthorizationSchema.safeParse(body);
  if (!parsed.success) return jsonError(context, 400, "INVALID_PAYMENT_AUTHORIZATION");
  const idempotencyKey = context.req.header("Idempotency-Key");
  const requestId = context.req.header("Request-Id") ?? crypto.randomUUID();
  if (idempotencyKey === undefined || idempotencyKey.length > 255) {
    return jsonError(context, 400, "IDEMPOTENCY_KEY_REQUIRED");
  }
  const requestHash = await sha256CanonicalJsonHex(parsed.data);
  const claim = await claimIdempotency(
    context.env.DB,
    "POST /payments/orders",
    idempotencyKey,
    requestId,
    requestHash,
    now,
  );
  if (claim.kind === "conflict") return jsonError(context, 409, "IDEMPOTENCY_CONFLICT");
  if (claim.kind === "pending") return jsonError(context, 409, "PAYMENT_ORDER_IN_PROGRESS");
  if (claim.kind === "replay") {
    const replay = new Response(JSON.stringify(claim.body), {
      headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
      status: claim.status,
    });
    return replay;
  }

  const checkout = await readAuthorizedCheckout(context.env.DB, parsed.data, now);
  if (checkout === undefined) {
    return completeError(context, idempotencyKey, 409, "CHECKOUT_AUTHORIZATION_MISMATCH");
  }
  const existing = await readPaymentOrderByAttempt(
    context.env.DB,
    parsed.data.transaction_id,
    parsed.data.attempt_number,
  );
  if (existing?.provider_order_id !== null && existing !== undefined) {
    const response = orderResponse(existing, context.env.RAZORPAY_KEY_ID, checkout.description);
    await completeIdempotency(
      context.env.DB,
      "POST /payments/orders",
      idempotencyKey,
      200,
      response,
    );
    return context.json(response, 200);
  }
  if (existing !== undefined) {
    return completeError(context, idempotencyKey, 409, "PAYMENT_ORDER_IN_PROGRESS");
  }

  const receiptDigest = await sha256CanonicalJsonHex({
    attempt: parsed.data.attempt_number,
    transaction_id: parsed.data.transaction_id,
  });
  const receipt = `mp_${receiptDigest.slice(0, 32)}`;
  const paymentOrderId = dependencies.createPaymentOrderId(now);
  const notes = {
    agent_id: parsed.data.agent_id,
    checkout_hash: parsed.data.checkout_hash,
    mandate_id: parsed.data.mandate_id,
    mindpay_transaction_id: parsed.data.transaction_id,
    service_id: parsed.data.service_id,
  };
  try {
    await context.env.DB.prepare(
      "INSERT INTO merchant_payment_orders (id, checkout_session_id, transaction_id, mandate_id, agent_id, service_id, attempt_number, receipt, provider_order_id, provider_payment_id, provider_refund_id, amount_subunits, currency, checkout_hash, closed_payment_mandate_hash, notes, status, order_status, payment_status, fulfilment_eligible, failure_code, provider_order_snapshot, provider_payment_snapshot, completed_at, retention_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'INR', ?, ?, ?, 'CREATING', NULL, NULL, 0, NULL, NULL, NULL, NULL, ?, ?, ?)",
    )
      .bind(
        paymentOrderId,
        parsed.data.checkout_session_id,
        parsed.data.transaction_id,
        parsed.data.mandate_id,
        parsed.data.agent_id,
        parsed.data.service_id,
        parsed.data.attempt_number,
        receipt,
        parsed.data.amount_subunits,
        parsed.data.checkout_hash,
        parsed.data.closed_payment_mandate_hash,
        JSON.stringify(notes),
        now.getTime() + PAYMENT_RETENTION_MS,
        now.getTime(),
        now.getTime(),
      )
      .run();
  } catch {
    return completeError(context, idempotencyKey, 409, "PAYMENT_ORDER_CONFLICT");
  }

  let providerOrder: RazorpayOrder;
  try {
    providerOrder = await dependencies.razorpayClient(context.env).createOrder({
      amount: parsed.data.amount_subunits,
      currency: "INR",
      notes,
      receipt,
    });
  } catch {
    await context.env.DB.prepare(
      "UPDATE merchant_payment_orders SET status = 'FAILED', failure_code = 'PROVIDER_ORDER_FAILED', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'CREATING'",
    )
      .bind(now.getTime(), now.getTime(), paymentOrderId)
      .run();
    return completeError(context, idempotencyKey, 502, "PROVIDER_ORDER_FAILED");
  }
  if (
    providerOrder.amount !== parsed.data.amount_subunits ||
    providerOrder.currency !== "INR" ||
    providerOrder.receipt !== receipt
  ) {
    await context.env.DB.prepare(
      "UPDATE merchant_payment_orders SET provider_order_id = ?, status = 'FAILED', order_status = ?, failure_code = 'PROVIDER_ORDER_MISMATCH', provider_order_snapshot = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'CREATING'",
    )
      .bind(
        providerOrder.id,
        providerOrder.status,
        JSON.stringify(providerOrder),
        now.getTime(),
        now.getTime(),
        paymentOrderId,
      )
      .run();
    return completeError(context, idempotencyKey, 502, "PROVIDER_ORDER_MISMATCH");
  }
  await context.env.DB.prepare(
    "UPDATE merchant_payment_orders SET provider_order_id = ?, status = 'PENDING', order_status = ?, provider_order_snapshot = ?, updated_at = ? WHERE id = ? AND status = 'CREATING'",
  )
    .bind(
      providerOrder.id,
      providerOrder.status,
      JSON.stringify(providerOrder),
      now.getTime(),
      paymentOrderId,
    )
    .run();
  const stored = await readPaymentOrderById(context.env.DB, paymentOrderId);
  if (stored === undefined)
    return completeError(context, idempotencyKey, 500, "ORDER_PERSIST_FAILED");
  const response = orderResponse(stored, context.env.RAZORPAY_KEY_ID, checkout.description);
  await completeIdempotency(context.env.DB, "POST /payments/orders", idempotencyKey, 201, response);
  return context.json(response, 201);
}

async function verifyCheckoutCallback(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  dependencies: SignalWorksPaymentDependencies,
): Promise<Response> {
  const now = dependencies.now();
  const parsed = callbackSchema.safeParse(await readCallbackBody(context.req.raw));
  if (!parsed.success) return jsonError(context, 400, "INVALID_CALLBACK");
  const order = await readPaymentOrderByProviderOrder(
    context.env.DB,
    parsed.data.razorpay_order_id,
  );
  if (order?.provider_order_id === null || order === undefined) {
    return jsonError(context, 400, "INVALID_CALLBACK");
  }
  const environment = paymentEnvironment(context.env);
  const valid = await verifyRazorpayCheckoutSignature({
    keySecret: environment.RAZORPAY_KEY_SECRET,
    paymentId: parsed.data.razorpay_payment_id,
    signature: parsed.data.razorpay_signature,
    storedOrderId: order.provider_order_id,
  });
  if (!valid) return jsonError(context, 400, "INVALID_CALLBACK_SIGNATURE");
  const signatureHash = await sha256Hex(parsed.data.razorpay_signature);
  const existing = await context.env.DB.prepare(
    "SELECT id FROM merchant_payment_callbacks WHERE payment_order_id = ? AND provider_payment_id = ? LIMIT 1",
  )
    .bind(order.id, parsed.data.razorpay_payment_id)
    .first();
  if (existing === null) {
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO merchant_payment_callbacks (id, payment_order_id, provider_payment_id, signature_hash, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        dependencies.createCallbackId(now),
        order.id,
        parsed.data.razorpay_payment_id,
        signatureHash,
        now.getTime(),
        now.getTime(),
      ),
      context.env.DB.prepare(
        "UPDATE merchant_payment_orders SET provider_payment_id = coalesce(provider_payment_id, ?), status = CASE WHEN status IN ('PENDING', 'FAILED') THEN 'RECONCILING' ELSE status END, updated_at = ? WHERE id = ? AND (provider_payment_id IS NULL OR provider_payment_id = ?)",
      ).bind(
        parsed.data.razorpay_payment_id,
        now.getTime(),
        order.id,
        parsed.data.razorpay_payment_id,
      ),
    ]);
  }
  return context.json({ fulfilment_eligible: false, state: "PAYMENT_RECONCILING" }, 202);
}

async function acceptWebhook(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  dependencies: SignalWorksPaymentDependencies,
): Promise<Response> {
  const rawBody = new Uint8Array(await context.req.raw.arrayBuffer());
  const signature = context.req.header("x-razorpay-signature") ?? "";
  const providerEventId = context.req.header("x-razorpay-event-id") ?? "";
  if (!/^.{3,128}$/u.test(providerEventId)) return jsonError(context, 400, "EVENT_ID_REQUIRED");
  const environment = paymentEnvironment(context.env);
  const valid = await verifyRazorpayWebhookSignature({
    rawBody,
    signature,
    webhookSecrets: [
      environment.RAZORPAY_WEBHOOK_SECRET,
      ...(environment.RAZORPAY_WEBHOOK_OLD_SECRET === undefined
        ? []
        : [environment.RAZORPAY_WEBHOOK_OLD_SECRET]),
    ],
  });
  if (!valid) return jsonError(context, 401, "INVALID_WEBHOOK_SIGNATURE");
  let webhook: ReturnType<typeof parseRazorpayWebhook>;
  try {
    webhook = parseRazorpayWebhook(rawBody);
  } catch {
    return jsonError(context, 400, "INVALID_WEBHOOK_PAYLOAD");
  }
  const now = dependencies.now();
  const payloadHash = await sha256Hex(rawBody);
  const key = `razorpay/${now.toISOString().slice(0, 10)}/${providerEventId}.json`;
  const existing = await readProviderEvent(context.env.DB, providerEventId);
  if (existing !== undefined && existing.payload_hash !== payloadHash) {
    return jsonError(context, 409, "PROVIDER_EVENT_COLLISION");
  }
  if (existing === undefined) {
    await context.env.PAYMENT_EVIDENCE.put(key, rawBody, {
      customMetadata: { event: webhook.event, sha256: payloadHash },
      httpMetadata: { contentType: "application/json" },
    });
    await context.env.DB.prepare(
      "INSERT INTO merchant_provider_events (id, provider_event_id, payment_order_id, event_type, payload_hash, raw_payload_r2_key, processing_status, processing_attempts, failure_code, received_at, processed_at, retention_expires_at, created_at) VALUES (?, ?, NULL, ?, ?, ?, 'VERIFIED', 0, NULL, ?, NULL, ?, ?)",
    )
      .bind(
        dependencies.createProviderEventId(now),
        providerEventId,
        webhook.event,
        payloadHash,
        key,
        now.getTime(),
        now.getTime() + PAYMENT_RETENTION_MS,
        now.getTime(),
      )
      .run();
  }
  if (existing?.processing_status !== "PROCESSED") {
    await context.env.PAYMENT_EVENTS.send({ providerEventId });
  }
  return new Response(null, { status: 204 });
}

export async function processSignalWorksRazorpayEvent(
  bindings: SignalWorksPaymentBindings,
  message: SignalWorksPaymentQueueMessage,
  overrides: Partial<SignalWorksPaymentDependencies> = {},
): Promise<void> {
  const dependencies = resolveDependencies(overrides);
  const storedEvent = await readProviderEvent(bindings.DB, message.providerEventId);
  if (storedEvent === undefined) return;
  if (storedEvent.processing_status === "PROCESSED") {
    await deliverStoredPaymentEvent(bindings, storedEvent.provider_event_id);
    return;
  }
  const rawObject = await bindings.PAYMENT_EVIDENCE.get(storedEvent.raw_payload_r2_key);
  if (rawObject === null) {
    await rejectProviderEvent(
      bindings.DB,
      storedEvent.id,
      "RAW_EVIDENCE_MISSING",
      dependencies.now(),
    );
    return;
  }
  let webhook: ReturnType<typeof parseRazorpayWebhook>;
  try {
    const rawBody = new Uint8Array(await rawObject.arrayBuffer());
    if ((await sha256Hex(rawBody)) !== storedEvent.payload_hash) {
      await rejectProviderEvent(
        bindings.DB,
        storedEvent.id,
        "RAW_EVIDENCE_HASH_MISMATCH",
        dependencies.now(),
      );
      return;
    }
    webhook = parseRazorpayWebhook(rawBody);
  } catch {
    await rejectProviderEvent(
      bindings.DB,
      storedEvent.id,
      "RAW_EVIDENCE_INVALID",
      dependencies.now(),
    );
    return;
  }
  const embeddedOrder = webhook.payload.order?.entity;
  const embeddedPayment = webhook.payload.payment?.entity;
  const embeddedRefund = webhook.payload.refund?.entity;
  const paymentOrder =
    embeddedOrder !== undefined
      ? await readPaymentOrderByProviderOrder(bindings.DB, embeddedOrder.id)
      : embeddedPayment !== undefined
        ? await readPaymentOrderByProviderOrder(bindings.DB, embeddedPayment.order_id)
        : embeddedRefund !== undefined
          ? await readPaymentOrderByProviderPayment(bindings.DB, embeddedRefund.payment_id)
          : undefined;
  if (paymentOrder?.provider_order_id === null || paymentOrder === undefined) {
    await rejectProviderEvent(
      bindings.DB,
      storedEvent.id,
      "PAYMENT_ORDER_NOT_FOUND",
      dependencies.now(),
    );
    return;
  }
  const client = dependencies.razorpayClient(bindings);
  let order: RazorpayOrder | undefined = embeddedOrder;
  let payment: RazorpayPayment | undefined = embeddedPayment;
  const refund: RazorpayRefund | undefined = embeddedRefund;
  try {
    order ??= await client.fetchOrder(paymentOrder.provider_order_id);
    const paymentId = payment?.id ?? paymentOrder.provider_payment_id ?? refund?.payment_id;
    if (payment === undefined && paymentId !== null && paymentId !== undefined) {
      payment = await client.fetchPayment(paymentId);
    }
  } catch {
    await bindings.DB.prepare(
      "UPDATE merchant_provider_events SET processing_attempts = processing_attempts + 1, failure_code = 'PROVIDER_RECONCILIATION_FAILED' WHERE id = ? AND processing_status = 'VERIFIED'",
    )
      .bind(storedEvent.id)
      .run();
    throw new Error("Razorpay reconciliation failed");
  }
  const result = reconcileRazorpayPayment({
    expectedAmount: paymentOrder.amount_subunits,
    expectedCurrency: "INR",
    expectedOrderId: paymentOrder.provider_order_id,
    ...(order === undefined ? {} : { order }),
    ...(payment === undefined ? {} : { payment }),
    ...(refund === undefined ? {} : { refund }),
  });
  const next = reconciliationState(result.outcome, webhook.event, paymentOrder.status);
  const now = dependencies.now();
  const providerPaymentId = payment?.id ?? paymentOrder.provider_payment_id;
  const providerRefundId = refund?.id ?? paymentOrder.provider_refund_id;
  const orderStatus = order?.status ?? paymentOrder.order_status ?? "created";
  const paymentStatus = payment?.status ?? paymentOrder.payment_status ?? "created";
  const publication = await createSignalWorksPaymentEventPublication({
    amountSubunits: paymentOrder.amount_subunits,
    attemptNumber: paymentOrder.attempt_number,
    checkoutHash: paymentOrder.checkout_hash,
    checkoutSessionId: paymentOrder.checkout_session_id,
    currency: "INR",
    database: bindings.DB,
    eventId: dependencies.createPaymentEventId(now),
    eventType: next.eventType,
    fulfilmentEligible: result.fulfilmentEligible,
    keyEncryptionSecret: bindings.SIGNALWORKS_KEY_ENCRYPTION_KEY,
    nonce: `razorpay:${storedEvent.provider_event_id}`,
    now,
    orderStatus,
    paymentStatus,
    providerOrderId: paymentOrder.provider_order_id,
    ...(providerPaymentId === null || providerPaymentId === undefined ? {} : { providerPaymentId }),
    ...(providerRefundId === null || providerRefundId === undefined ? {} : { providerRefundId }),
    transactionId: paymentOrder.transaction_id,
  });
  await bindings.DB.batch([
    bindings.DB.prepare(
      "UPDATE merchant_payment_orders SET provider_payment_id = coalesce(provider_payment_id, ?), provider_refund_id = coalesce(provider_refund_id, ?), status = ?, order_status = ?, payment_status = ?, fulfilment_eligible = ?, failure_code = ?, provider_order_snapshot = coalesce(?, provider_order_snapshot), provider_payment_snapshot = coalesce(?, provider_payment_snapshot), completed_at = ?, updated_at = ? WHERE id = ?",
    ).bind(
      providerPaymentId,
      providerRefundId,
      next.status,
      orderStatus,
      paymentStatus,
      result.fulfilmentEligible ? 1 : 0,
      next.failureCode,
      order === undefined ? null : JSON.stringify(order),
      payment === undefined ? null : JSON.stringify(payment),
      next.terminal ? now.getTime() : null,
      now.getTime(),
      paymentOrder.id,
    ),
    await prepareSignalWorksPaymentEventInsert(bindings.DB, paymentOrder.id, publication),
    bindings.DB.prepare(
      "UPDATE merchant_provider_events SET payment_order_id = ?, processing_status = 'PROCESSED', processing_attempts = processing_attempts + 1, failure_code = NULL, processed_at = ? WHERE id = ? AND processing_status = 'VERIFIED'",
    ).bind(paymentOrder.id, now.getTime(), storedEvent.id),
  ]);
  await deliverPaymentEvent(bindings, publication);
}

async function createPaymentRefund(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  dependencies: SignalWorksPaymentDependencies,
): Promise<Response> {
  const environment = paymentEnvironment(context.env);
  if (!environment.RAZORPAY_REFUNDS_ENABLED) return jsonError(context, 404, "NOT_FOUND");
  const now = dependencies.now();
  if (!(await authenticate(context, now))) return jsonError(context, 401, "UNAUTHORIZED");
  const parsed = refundRequestSchema.safeParse(await readJson(context.req.raw));
  if (!parsed.success) return jsonError(context, 400, "INVALID_REFUND");
  const paymentOrder = await readLatestPaymentOrder(
    context.env.DB,
    context.req.param("transactionId") ?? "",
  );
  if (
    paymentOrder?.status !== "CAPTURED" ||
    paymentOrder.provider_payment_id === null ||
    paymentOrder.provider_order_id === null ||
    parsed.data.amount_subunits !== paymentOrder.amount_subunits
  ) {
    return jsonError(context, 409, "REFUND_NOT_ALLOWED");
  }
  let refund: RazorpayRefund;
  try {
    refund = await dependencies
      .razorpayClient(context.env)
      .createRefund(paymentOrder.provider_payment_id, parsed.data.amount_subunits);
  } catch {
    return jsonError(context, 502, "PROVIDER_REFUND_FAILED");
  }
  const status = refund.status === "processed" ? "REFUNDED" : "REFUND_PENDING";
  const eventType = refund.status === "processed" ? "REFUNDED" : "REFUND_PENDING";
  const publication = await createSignalWorksPaymentEventPublication({
    amountSubunits: paymentOrder.amount_subunits,
    attemptNumber: paymentOrder.attempt_number,
    checkoutHash: paymentOrder.checkout_hash,
    checkoutSessionId: paymentOrder.checkout_session_id,
    currency: "INR",
    database: context.env.DB,
    eventId: dependencies.createPaymentEventId(now),
    eventType,
    fulfilmentEligible: false,
    keyEncryptionSecret: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
    nonce: `razorpay:${refund.id}`,
    now,
    orderStatus: paymentOrder.order_status ?? "paid",
    paymentStatus: refund.status === "processed" ? "refunded" : "captured",
    providerOrderId: paymentOrder.provider_order_id,
    providerPaymentId: paymentOrder.provider_payment_id,
    providerRefundId: refund.id,
    transactionId: paymentOrder.transaction_id,
  });
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE merchant_payment_orders SET provider_refund_id = ?, status = ?, payment_status = ?, fulfilment_eligible = 0, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'CAPTURED'",
    ).bind(
      refund.id,
      status,
      refund.status === "processed" ? "refunded" : "captured",
      refund.status === "processed" ? now.getTime() : null,
      now.getTime(),
      paymentOrder.id,
    ),
    await prepareSignalWorksPaymentEventInsert(context.env.DB, paymentOrder.id, publication),
  ]);
  return context.json({ provider_refund_id: refund.id, state: status }, 202);
}

async function readProviderStatus(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  dependencies: SignalWorksPaymentDependencies,
): Promise<Response> {
  const environment = paymentEnvironment(context.env);
  if (!environment.RAZORPAY_MCP_READONLY_ENABLED) return jsonError(context, 404, "NOT_FOUND");
  const now = dependencies.now();
  if (!(await authenticate(context, now))) return jsonError(context, 401, "UNAUTHORIZED");
  const paymentOrder = await readLatestPaymentOrder(
    context.env.DB,
    context.req.param("transactionId") ?? "",
  );
  if (paymentOrder?.provider_order_id === null || paymentOrder === undefined) {
    return jsonError(context, 404, "PAYMENT_NOT_FOUND");
  }
  const client = dependencies.razorpayClient(context.env);
  const order = await client.fetchOrder(paymentOrder.provider_order_id);
  const payment =
    paymentOrder.provider_payment_id === null
      ? undefined
      : await client.fetchPayment(paymentOrder.provider_payment_id);
  return context.json({
    amount_subunits: paymentOrder.amount_subunits,
    currency: "INR",
    order_status: order.status,
    ...(payment === undefined ? {} : { payment_status: payment.status }),
    transaction_id: paymentOrder.transaction_id,
  });
}

function resolveDependencies(
  overrides: Partial<SignalWorksPaymentDependencies>,
): SignalWorksPaymentDependencies {
  return {
    ...defaultDependencies,
    razorpayClient:
      overrides.razorpayClient ??
      ((bindings) => {
        const environment = paymentEnvironment(bindings);
        return new RazorpayClient({
          keyId: environment.RAZORPAY_KEY_ID,
          keySecret: environment.RAZORPAY_KEY_SECRET,
        });
      }),
    ...overrides,
  };
}

function paymentEnvironment(bindings: SignalWorksPaymentBindings) {
  return parseSignalWorksPaymentEnvironment({
    ENVIRONMENT: bindings.ENVIRONMENT,
    RAZORPAY_KEY_ID: bindings.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: bindings.RAZORPAY_KEY_SECRET,
    ...(bindings.RAZORPAY_MCP_READONLY_ENABLED === undefined
      ? {}
      : { RAZORPAY_MCP_READONLY_ENABLED: bindings.RAZORPAY_MCP_READONLY_ENABLED }),
    ...(bindings.RAZORPAY_REFUNDS_ENABLED === undefined
      ? {}
      : { RAZORPAY_REFUNDS_ENABLED: bindings.RAZORPAY_REFUNDS_ENABLED }),
    ...(bindings.RAZORPAY_WEBHOOK_OLD_SECRET === undefined
      ? {}
      : { RAZORPAY_WEBHOOK_OLD_SECRET: bindings.RAZORPAY_WEBHOOK_OLD_SECRET }),
    RAZORPAY_WEBHOOK_SECRET: bindings.RAZORPAY_WEBHOOK_SECRET,
    SIGNALWORKS_KEY_ENCRYPTION_KEY: bindings.SIGNALWORKS_KEY_ENCRYPTION_KEY,
    SIGNALWORKS_MACHINE_AUTH_TOKEN: bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN,
  });
}

async function authenticate(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  now: Date,
): Promise<boolean> {
  return (
    (await authenticateSignalWorksMachine(
      context.env.DB,
      context.req.header("Authorization"),
      now,
    )) !== undefined
  );
}

async function readAuthorizedCheckout(
  database: D1Database,
  authorization: MerchantPaymentAuthorization,
  now: Date,
): Promise<{ readonly description: string } | undefined> {
  const row = await database
    .prepare(
      "SELECT status, merchant_checkout, expires_at FROM merchant_checkout_sessions WHERE id = ? LIMIT 1",
    )
    .bind(authorization.checkout_session_id)
    .first<{ expires_at: number; merchant_checkout: string; status: string }>();
  if (row === null || row.status !== "ready_for_payment" || row.expires_at <= now.getTime()) {
    return undefined;
  }
  let checkout: z.infer<typeof merchantCheckoutSchema>;
  try {
    checkout = merchantCheckoutSchema.parse(JSON.parse(row.merchant_checkout) as unknown);
  } catch {
    return undefined;
  }
  const line = checkout.line_items[0];
  if (
    checkout.line_items.length !== 1 ||
    line === undefined ||
    line.service_id !== authorization.service_id ||
    checkout.total_subunits !== authorization.amount_subunits ||
    checkout.currency !== authorization.currency ||
    (await sha256CanonicalJsonHex(checkout)) !== authorization.checkout_hash
  ) {
    return undefined;
  }
  return { description: `${line.quantity} × ${line.service_id}` };
}

function orderResponse(
  order: PaymentOrderRow,
  keyId: string,
  description: string,
): MerchantPaymentOrderResponse {
  return merchantPaymentOrderResponseSchema.parse({
    attempt_number: order.attempt_number,
    checkout: {
      amount: order.amount_subunits,
      currency: "INR",
      description,
      key: keyId,
      name: "SignalWorks",
      order_id: order.provider_order_id,
      retry: { enabled: false },
    },
    provider_order_id: order.provider_order_id,
    receipt: order.receipt,
    state: "PAYMENT_PENDING",
    transaction_id: order.transaction_id,
  });
}

async function readPaymentOrderById(database: D1Database, id: string) {
  return readPaymentOrder(database, "id", id);
}
async function readPaymentOrderByProviderOrder(database: D1Database, id: string) {
  return readPaymentOrder(database, "provider_order_id", id);
}
async function readPaymentOrderByProviderPayment(database: D1Database, id: string) {
  return readPaymentOrder(database, "provider_payment_id", id);
}
async function readPaymentOrder(
  database: D1Database,
  column: "id" | "provider_order_id" | "provider_payment_id",
  value: string,
) {
  const row = await database
    .prepare(
      `SELECT ${paymentOrderColumns} FROM merchant_payment_orders WHERE ${column} = ? LIMIT 1`,
    )
    .bind(value)
    .first();
  return row === null ? undefined : paymentOrderRowSchema.parse(row);
}
async function readPaymentOrderByAttempt(
  database: D1Database,
  transactionId: string,
  attempt: number,
) {
  const row = await database
    .prepare(
      `SELECT ${paymentOrderColumns} FROM merchant_payment_orders WHERE transaction_id = ? AND attempt_number = ? LIMIT 1`,
    )
    .bind(transactionId, attempt)
    .first();
  return row === null ? undefined : paymentOrderRowSchema.parse(row);
}
async function readLatestPaymentOrder(database: D1Database, transactionId: string) {
  const row = await database
    .prepare(
      `SELECT ${paymentOrderColumns} FROM merchant_payment_orders WHERE transaction_id = ? ORDER BY attempt_number DESC LIMIT 1`,
    )
    .bind(transactionId)
    .first();
  return row === null ? undefined : paymentOrderRowSchema.parse(row);
}
const paymentOrderColumns =
  "id, checkout_session_id, transaction_id, mandate_id, agent_id, service_id, attempt_number, receipt, provider_order_id, provider_payment_id, provider_refund_id, amount_subunits, currency, checkout_hash, closed_payment_mandate_hash, status, order_status, payment_status, fulfilment_eligible, failure_code, provider_order_snapshot, provider_payment_snapshot";

async function readProviderEvent(database: D1Database, providerEventId: string) {
  const row = await database
    .prepare(
      "SELECT id, provider_event_id, event_type, payload_hash, raw_payload_r2_key, processing_status FROM merchant_provider_events WHERE provider_event_id = ? LIMIT 1",
    )
    .bind(providerEventId)
    .first();
  return row === null ? undefined : providerEventRowSchema.parse(row);
}

async function rejectProviderEvent(
  database: D1Database,
  id: string,
  code: string,
  now: Date,
): Promise<void> {
  await database
    .prepare(
      "UPDATE merchant_provider_events SET processing_status = 'REJECTED', processing_attempts = processing_attempts + 1, failure_code = ?, processed_at = ? WHERE id = ? AND processing_status = 'VERIFIED'",
    )
    .bind(code, now.getTime(), id)
    .run();
}

async function deliverStoredPaymentEvent(
  bindings: SignalWorksPaymentBindings,
  providerEventId: string,
): Promise<void> {
  const row = await bindings.DB.prepare(
    "SELECT event, signature FROM merchant_payment_events WHERE nonce = ? LIMIT 1",
  )
    .bind(`razorpay:${providerEventId}`)
    .first<{ event: string; signature: string }>();
  if (row === null) throw new Error("Processed provider event has no signed payment publication");
  await deliverPaymentEvent(bindings, {
    event: JSON.parse(row.event) as unknown,
    signature: JSON.parse(row.signature) as unknown,
  });
}

async function deliverPaymentEvent(
  bindings: SignalWorksPaymentBindings,
  publication: Readonly<{ event: unknown; signature: unknown }>,
): Promise<void> {
  const response = await bindings.MINDPAY_GATEWAY.fetch(
    new Request("https://api.mindpay.example/api/internal/v1/merchant-payment-events", {
      body: JSON.stringify(publication),
      headers: {
        Authorization: `Bearer ${bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  if (!response.ok) throw new Error(`MindPay rejected payment evidence with ${response.status}`);
}

function reconciliationState(
  outcome: ReturnType<typeof reconcileRazorpayPayment>["outcome"],
  event: ReturnType<typeof parseRazorpayWebhook>["event"],
  currentStatus: PaymentOrderRow["status"],
): {
  eventType: "ORDER_PAID" | "PAYMENT_CAPTURED" | "PAYMENT_FAILED" | "REFUND_PENDING" | "REFUNDED";
  failureCode: string | null;
  status: PaymentOrderRow["status"];
  terminal: boolean;
} {
  if (outcome === "CAPTURED_PAID") {
    return { eventType: "PAYMENT_CAPTURED", failureCode: null, status: "CAPTURED", terminal: true };
  }
  if (outcome === "REFUNDED") {
    return { eventType: "REFUNDED", failureCode: null, status: "REFUNDED", terminal: true };
  }
  if (outcome === "REFUND_PENDING") {
    return {
      eventType: "REFUND_PENDING",
      failureCode: null,
      status: "REFUND_PENDING",
      terminal: false,
    };
  }
  if (outcome === "FAILED" || outcome === "MISMATCH") {
    if (event.startsWith("refund.")) {
      return {
        eventType: "REFUND_PENDING",
        failureCode: "REFUND_FAILED",
        status: currentStatus === "REFUND_PENDING" ? "CAPTURED" : currentStatus,
        terminal: false,
      };
    }
    return {
      eventType: "PAYMENT_FAILED",
      failureCode: outcome === "MISMATCH" ? "RECONCILIATION_MISMATCH" : "PAYMENT_FAILED",
      status: "FAILED",
      terminal: true,
    };
  }
  return {
    eventType: event === "order.paid" ? "ORDER_PAID" : "PAYMENT_CAPTURED",
    failureCode: null,
    status: "RECONCILING",
    terminal: false,
  };
}

async function claimIdempotency(
  database: D1Database,
  scope: string,
  key: string,
  requestId: string,
  requestHash: string,
  now: Date,
): Promise<
  | { kind: "claimed" }
  | { kind: "conflict" }
  | { kind: "pending" }
  | { body: unknown; kind: "replay"; status: number }
> {
  const existing = await database
    .prepare(
      "SELECT request_hash, state, response_status, response_body FROM merchant_idempotency_records WHERE scope = ? AND key = ? LIMIT 1",
    )
    .bind(scope, key)
    .first<{
      request_hash: string;
      response_body: string | null;
      response_status: number | null;
      state: string;
    }>();
  if (existing !== null) {
    if (existing.request_hash !== requestHash) return { kind: "conflict" };
    if (existing.state !== "COMPLETED" || existing.response_status === null)
      return { kind: "pending" };
    return {
      body: existing.response_body === null ? {} : (JSON.parse(existing.response_body) as unknown),
      kind: "replay",
      status: existing.response_status,
    };
  }
  await database
    .prepare(
      "INSERT INTO merchant_idempotency_records (scope, key, request_id, request_hash, state, response_status, response_body, response_headers, created_at, expires_at) VALUES (?, ?, ?, ?, 'PENDING', NULL, NULL, NULL, ?, ?)",
    )
    .bind(
      scope,
      key,
      requestId.slice(0, 255),
      requestHash,
      now.getTime(),
      now.getTime() + IDEMPOTENCY_TTL_MS,
    )
    .run();
  return { kind: "claimed" };
}

async function completeIdempotency(
  database: D1Database,
  scope: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  await database
    .prepare(
      "UPDATE merchant_idempotency_records SET state = 'COMPLETED', response_status = ?, response_body = ?, response_headers = ? WHERE scope = ? AND key = ? AND state = 'PENDING'",
    )
    .bind(
      status,
      JSON.stringify(body),
      JSON.stringify({ "Content-Type": "application/json" }),
      scope,
      key,
    )
    .run();
}

async function completeError(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  key: string,
  status: 409 | 500 | 502,
  code: string,
): Promise<Response> {
  const body = { code };
  await completeIdempotency(context.env.DB, "POST /payments/orders", key, status, body);
  return context.json(body, status);
}

function jsonError(
  context: Context<{ Bindings: SignalWorksPaymentBindings }>,
  status: 400 | 401 | 404 | 409 | 502,
  code: string,
): Response {
  return context.json({ code }, status);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text()) as unknown;
  } catch {
    return undefined;
  }
}

async function readCallbackBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.includes("application/json")) return readJson(request);
  const form = new URLSearchParams(await request.text());
  return {
    razorpay_order_id: form.get("razorpay_order_id"),
    razorpay_payment_id: form.get("razorpay_payment_id"),
    razorpay_signature: form.get("razorpay_signature"),
  };
}
