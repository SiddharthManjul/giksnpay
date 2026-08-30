import {
  type Es256CanonicalSignature,
  type MerchantCheckout,
  type ServiceVersion,
  merchantCheckoutSchema,
} from "@mindpay/contracts";
import { bytesToBase64Url, canonicalizeJsonBytes, sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import {
  ACP_VERSION,
  type AcpSchemaName,
  type AcpSchemaTypeMap,
  type AcpCheckoutSession,
  type AcpCheckoutSessionCreateRequest,
  type AcpCheckoutSessionUpdateRequest,
  assertAcpSchema,
} from "@mindpay/protocol-acp";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  type AcpIdempotencyClaim,
  type AcpProtocolResponse,
  type AcpRequestSecurity,
  acpResponse,
  claimAcpIdempotency,
  completeAcpIdempotency,
  prepareAcpIdempotencyCompletion,
  prepareAcpIdempotencyCompletionForCheckout,
  protocolError,
  validateAcpRequestSecurity,
} from "./acp-security";
import {
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  selectActiveSignalWorksSigningKey,
  signSignalWorksPayloadWithKey,
} from "./identity";
import {
  createSignalWorksOrderEventPublication,
  prepareConditionalSignalWorksOrderEventInsert,
  prepareSignalWorksOrderEventInsert,
} from "./order-events";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_ORIGIN } from "./publication";
import { readSignalWorksServiceVersions } from "./services";

export const SIGNALWORKS_CHECKOUT_TTL_MS = 15 * 60 * 1_000;

export interface SignalWorksCheckoutBindings {
  DB: D1Database;
  ENVIRONMENT: string;
  SIGNALWORKS_KEY_ENCRYPTION_KEY: string;
  SIGNALWORKS_MACHINE_AUTH_TOKEN: string;
}

export interface SignalWorksCheckoutDependencies {
  readonly createCheckoutNonce: (now: Date) => string;
  readonly createCheckoutSessionId: (now: Date) => string;
  readonly createEventId: (now: Date) => string;
  readonly createEventNonce: (now: Date) => string;
  readonly createOrderId: (now: Date) => string;
  readonly now: () => Date;
}

const defaultDependencies: SignalWorksCheckoutDependencies = Object.freeze({
  createCheckoutNonce: (now: Date) => `nonce_checkout_${createUlid(now.getTime())}`,
  createCheckoutSessionId: (now: Date) => `checkout_${createUlid(now.getTime())}`,
  createEventId: (now: Date) => `evt_${createUlid(now.getTime())}`,
  createEventNonce: (now: Date) => `nonce_event_${createUlid(now.getTime())}`,
  createOrderId: (now: Date) => `ord_${createUlid(now.getTime())}`,
  now: () => new Date(),
});

const epochMillisecondsSchema = z.number().int().safe().nonnegative();
const checkoutRowSchema = z
  .object({
    acp_signature: z.string(),
    acp_state: z.string(),
    acp_state_hash: z.string().regex(/^[0-9a-f]{64}$/u),
    created_at: epochMillisecondsSchema,
    credential_id: z.string(),
    expires_at: epochMillisecondsSchema,
    id: z.string(),
    merchant_checkout: z.string(),
    merchant_checkout_signature: z.string(),
    revision: z.number().int().positive(),
    status: z.enum(["ready_for_payment", "completed", "canceled"]),
    updated_at: epochMillisecondsSchema,
  })
  .strict();

interface StoredCheckoutSession {
  readonly acpSignature: Es256CanonicalSignature;
  readonly acpState: AcpCheckoutSession;
  readonly acpStateHash: string;
  readonly createdAtEpochMs: number;
  readonly credentialId: string;
  readonly expiresAtEpochMs: number;
  readonly id: string;
  readonly merchantCheckout: MerchantCheckout;
  readonly merchantCheckoutSignature: Es256CanonicalSignature;
  readonly revision: number;
  readonly status: "ready_for_payment" | "completed" | "canceled";
  readonly updatedAtEpochMs: number;
}

interface SignedCheckoutState {
  readonly acpSignature: Es256CanonicalSignature;
  readonly acpState: AcpCheckoutSession;
  readonly acpStateHash: string;
  readonly expiresAtEpochMs: number;
  readonly merchantCheckout: MerchantCheckout;
  readonly merchantCheckoutSignature: Es256CanonicalSignature;
}

export function createSignalWorksCheckoutRoutes(
  overrides: Partial<SignalWorksCheckoutDependencies> = {},
): Hono<{ Bindings: SignalWorksCheckoutBindings }> {
  const dependencies: SignalWorksCheckoutDependencies = { ...defaultDependencies, ...overrides };
  const routes = new Hono<{ Bindings: SignalWorksCheckoutBindings }>();

  routes.post("/checkout_sessions", async (context) => {
    const now = dependencies.now();
    const securityResult = await validateAcpRequestSecurity({
      database: context.env.DB,
      headers: context.req.raw.headers,
      mutation: true,
      now,
    });
    if (!securityResult.success) {
      return acpResponse(securityResult.response);
    }
    const rawBody = await readJsonBody(context.req.raw, false);
    if (!rawBody.success) {
      return acpResponse(
        protocolError(400, "invalid_json", "The request body must be valid JSON."),
      );
    }
    const claim = await claimAcpIdempotency({
      body: rawBody.body,
      database: context.env.DB,
      method: "POST",
      now,
      path: "/checkout_sessions",
      security: securityResult.security,
    });
    if (!claim.success) {
      return acpResponse(claim.response);
    }

    const request = validateRequest("checkoutSessionCreateRequest", rawBody.body);
    if (!request.success) {
      return completeMutationError(
        context.env.DB,
        claim,
        securityResult.security,
        protocolError(400, "invalid_request", request.message),
      );
    }

    let lineItems: AcpCheckoutSession["line_items"];
    try {
      lineItems = await resolveLineItems(context.env.DB, request.value.line_items);
      assertSupportedCurrency(request.value.currency);
      assertSupportedDiscounts(request.value);
    } catch (error) {
      return completeMutationError(
        context.env.DB,
        claim,
        securityResult.security,
        protocolError(400, "invalid_line_items", safeMessage(error)),
      );
    }

    const checkoutSessionId = dependencies.createCheckoutSessionId(now);
    const totalAmount = totalForLineItems(lineItems);
    const proposedExpiry = now.getTime() + SIGNALWORKS_CHECKOUT_TTL_MS;
    const baseState = {
      ...(request.value.buyer === undefined ? {} : { buyer: request.value.buyer }),
      capabilities: {},
      created_at: now.toISOString(),
      currency: "inr",
      ...(request.value.fulfillment_details === undefined
        ? {}
        : { fulfillment_details: request.value.fulfillment_details }),
      ...(request.value.fulfillment_groups === undefined
        ? {}
        : { fulfillment_groups: request.value.fulfillment_groups }),
      fulfillment_options: [],
      id: checkoutSessionId,
      line_items: lineItems,
      links: [],
      ...(request.value.locale === undefined ? {} : { locale: request.value.locale }),
      messages: [],
      ...(request.value.metadata === undefined ? {} : { metadata: request.value.metadata }),
      protocol: { version: ACP_VERSION },
      ...(request.value.quote_id === undefined ? {} : { quote_id: request.value.quote_id }),
      status: "ready_for_payment" as const,
      ...(request.value.timezone === undefined ? {} : { timezone: request.value.timezone }),
      totals: totals(totalAmount),
      updated_at: now.toISOString(),
    };

    let signedState: SignedCheckoutState;
    try {
      signedState = await signAuthoritativeCheckoutState({
        baseState,
        database: context.env.DB,
        keyEncryptionSecret: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
        nonce: dependencies.createCheckoutNonce(now),
        now,
        proposedExpiry,
      });
    } catch (error) {
      return completeMutationError(
        context.env.DB,
        claim,
        securityResult.security,
        protocolError(500, "checkout_signing_failed", safeMessage(error)),
      );
    }

    let event: Awaited<ReturnType<typeof createSignalWorksOrderEventPublication>>;
    try {
      event = await createSignalWorksOrderEventPublication({
        checkoutSessionId,
        database: context.env.DB,
        eventId: dependencies.createEventId(now),
        eventType: "CHECKOUT_CREATED",
        keyEncryptionSecret: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
        nonce: dependencies.createEventNonce(now),
        now,
        stateHash: signedState.acpStateHash,
        status: "ready_for_payment",
      });
    } catch (error) {
      return completeMutationError(
        context.env.DB,
        claim,
        securityResult.security,
        protocolError(500, "event_signing_failed", safeMessage(error)),
      );
    }
    const response = successResponse(signedState, securityResult.security, 201);
    const idempotencyKey = requireIdempotencyKey(securityResult.security);
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO merchant_checkout_sessions (id, credential_id, status, revision, acp_state, acp_state_hash, acp_signature, merchant_checkout, merchant_checkout_signature, created_at, updated_at, expires_at) VALUES (?, ?, 'ready_for_payment', 1, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        checkoutSessionId,
        securityResult.security.credential.id,
        JSON.stringify(signedState.acpState),
        signedState.acpStateHash,
        JSON.stringify(signedState.acpSignature),
        JSON.stringify(signedState.merchantCheckout),
        JSON.stringify(signedState.merchantCheckoutSignature),
        now.getTime(),
        now.getTime(),
        signedState.expiresAtEpochMs,
      ),
      prepareSignalWorksOrderEventInsert(context.env.DB, event),
      prepareAcpIdempotencyCompletion(context.env.DB, claim, idempotencyKey, response),
    ]);
    return acpResponse(response);
  });

  routes.get("/checkout_sessions/:checkoutSessionId", async (context) => {
    const now = dependencies.now();
    const securityResult = await validateAcpRequestSecurity({
      database: context.env.DB,
      headers: context.req.raw.headers,
      mutation: false,
      now,
    });
    if (!securityResult.success) {
      return acpResponse(securityResult.response);
    }
    const stored = await readStoredCheckout(
      context.env.DB,
      context.req.param("checkoutSessionId"),
      securityResult.security.credential.id,
    );
    if (stored === undefined) {
      return acpResponse(
        protocolError(404, "checkout_not_found", "Checkout session was not found."),
      );
    }
    return acpResponse(successResponse(stored, securityResult.security, 200));
  });

  routes.post("/checkout_sessions/:checkoutSessionId", async (context) =>
    handleExistingMutation({
      context,
      dependencies,
      operation: "update",
    }),
  );
  routes.post("/checkout_sessions/:checkoutSessionId/complete", async (context) =>
    handleExistingMutation({
      context,
      dependencies,
      operation: "complete",
    }),
  );
  routes.post("/checkout_sessions/:checkoutSessionId/cancel", async (context) =>
    handleExistingMutation({
      context,
      dependencies,
      operation: "cancel",
    }),
  );

  return routes;
}

async function handleExistingMutation(input: {
  readonly context: Context<{ Bindings: SignalWorksCheckoutBindings }>;
  readonly dependencies: SignalWorksCheckoutDependencies;
  readonly operation: "update" | "complete" | "cancel";
}): Promise<Response> {
  const { context, dependencies, operation } = input;
  const now = dependencies.now();
  const securityResult = await validateAcpRequestSecurity({
    database: context.env.DB,
    headers: context.req.raw.headers,
    mutation: true,
    now,
  });
  if (!securityResult.success) {
    return acpResponse(securityResult.response);
  }
  const rawBody = await readJsonBody(context.req.raw, operation === "cancel");
  if (!rawBody.success) {
    return acpResponse(protocolError(400, "invalid_json", "The request body must be valid JSON."));
  }
  const checkoutSessionId = context.req.param("checkoutSessionId") ?? "";
  const path =
    operation === "update"
      ? `/checkout_sessions/${checkoutSessionId}`
      : `/checkout_sessions/${checkoutSessionId}/${operation}`;
  const claim = await claimAcpIdempotency({
    body: rawBody.body,
    database: context.env.DB,
    method: "POST",
    now,
    path,
    security: securityResult.security,
  });
  if (!claim.success) {
    return acpResponse(claim.response);
  }

  const schemaName =
    operation === "update"
      ? "checkoutSessionUpdateRequest"
      : operation === "complete"
        ? "checkoutSessionCompleteRequest"
        : "cancelSessionRequest";
  const request = validateRequest(schemaName, rawBody.body);
  if (!request.success) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(400, "invalid_request", request.message),
    );
  }

  const stored = await readStoredCheckout(
    context.env.DB,
    checkoutSessionId,
    securityResult.security.credential.id,
  );
  if (stored === undefined) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(404, "checkout_not_found", "Checkout session was not found."),
    );
  }
  if (stored.status !== "ready_for_payment" || stored.expiresAtEpochMs <= now.getTime()) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(409, "illegal_checkout_transition", "The checkout transition is not allowed."),
    );
  }

  let baseState: Omit<AcpCheckoutSession, "expires_at">;
  let eventType: "CHECKOUT_UPDATED" | "ORDER_CREATED" | "CHECKOUT_CANCELED";
  let orderId: string | undefined;
  try {
    if (operation === "update") {
      const updateRequest = request.value as AcpCheckoutSessionUpdateRequest;
      assertSupportedDiscounts(updateRequest);
      const lineItems =
        updateRequest.line_items === undefined
          ? stored.acpState.line_items
          : await resolveLineItems(context.env.DB, updateRequest.line_items);
      const totalAmount = totalForLineItems(lineItems);
      baseState = {
        ...stored.acpState,
        ...(updateRequest.buyer === undefined ? {} : { buyer: updateRequest.buyer }),
        ...(updateRequest.fulfillment_details === undefined
          ? {}
          : { fulfillment_details: updateRequest.fulfillment_details }),
        ...(updateRequest.fulfillment_groups === undefined
          ? {}
          : { fulfillment_groups: updateRequest.fulfillment_groups }),
        line_items: lineItems,
        ...(updateRequest.selected_fulfillment_options === undefined
          ? {}
          : { selected_fulfillment_options: updateRequest.selected_fulfillment_options }),
        status: "ready_for_payment",
        totals: totals(totalAmount),
        updated_at: now.toISOString(),
      };
      delete (baseState as { expires_at?: string }).expires_at;
      eventType = "CHECKOUT_UPDATED";
    } else if (operation === "complete") {
      const completeRequest = request.value as {
        readonly buyer?: AcpCheckoutSession["buyer"];
      };
      orderId = dependencies.createOrderId(now);
      baseState = {
        ...stored.acpState,
        ...(completeRequest.buyer === undefined ? {} : { buyer: completeRequest.buyer }),
        order: {
          checkout_session_id: stored.id,
          id: orderId,
          permalink_url: `${SIGNALWORKS_ORIGIN}/orders/${orderId}`,
          status: "created",
          totals: stored.acpState.totals,
          type: "order",
        },
        status: "completed",
        updated_at: now.toISOString(),
      };
      delete (baseState as { expires_at?: string }).expires_at;
      eventType = "ORDER_CREATED";
    } else {
      baseState = {
        ...stored.acpState,
        messages: [
          ...stored.acpState.messages,
          {
            content: "Checkout session has been canceled.",
            content_type: "plain",
            type: "info",
          },
        ],
        status: "canceled",
        updated_at: now.toISOString(),
      };
      delete (baseState as { expires_at?: string }).expires_at;
      eventType = "CHECKOUT_CANCELED";
    }
  } catch (error) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(400, "invalid_checkout_update", safeMessage(error)),
    );
  }

  let signedState: SignedCheckoutState;
  try {
    signedState = await signAuthoritativeCheckoutState({
      baseState,
      database: context.env.DB,
      keyEncryptionSecret: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
      nonce: dependencies.createCheckoutNonce(now),
      now,
      proposedExpiry: stored.expiresAtEpochMs,
    });
  } catch (error) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(500, "checkout_signing_failed", safeMessage(error)),
    );
  }

  let event: Awaited<ReturnType<typeof createSignalWorksOrderEventPublication>>;
  try {
    event = await createSignalWorksOrderEventPublication({
      checkoutSessionId,
      database: context.env.DB,
      eventId: dependencies.createEventId(now),
      eventType,
      keyEncryptionSecret: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
      nonce: dependencies.createEventNonce(now),
      now,
      ...(orderId === undefined ? {} : { orderId }),
      stateHash: signedState.acpStateHash,
      status: signedState.acpState.status as "ready_for_payment" | "completed" | "canceled",
    });
  } catch (error) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(500, "event_signing_failed", safeMessage(error)),
    );
  }
  const response = successResponse(signedState, securityResult.security, 200);
  const idempotencyKey = requireIdempotencyKey(securityResult.security);
  const results = await context.env.DB.batch([
    prepareConditionalSignalWorksOrderEventInsert(
      context.env.DB,
      event,
      stored.revision,
      "ready_for_payment",
    ),
    context.env.DB.prepare(
      "UPDATE merchant_checkout_sessions SET status = ?, revision = ?, acp_state = ?, acp_state_hash = ?, acp_signature = ?, merchant_checkout = ?, merchant_checkout_signature = ?, updated_at = ?, expires_at = ? WHERE id = ? AND credential_id = ? AND status = 'ready_for_payment' AND revision = ?",
    ).bind(
      signedState.acpState.status,
      stored.revision + 1,
      JSON.stringify(signedState.acpState),
      signedState.acpStateHash,
      JSON.stringify(signedState.acpSignature),
      JSON.stringify(signedState.merchantCheckout),
      JSON.stringify(signedState.merchantCheckoutSignature),
      now.getTime(),
      signedState.expiresAtEpochMs,
      stored.id,
      stored.credentialId,
      stored.revision,
    ),
    prepareAcpIdempotencyCompletionForCheckout(context.env.DB, claim, idempotencyKey, response, {
      acpSignature: JSON.stringify(signedState.acpSignature),
      id: stored.id,
      revision: stored.revision + 1,
    }),
  ]);
  if (results[1]?.meta.changes !== 1) {
    return completeMutationError(
      context.env.DB,
      claim,
      securityResult.security,
      protocolError(409, "illegal_checkout_transition", "The checkout transition is not allowed."),
    );
  }
  return acpResponse(response);
}

async function signAuthoritativeCheckoutState(input: {
  readonly baseState: Omit<AcpCheckoutSession, "expires_at"> | Record<string, unknown>;
  readonly database: D1Database;
  readonly keyEncryptionSecret: unknown;
  readonly nonce: string;
  readonly now: Date;
  readonly proposedExpiry: number;
}): Promise<SignedCheckoutState> {
  const nowEpochMs = input.now.getTime();
  const identity = await readSignalWorksPublicIdentity(input.database);
  const checkoutKey = selectActiveSignalWorksSigningKey(
    identity.signingKeys,
    "checkout",
    nowEpochMs,
  );
  const expiryBoundaries = [input.proposedExpiry];
  if (checkoutKey.valid_until !== undefined) {
    expiryBoundaries.push(Date.parse(checkoutKey.valid_until));
  }
  if (checkoutKey.revoked_at !== undefined) {
    expiryBoundaries.push(Date.parse(checkoutKey.revoked_at));
  }
  const expiresAtEpochMs = Math.min(...expiryBoundaries);
  const acpStateValue: unknown = {
    ...input.baseState,
    expires_at: new Date(expiresAtEpochMs).toISOString(),
  };
  assertAcpSchema("checkoutSession", acpStateValue);
  const acpState = acpStateValue;
  const services = await readSignalWorksServiceVersions(input.database);
  const serviceById = new Map(services.map((service) => [service.service_id, service]));
  const checkoutLines = acpState.line_items.map((lineItem) => {
    const service = serviceById.get(lineItem.item.id);
    if (service === undefined) {
      throw new SignalWorksCheckoutError(`Unknown service in checkout state: ${lineItem.item.id}`);
    }
    return {
      line_total_subunits: service.price_subunits * lineItem.quantity,
      quantity: lineItem.quantity,
      service_id: service.service_id,
      service_version: service.version,
      unit_price_subunits: service.price_subunits,
    };
  });
  const firstService = services.find(
    (service) => service.service_id === checkoutLines[0]?.service_id,
  );
  if (firstService === undefined) {
    throw new SignalWorksCheckoutError("A checkout requires at least one published service");
  }
  const merchantCheckout = merchantCheckoutSchema.parse({
    audience: MINDPAY_API_AUDIENCE,
    checkout_session_id: acpState.id,
    currency: "INR",
    expires_at: acpState.expires_at,
    fulfilment_terms: {
      delivery_type: "mcp",
      policy_url: firstService.policy_links.terms_url,
      summary: `Issue scoped entitlements for ${checkoutLines.length} SignalWorks service${checkoutLines.length === 1 ? "" : "s"}.`,
    },
    issued_at: input.now.toISOString(),
    issuer: `${SIGNALWORKS_ORIGIN}/`,
    kid: checkoutKey.kid,
    line_items: checkoutLines,
    merchant_domain: identity.merchant.domain,
    merchant_id: identity.merchant.merchant_id,
    nonce: input.nonce,
    schema_version: "1",
    total_subunits: checkoutLines.reduce((total, line) => total + line.line_total_subunits, 0),
  });
  const encryptionKey = await importSignalWorksKeyEncryptionKey(input.keyEncryptionSecret);
  const [acpSignature, merchantCheckoutSignature, acpStateHash] = await Promise.all([
    signSignalWorksPayloadWithKey(
      input.database,
      encryptionKey,
      checkoutKey.kid,
      acpState,
      nowEpochMs,
    ),
    signSignalWorksPayloadWithKey(
      input.database,
      encryptionKey,
      checkoutKey.kid,
      merchantCheckout,
      nowEpochMs,
    ),
    sha256CanonicalJsonHex(acpState),
  ]);
  return {
    acpSignature,
    acpState,
    acpStateHash,
    expiresAtEpochMs,
    merchantCheckout,
    merchantCheckoutSignature,
  };
}

async function resolveLineItems(
  database: D1Database,
  requestedItems:
    | AcpCheckoutSessionCreateRequest["line_items"]
    | AcpCheckoutSessionUpdateRequest["line_items"],
): Promise<AcpCheckoutSession["line_items"]> {
  if (requestedItems === undefined || requestedItems.length === 0) {
    throw new SignalWorksCheckoutError("At least one service is required");
  }
  const services = await readSignalWorksServiceVersions(database);
  const serviceById = new Map(services.map((service) => [service.service_id, service]));
  if (new Set(requestedItems.map((item) => item.id)).size !== requestedItems.length) {
    throw new SignalWorksCheckoutError("A service can appear only once per checkout");
  }
  return requestedItems.map((item) => {
    const service = serviceById.get(item.id);
    if (service === undefined || service.availability !== "available") {
      throw new SignalWorksCheckoutError(`Service is not available: ${item.id}`);
    }
    return serviceLineItem(service);
  });
}

function serviceLineItem(service: ServiceVersion): AcpCheckoutSession["line_items"][number] {
  return {
    availability_status: "in_stock",
    category: service.category,
    description: service.description,
    id: `line_${service.service_id}`,
    item: {
      id: service.service_id,
      name: service.name,
      unit_amount: service.price_subunits,
    },
    name: service.name,
    product_id: service.service_id,
    quantity: 1,
    totals: totals(service.price_subunits),
    unit_amount: service.price_subunits,
  };
}

function totals(amount: number): AcpCheckoutSession["totals"] {
  return [
    { amount, display_text: "Items", type: "items_base_amount" },
    { amount, display_text: "Subtotal", type: "subtotal" },
    { amount, display_text: "Total", type: "total" },
  ];
}

function totalForLineItems(lineItems: AcpCheckoutSession["line_items"]): number {
  const total = lineItems.reduce(
    (sum, lineItem) => sum + (lineItem.unit_amount ?? 0) * lineItem.quantity,
    0,
  );
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new SignalWorksCheckoutError("Checkout total is outside the supported range");
  }
  return total;
}

function assertSupportedCurrency(currency: string): void {
  if (currency.toUpperCase() !== "INR") {
    throw new SignalWorksCheckoutError("SignalWorks checkouts require INR");
  }
}

function assertSupportedDiscounts(request: {
  readonly coupons?: readonly string[];
  readonly discounts?: { readonly codes?: readonly string[] };
}): void {
  if ((request.coupons?.length ?? 0) > 0 || (request.discounts?.codes?.length ?? 0) > 0) {
    throw new SignalWorksCheckoutError("SignalWorks does not support checkout discounts");
  }
}

async function readStoredCheckout(
  database: D1Database,
  checkoutSessionId: string,
  credentialId: string,
): Promise<StoredCheckoutSession | undefined> {
  const result = await database
    .prepare(
      "SELECT id, credential_id, status, revision, acp_state, acp_state_hash, acp_signature, merchant_checkout, merchant_checkout_signature, created_at, updated_at, expires_at FROM merchant_checkout_sessions WHERE id = ? AND credential_id = ? LIMIT 1",
    )
    .bind(checkoutSessionId, credentialId)
    .all();
  const row = z.array(checkoutRowSchema).parse(result.results)[0];
  if (row === undefined) {
    return undefined;
  }
  const acpStateValue = parseJson(row.acp_state);
  assertAcpSchema("checkoutSession", acpStateValue);
  const acpSignature = parseSignature(row.acp_signature);
  const merchantCheckout = merchantCheckoutSchema.parse(parseJson(row.merchant_checkout));
  const merchantCheckoutSignature = parseSignature(row.merchant_checkout_signature);
  return {
    acpSignature,
    acpState: acpStateValue,
    acpStateHash: row.acp_state_hash,
    createdAtEpochMs: row.created_at,
    credentialId: row.credential_id,
    expiresAtEpochMs: row.expires_at,
    id: row.id,
    merchantCheckout,
    merchantCheckoutSignature,
    revision: row.revision,
    status: row.status,
    updatedAtEpochMs: row.updated_at,
  };
}

function successResponse(
  state: Pick<
    StoredCheckoutSession,
    "acpSignature" | "acpState" | "merchantCheckout" | "merchantCheckoutSignature"
  >,
  security: AcpRequestSecurity,
  status: 200 | 201,
): AcpProtocolResponse {
  assertAcpSchema(
    state.acpState.status === "completed" ? "checkoutSessionWithOrder" : "checkoutSession",
    state.acpState,
  );
  return {
    body: state.acpState,
    headers: {
      "API-Version": ACP_VERSION,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=UTF-8",
      ...(security.idempotencyKey === undefined
        ? {}
        : { "Idempotency-Key": security.idempotencyKey }),
      "Request-Id": security.requestId,
      "X-Content-Type-Options": "nosniff",
      "X-MindPay-ACP-Signature": encodeHeader(state.acpSignature),
      "X-MindPay-Checkout": encodeHeader(state.merchantCheckout),
      "X-MindPay-Checkout-Signature": encodeHeader(state.merchantCheckoutSignature),
    },
    status,
  };
}

async function completeMutationError(
  database: D1Database,
  claim: Extract<AcpIdempotencyClaim, { success: true }>,
  security: AcpRequestSecurity,
  response: AcpProtocolResponse,
): Promise<Response> {
  const idempotencyKey = requireIdempotencyKey(security);
  const storedResponse = {
    ...response,
    headers: {
      ...response.headers,
      "Idempotency-Key": idempotencyKey,
      "Request-Id": security.requestId,
    },
  };
  await completeAcpIdempotency(database, claim, idempotencyKey, storedResponse);
  return acpResponse(storedResponse);
}

function validateRequest<K extends AcpSchemaName>(
  schemaName: K,
  value: unknown,
):
  | Readonly<{ message: string; success: false }>
  | Readonly<{ success: true; value: AcpSchemaTypeMap[K] }> {
  try {
    assertAcpSchema(schemaName, value);
    return { success: true, value };
  } catch (error) {
    return { message: safeMessage(error), success: false };
  }
}

async function readJsonBody(
  request: Request,
  allowEmpty: boolean,
): Promise<Readonly<{ body: unknown; success: true }> | Readonly<{ success: false }>> {
  const text = await request.text();
  if (text.trim() === "") {
    return allowEmpty ? { body: {}, success: true } : { success: false };
  }
  try {
    return { body: JSON.parse(text) as unknown, success: true };
  } catch {
    return { success: false };
  }
}

function parseJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new SignalWorksCheckoutError("Stored checkout contains malformed JSON");
  }
}

function parseSignature(serialized: string): Es256CanonicalSignature {
  const parsed = z
    .object({
      alg: z.literal("ES256"),
      kid: z.string(),
      signature: z.string(),
    })
    .strict()
    .parse(parseJson(serialized));
  return parsed;
}

function encodeHeader(value: unknown): string {
  return bytesToBase64Url(canonicalizeJsonBytes(value));
}

function requireIdempotencyKey(security: AcpRequestSecurity): string {
  if (security.idempotencyKey === undefined) {
    throw new TypeError("Mutation security context is missing an idempotency key");
  }
  return security.idempotencyKey;
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The checkout request could not be processed.";
}

export class SignalWorksCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksCheckoutError";
  }
}
