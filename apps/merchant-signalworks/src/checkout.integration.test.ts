import {
  merchantCheckoutSchema,
  signedMerchantOrderLifecycleEventSchema,
  verifyMerchantOrderEvent,
} from "@mindpay/contracts";
import { base64UrlToBytes, importEs256PublicJwk, verifyCanonicalJsonEs256 } from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import { ACP_VERSION, assertAcpSchema } from "@mindpay/protocol-acp";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  revokeSignalWorksSigningKey,
  rotateSignalWorksSigningKey,
  seedSignalWorksIdentity,
} from "./identity";
import { createMerchantApp, type MerchantBindings } from "./index";
import { seedSignalWorksMachineCredential } from "./machine-auth";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_ORIGIN } from "./publication";
import { seedSignalWorksServiceVersions } from "./services";
import { createSignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);
const MACHINE_TOKEN = "mindpay_test_machine_token_0000000001";

describe("SignalWorks ACP checkout contract", () => {
  let database: D1Database;
  let miniflare: Miniflare;
  let bindings: MerchantBindings;

  beforeEach(async () => {
    ({ database, miniflare } = await createSignalWorksTestDatabase(
      `mindpay-signalworks-checkout-${crypto.randomUUID()}`,
    ));
    const encryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
    await seedSignalWorksIdentity(database, encryptionKey, NOW);
    await seedSignalWorksServiceVersions(database);
    await seedSignalWorksMachineCredential(database, MACHINE_TOKEN, NOW);
    bindings = {
      DB: database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
      SIGNALWORKS_MACHINE_AUTH_TOKEN: MACHINE_TOKEN,
    };
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("creates, updates, retrieves, completes, and cancels authoritative signed ACP state", async () => {
    const app = testApp(NOW);
    const created = await mutate(app, "/checkout_sessions", "idem_create_checkout_0001", {
      capabilities: {},
      currency: "inr",
      line_items: [{ id: "market_snapshot", unit_amount: 1 }],
    });
    const createdBody: unknown = await created.json();
    assertAcpSchema("checkoutSession", createdBody);
    expect(created.status).toBe(201);
    expect(createdBody).toMatchObject({
      currency: "inr",
      line_items: [
        {
          item: { id: "market_snapshot", unit_amount: 29_900 },
          quantity: 1,
          unit_amount: 29_900,
        },
      ],
      status: "ready_for_payment",
    });
    expect(createdBody.totals).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 29_900, type: "total" })]),
    );
    await expectSignedHeaders(created, createdBody);

    const updated = await mutate(
      app,
      `/checkout_sessions/${createdBody.id}`,
      "idem_update_checkout_0001",
      { line_items: [{ id: "detailed_competitor_dossier", unit_amount: 1 }] },
    );
    const updatedBody: unknown = await updated.json();
    assertAcpSchema("checkoutSession", updatedBody);
    expect(updatedBody).toMatchObject({
      id: createdBody.id,
      line_items: [{ item: { id: "detailed_competitor_dossier", unit_amount: 44_900 } }],
      status: "ready_for_payment",
    });

    const retrieved = await app.request(
      `${SIGNALWORKS_ORIGIN}/checkout_sessions/${createdBody.id}`,
      { headers: requestHeaders(undefined, "request_get_checkout_0001") },
      bindings,
    );
    const retrievedBody: unknown = await retrieved.json();
    assertAcpSchema("checkoutSession", retrievedBody);
    expect(retrievedBody).toEqual(updatedBody);
    await expectSignedHeaders(retrieved, retrievedBody);

    const completed = await mutate(
      app,
      `/checkout_sessions/${createdBody.id}/complete`,
      "idem_complete_checkout_0001",
      { payment_data: { purchase_order_number: "MINDPAY-DEMO-1001" } },
    );
    const completedBody: unknown = await completed.json();
    assertAcpSchema("checkoutSessionWithOrder", completedBody);
    expect(completedBody).toMatchObject({
      id: createdBody.id,
      order: { checkout_session_id: createdBody.id, status: "created" },
      status: "completed",
    });
    await expectSignedHeaders(completed, completedBody);

    const beforeIllegal = await storedState(createdBody.id);
    const illegal = await mutate(
      app,
      `/checkout_sessions/${createdBody.id}`,
      "idem_illegal_update_0001",
      { buyer: { email: "blocked@example.com" } },
    );
    expect(illegal.status).toBe(409);
    assertAcpSchema("checkoutError", await illegal.json());
    await expect(storedState(createdBody.id)).resolves.toBe(beforeIllegal);

    const cancelCreated = await mutate(app, "/checkout_sessions", "idem_create_cancel_0001", {
      capabilities: {},
      currency: "INR",
      line_items: [{ id: "enterprise_intelligence_pack" }],
    });
    const cancelCreatedBody: unknown = await cancelCreated.json();
    assertAcpSchema("checkoutSession", cancelCreatedBody);
    const canceled = await mutate(
      app,
      `/checkout_sessions/${cancelCreatedBody.id}/cancel`,
      "idem_cancel_checkout_0001",
      {},
    );
    const canceledBody: unknown = await canceled.json();
    assertAcpSchema("checkoutSession", canceledBody);
    expect(canceledBody).toMatchObject({ id: cancelCreatedBody.id, status: "canceled" });
  });

  it("replays the exact stored response, rejects changed input, and authenticates before writes", async () => {
    const app = testApp(NOW);
    const body = {
      capabilities: {},
      currency: "inr",
      line_items: [{ id: "market_snapshot" }],
    };
    const first = await mutate(app, "/checkout_sessions", "idem_same_payload_0001", body);
    const firstText = await first.text();
    const firstSignature = first.headers.get("x-mindpay-acp-signature");
    const replay = await mutate(app, "/checkout_sessions", "idem_same_payload_0001", body);
    expect(replay.status).toBe(201);
    expect(await replay.text()).toBe(firstText);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(replay.headers.get("x-mindpay-acp-signature")).toBe(firstSignature);

    const conflict = await mutate(app, "/checkout_sessions", "idem_same_payload_0001", {
      ...body,
      line_items: [{ id: "enterprise_intelligence_pack" }],
    });
    expect(conflict.status).toBe(409);
    expect(await countRows("merchant_checkout_sessions")).toBe(1);

    const beforeInvalid = await countRows("merchant_idempotency_records");
    const invalid = await app.request(
      `${SIGNALWORKS_ORIGIN}/checkout_sessions`,
      {
        body: JSON.stringify(body),
        headers: {
          ...requestHeaders("idem_invalid_auth_0001", "request_invalid_auth_0001"),
          Authorization: "Bearer invalid_machine_token_that_is_long_enough_0001",
        },
        method: "POST",
      },
      bindings,
    );
    expect(invalid.status).toBe(401);
    expect(await countRows("merchant_idempotency_records")).toBe(beforeInvalid);

    await database
      .prepare("UPDATE merchant_machine_credentials SET expires_at = ? WHERE id = ?")
      .bind(NOW.getTime() + 1, "machine_mindpay_gateway")
      .run();
    const expiredApp = testApp(new Date(NOW.getTime() + 2));
    const expired = await mutate(expiredApp, "/checkout_sessions", "idem_expired_auth_0001", body);
    expect(expired.status).toBe(401);
    expect(await countRows("merchant_idempotency_records")).toBe(beforeInvalid);
  });

  it("atomically permits only one competing terminal transition", async () => {
    const app = testApp(NOW);
    const created = await mutate(app, "/checkout_sessions", "idem_race_create_0001", {
      capabilities: {},
      currency: "inr",
      line_items: [{ id: "market_snapshot" }],
    });
    const createdBody: unknown = await created.json();
    assertAcpSchema("checkoutSession", createdBody);

    const [completed, canceled] = await Promise.all([
      mutate(app, `/checkout_sessions/${createdBody.id}/complete`, "idem_race_complete_0001", {
        payment_data: { purchase_order_number: "MINDPAY-RACE-1" },
      }),
      mutate(app, `/checkout_sessions/${createdBody.id}/cancel`, "idem_race_cancel_0001", {}),
    ]);
    expect([completed.status, canceled.status].toSorted()).toEqual([200, 409]);
    const terminalEvents = await database
      .prepare(
        "SELECT count(*) AS count FROM merchant_outbound_events WHERE event_type IN ('ORDER_CREATED', 'CHECKOUT_CANCELED')",
      )
      .first<{ count: number }>();
    expect(terminalEvents?.count).toBe(1);

    const loserOperation = completed.status === 409 ? "complete" : "cancel";
    const loserKey = completed.status === 409 ? "idem_race_complete_0001" : "idem_race_cancel_0001";
    const replay = await mutate(
      app,
      `/checkout_sessions/${createdBody.id}/${loserOperation}`,
      loserKey,
      loserOperation === "complete"
        ? { payment_data: { purchase_order_number: "MINDPAY-RACE-1" } }
        : {},
    );
    expect(replay.status).toBe(409);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
  });

  it("lets MindPay verify signed outbox events while rejecting replay, expiry, unknown, and revoked keys", async () => {
    const app = testApp(NOW);
    await mutate(app, "/checkout_sessions", "idem_event_checkout_0001", {
      capabilities: {},
      currency: "inr",
      line_items: [{ id: "market_snapshot" }],
    });
    const row = await database
      .prepare("SELECT event, signature FROM merchant_outbound_events ORDER BY created_at LIMIT 1")
      .first<{ event: string; signature: string }>();
    if (row === null) {
      throw new Error("Missing signed order event");
    }
    const publication = signedMerchantOrderLifecycleEventSchema.parse({
      event: JSON.parse(row.event) as unknown,
      signature: JSON.parse(row.signature) as unknown,
    });
    const identity = await readSignalWorksPublicIdentity(database);
    const seen = new Set<string>();
    const replayStore = {
      claim: (nonce: string) => {
        if (seen.has(nonce)) {
          return Promise.resolve(false);
        }
        seen.add(nonce);
        return Promise.resolve(true);
      },
    };
    await expect(
      verifyMerchantOrderEvent(
        {
          body: publication,
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedIssuer: `${SIGNALWORKS_ORIGIN}/`,
          expectedMerchantId: "merchant_signalworks",
          replayStore,
          signingKeys: identity.signingKeys,
        },
        NOW.getTime(),
      ),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      verifyMerchantOrderEvent(
        {
          body: publication,
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedIssuer: `${SIGNALWORKS_ORIGIN}/`,
          expectedMerchantId: "merchant_signalworks",
          replayStore,
          signingKeys: identity.signingKeys,
        },
        NOW.getTime(),
      ),
    ).resolves.toEqual({ reason: "REPLAYED_EVENT", valid: false });
    await expect(
      verifyMerchantOrderEvent(
        {
          body: publication,
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedIssuer: `${SIGNALWORKS_ORIGIN}/`,
          expectedMerchantId: "merchant_signalworks",
          replayStore: { claim: () => Promise.resolve(true) },
          signingKeys: identity.signingKeys,
        },
        Date.parse(publication.event.expires_at),
      ),
    ).resolves.toEqual({ reason: "EVENT_EXPIRED", valid: false });
    await expect(
      verifyMerchantOrderEvent(
        {
          body: {
            event: { ...publication.event, kid: "unknown.event.key" },
            signature: { ...publication.signature, kid: "unknown.event.key" },
          },
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedIssuer: `${SIGNALWORKS_ORIGIN}/`,
          expectedMerchantId: "merchant_signalworks",
          replayStore: { claim: () => Promise.resolve(true) },
          signingKeys: identity.signingKeys,
        },
        NOW.getTime(),
      ),
    ).resolves.toEqual({ reason: "UNKNOWN_KEY", valid: false });
    await expect(
      verifyMerchantOrderEvent(
        {
          body: publication,
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedIssuer: `${SIGNALWORKS_ORIGIN}/`,
          expectedMerchantId: "merchant_impostor",
          replayStore: { claim: () => Promise.resolve(true) },
          signingKeys: identity.signingKeys,
        },
        NOW.getTime(),
      ),
    ).resolves.toEqual({ reason: "MERCHANT_MISMATCH", valid: false });

    const eventKey = identity.signingKeys.find((key) => key.purpose.includes("event"));
    if (eventKey === undefined) {
      throw new Error("Missing event key");
    }
    const encryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
    const validFrom = new Date(NOW.getTime() + 1_000);
    const oldValidUntil = new Date(NOW.getTime() + 10_000);
    const rotated = await rotateSignalWorksSigningKey(
      database,
      encryptionKey,
      {
        currentKid: eventKey.kid,
        newKid: "signalworks.event.2026-02",
        oldValidUntil,
        purpose: "event",
        validFrom,
      },
      NOW,
    );
    const overlapNow = new Date(NOW.getTime() + 2_000);
    const overlapApp = testApp(overlapNow);
    await mutate(overlapApp, "/checkout_sessions", "idem_rotated_event_0001", {
      capabilities: {},
      currency: "inr",
      line_items: [{ id: "market_snapshot" }],
    });
    const eventKids = await database
      .prepare("SELECT kid FROM merchant_outbound_events ORDER BY created_at, event_id")
      .all<{ kid: string }>();
    expect(new Set(eventKids.results.map((event) => event.kid))).toEqual(
      new Set([eventKey.kid, "signalworks.event.2026-02"]),
    );
    expect(
      rotated.signingKeys.filter(
        (key) =>
          key.purpose.includes("event") &&
          Date.parse(key.valid_from) <= overlapNow.getTime() &&
          (key.valid_until === undefined || Date.parse(key.valid_until) > overlapNow.getTime()),
      ),
    ).toHaveLength(2);

    await revokeSignalWorksSigningKey(database, eventKey.kid, overlapNow);
    await expect(
      verifyMerchantOrderEvent(
        {
          body: publication,
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedIssuer: `${SIGNALWORKS_ORIGIN}/`,
          expectedMerchantId: "merchant_signalworks",
          replayStore: { claim: () => Promise.resolve(true) },
          signingKeys: (await readSignalWorksPublicIdentity(database)).signingKeys,
        },
        overlapNow.getTime(),
      ),
    ).resolves.toEqual({ reason: "REVOKED_KEY", valid: false });
  });

  function testApp(now: Date) {
    let sequence = 0;
    const nextUlid = () => createUlid(now.getTime() + sequence++);
    return createMerchantApp({
      createCheckoutNonce: () => `nonce_checkout_${nextUlid()}`,
      createCheckoutSessionId: () => `checkout_${nextUlid()}`,
      createEventId: () => `evt_${nextUlid()}`,
      createEventNonce: () => `nonce_event_${nextUlid()}`,
      createOrderId: () => `ord_${nextUlid()}`,
      now: () => new Date(now),
    });
  }

  async function mutate(
    app: ReturnType<typeof createMerchantApp>,
    path: string,
    idempotencyKey: string,
    body: unknown,
  ) {
    return app.request(
      `${SIGNALWORKS_ORIGIN}${path}`,
      {
        body: JSON.stringify(body),
        headers: requestHeaders(idempotencyKey, `request_${idempotencyKey}`),
        method: "POST",
      },
      bindings,
    );
  }

  async function expectSignedHeaders(response: Response, acpState: unknown): Promise<void> {
    const identity = await readSignalWorksPublicIdentity(database);
    const checkoutKey = identity.signingKeys.find((key) => key.purpose.includes("checkout"));
    if (checkoutKey === undefined) {
      throw new Error("Missing checkout key");
    }
    const verificationKey = {
      kid: checkoutKey.kid,
      publicKey: await importEs256PublicJwk(checkoutKey.public_jwk),
      validFromEpochMs: Date.parse(checkoutKey.valid_from),
    };
    const acpSignature = decodeHeader(response, "x-mindpay-acp-signature");
    await expect(
      verifyCanonicalJsonEs256(acpState, acpSignature, [verificationKey], NOW.getTime()),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      verifyCanonicalJsonEs256(
        { ...(acpState as Record<string, unknown>), currency: "usd" },
        acpSignature,
        [verificationKey],
        NOW.getTime(),
      ),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
    const merchantCheckout = merchantCheckoutSchema.parse(
      decodeHeader(response, "x-mindpay-checkout"),
    );
    const merchantSignature = decodeHeader(response, "x-mindpay-checkout-signature");
    await expect(
      verifyCanonicalJsonEs256(
        merchantCheckout,
        merchantSignature,
        [verificationKey],
        NOW.getTime(),
      ),
    ).resolves.toMatchObject({ valid: true });
  }

  async function storedState(checkoutSessionId: string): Promise<string | undefined> {
    const row = await database
      .prepare("SELECT acp_state FROM merchant_checkout_sessions WHERE id = ?")
      .bind(checkoutSessionId)
      .first<{ acp_state: string }>();
    return row?.acp_state;
  }

  async function countRows(table: "merchant_checkout_sessions" | "merchant_idempotency_records") {
    const row = await database
      .prepare(`SELECT count(*) AS count FROM ${table}`)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }
});

function requestHeaders(idempotencyKey: string | undefined, requestId: string) {
  return {
    "API-Version": ACP_VERSION,
    Authorization: `Bearer ${MACHINE_TOKEN}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
    "Request-Id": requestId,
  };
}

function decodeHeader(response: Response, name: string): unknown {
  const encoded = response.headers.get(name);
  if (encoded === null) {
    throw new Error(`Missing ${name}`);
  }
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as unknown;
}
