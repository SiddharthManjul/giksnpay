import {
  createAgentEncryptedSigningKey,
  importAgentKeyEncryptionKey,
} from "@mindpay/agent-runtime";
import {
  deliveryReceiptSchema,
  marketSnapshotResultSchema,
  merchantCheckoutSchema,
  merchantPaymentEventSchema,
  merchantPaymentOrderResponseSchema,
  publicEvidenceBundleSchema,
  signedDeliveryPublicationSchema,
} from "@mindpay/contracts";
import {
  bytesToBase64Url,
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importEs256PublicJwk,
  sha256CanonicalJsonHex,
  signCanonicalJsonEs256,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import type {
  VerifiedAuthenticationResponse,
  VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { ORGANIZATION_CONTEXT_HEADER } from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";
import { createGatewayApp } from "./index";
import { MANDATE_APPROVAL_CHALLENGE_TTL_MS } from "./mandates";
import { createTestDatabase } from "./test-database";
import { TRANSACTION_APPROVAL_TTL_MS } from "./transactions";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const SECOND_ORIGIN = "http://admin.localhost:3000";
const API_AUDIENCE = "https://api.mindpay.example/";
const TEST_AUTH_SECRET = "mindpay-phase-six-secret-with-at-least-32-characters";
const TEST_KEY_SECRET = "A".repeat(43);
const TEST_PASSWORD = "MindPay-Phase-6-Password-2026";
const SIGNALWORKS_MACHINE_TOKEN = "mindpay_signalworks_machine_token_000001";
const ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6P6";
const AGENT_ID = "agt_01JGFJH900H8M2APVYVDZ4R6P6";
const AGENT_VERSION_ID = "agv_01JGFJH900H8M2APVYVDZ4R6P6";
const PASSKEY_ID = "pkc_01JGFJH900H8M2APVYVDZ4R6P6";
const MERCHANT_ID = "merchant_signalworks";
const FIXED_NOW = new Date("2026-08-30T12:00:00.000Z");

interface TestUser {
  readonly cookie: string;
  readonly id: string;
}

describe("Phase 6 mandate, policy, approval, and reservation exit gate", () => {
  let bindings: GatewayAuthBindings;
  let allowedTransactionId = "";
  let blockedTransactionId = "";
  let checkoutMandateId: string;
  let currentTime = new Date(FIXED_NOW);
  let database: D1Database;
  let merchantKeyPair: Awaited<ReturnType<typeof generateEs256KeyPair>>;
  let miniflare: Miniflare;
  let owner: TestUser;
  let paymentMandateId: string;
  let failedTransactionId = "";
  const paymentPublications = new Map<string, Readonly<{ event: unknown; signature: unknown }>>();
  let reviewedTransactionId = "";
  let presentedChallenge = "";
  const orderCreationHook = vi.fn();
  const merchantPaymentOrderHook = vi.fn(async (_bindings, authorization) =>
    merchantPaymentOrderResponseSchema.parse({
      attempt_number: authorization.attempt_number,
      checkout: {
        amount: authorization.amount_subunits,
        currency: "INR",
        description: authorization.service_id,
        key: "rzp_test_1234567890abcdef",
        name: "SignalWorks",
        order_id: `order_${authorization.transaction_id.slice(-8)}attempt${authorization.attempt_number}`,
        retry: { enabled: false },
      },
      provider_order_id: `order_${authorization.transaction_id.slice(-8)}attempt${authorization.attempt_number}`,
      receipt: `mp_${authorization.transaction_id.slice(-12)}_${authorization.attempt_number}`,
      state: "PAYMENT_PENDING",
      transaction_id: authorization.transaction_id,
    }),
  );
  const verifyAssertion = async (
    options: VerifyAuthenticationResponseOpts,
  ): Promise<VerifiedAuthenticationResponse> => {
    const challengeValid =
      typeof options.expectedChallenge === "function"
        ? await options.expectedChallenge(presentedChallenge)
        : options.expectedChallenge === presentedChallenge;
    return {
      authenticationInfo: {
        credentialBackedUp: false,
        credentialDeviceType: "singleDevice",
        credentialID: "credential_phase_06",
        newCounter: challengeValid ? 1 : 0,
        origin: FRONTEND_ORIGIN,
        rpID: "localhost",
        userVerified: challengeValid,
      },
      verified: challengeValid,
    };
  };
  const app = createGatewayApp(
    {},
    { now: () => new Date(currentTime) },
    {},
    {
      now: () => new Date(currentTime),
      verifyAuthenticationResponse: verifyAssertion,
    },
    {
      createMerchantPaymentOrder: merchantPaymentOrderHook,
      now: () => new Date(currentTime),
      onOrderCreation: orderCreationHook,
      verifyAuthenticationResponse: verifyAssertion,
    },
    { now: () => new Date(currentTime) },
    {},
    { now: () => new Date(currentTime) },
  );

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-phase-06-test"));
    bindings = {
      AGENT_KEY_ENCRYPTION_KEY: TEST_KEY_SECRET,
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      MINDPAY_API_AUDIENCE: API_AUDIENCE,
      PASSKEY_RP_ID: "localhost",
      SIGNALWORKS_MACHINE_AUTH_TOKEN: SIGNALWORKS_MACHINE_TOKEN,
      TRUSTED_ORIGINS: `${FRONTEND_ORIGIN},${SECOND_ORIGIN}`,
    };
    owner = await createAuthenticatedUser("phase6-owner@mindpay.test");
    await seedPhaseSixPrerequisites();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("creates a canonical mandate pair and rejects idempotency input mismatch", async () => {
    const request = defaultMandateRequest();
    const created = await mutation("/api/v1/mandates", "phase6-mandate-create-0001", request);
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      mandates: { mandate: { mandate_id: string; schema_version: string }; status: string }[];
    };
    expect(body.mandates.map((entry) => entry.status)).toEqual(["DRAFT", "DRAFT"]);
    checkoutMandateId = required(
      body.mandates.find(
        (entry) => entry.mandate.schema_version === "mindpay.mandate.checkout.open.1",
      )?.mandate.mandate_id,
    );
    paymentMandateId = required(
      body.mandates.find(
        (entry) => entry.mandate.schema_version === "mindpay.mandate.payment.open.1",
      )?.mandate.mandate_id,
    );

    const replay = await mutation("/api/v1/mandates", "phase6-mandate-create-0001", request);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(body);
    const mismatch = await mutation("/api/v1/mandates", "phase6-mandate-create-0001", {
      ...request,
      totalBudgetSubunits: 99_900,
    });
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("binds activation to payload, session, origin, expiry, and one use", async () => {
    const invalidPayloadChallenge = await createChallenge(
      paymentMandateId,
      "payment-invalid-payload",
    );
    presentedChallenge = bytesToBase64Url(new Uint8Array(32).fill(7));
    const differentPayload = await activateMandate(
      paymentMandateId,
      invalidPayloadChallenge.challengeId,
      "payment-invalid-payload-activate",
    );
    expect(differentPayload.status).toBe(400);
    expect(
      (
        await activateMandate(
          paymentMandateId,
          invalidPayloadChallenge.challengeId,
          "payment-invalid-payload-replay",
        )
      ).status,
    ).toBe(400);

    const originChallenge = await createChallenge(paymentMandateId, "phase6-payment-origin");
    presentedChallenge = originChallenge.options.challenge;
    const wrongOrigin = await activateMandate(
      paymentMandateId,
      originChallenge.challengeId,
      "payment-origin-wrong",
      SECOND_ORIGIN,
    );
    expect(wrongOrigin.status).toBe(400);
    expect(
      (await activateMandate(paymentMandateId, originChallenge.challengeId, "payment-origin-valid"))
        .status,
    ).toBe(200);

    const expiredChallenge = await createChallenge(checkoutMandateId, "checkout-expired");
    presentedChallenge = expiredChallenge.options.challenge;
    currentTime = new Date(currentTime.getTime() + MANDATE_APPROVAL_CHALLENGE_TTL_MS + 1);
    expect(
      (
        await activateMandate(
          checkoutMandateId,
          expiredChallenge.challengeId,
          "checkout-expired-activate",
        )
      ).status,
    ).toBe(400);
    const validCheckoutChallenge = await createChallenge(
      checkoutMandateId,
      "phase6-checkout-valid",
    );
    presentedChallenge = validCheckoutChallenge.options.challenge;
    expect(
      (
        await activateMandate(
          checkoutMandateId,
          validCheckoutChallenge.challengeId,
          "checkout-valid-activate",
        )
      ).status,
    ).toBe(200);

    const active = await apiRequest(`/api/v1/mandates/${paymentMandateId}`, { method: "GET" });
    await expect(active.json()).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("allows ₹299, keeps ₹449 pending until exact step-up, and blocks ₹799 without an order hook", async () => {
    const allowed = await proposeService("market_snapshot", 29_900, "phase6-transaction-299");
    expect(allowed.response.status, JSON.stringify(allowed.body)).toBe(201);
    expect(allowed.body).toMatchObject({
      decision: { decision: "ALLOW" },
      orderCreationInvoked: false,
      state: "BUDGET_RESERVED",
    });
    allowedTransactionId = required(allowed.body.transactionId as string | undefined);

    const reviewed = await proposeService(
      "detailed_competitor_dossier",
      44_900,
      "phase6-transaction-449",
    );
    expect(reviewed.body).toMatchObject({
      decision: { decision: "APPROVAL_REQUIRED" },
      orderCreationInvoked: false,
      state: "APPROVAL_REQUIRED",
    });
    const transactionId = required(reviewed.body.transactionId as string | undefined);
    reviewedTransactionId = transactionId;
    const expired = await createTransactionChallenge(transactionId, "transaction-expired");
    presentedChallenge = expired.options.challenge;
    currentTime = new Date(currentTime.getTime() + TRANSACTION_APPROVAL_TTL_MS + 1);
    expect(
      (await approveTransaction(transactionId, expired.challengeId, "transaction-expired-approve"))
        .status,
    ).toBe(400);

    const differentPayload = await createTransactionChallenge(
      transactionId,
      "transaction-different-payload",
    );
    presentedChallenge = bytesToBase64Url(new Uint8Array(32).fill(9));
    expect(
      (
        await approveTransaction(
          transactionId,
          differentPayload.challengeId,
          "transaction-different-payload-approve",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await approveTransaction(
          transactionId,
          differentPayload.challengeId,
          "transaction-different-payload-replay",
        )
      ).status,
    ).toBe(400);

    const valid = await createTransactionChallenge(transactionId, "transaction-valid");
    presentedChallenge = valid.options.challenge;
    expect(
      (
        await approveTransaction(
          transactionId,
          valid.challengeId,
          "transaction-wrong-origin",
          SECOND_ORIGIN,
        )
      ).status,
    ).toBe(400);
    expect(
      (await approveTransaction(transactionId, valid.challengeId, "transaction-valid-approve"))
        .status,
    ).toBe(200);
    const approved = await apiRequest(`/api/v1/transactions/${transactionId}`, { method: "GET" });
    await expect(approved.json()).resolves.toMatchObject({ state: "BUDGET_RESERVED" });

    const blocked = await proposeService(
      "enterprise_intelligence_pack",
      79_900,
      "phase6-transaction-799",
    );
    expect(blocked.body).toMatchObject({
      decision: {
        decision: "BLOCK",
        reasons: expect.arrayContaining([expect.objectContaining({ code: "AMOUNT_EXCEEDED" })]),
      },
      orderCreationInvoked: false,
      state: "BLOCKED",
    });
    blockedTransactionId = required(blocked.body.transactionId as string | undefined);
    expect(orderCreationHook).not.toHaveBeenCalled();
  });

  it("creates only reserved payment orders, commits on signed captured evidence, and bounds retries", async () => {
    const created = await mutation(
      `/api/v1/transactions/${allowedTransactionId}/checkout`,
      "phase7-create-order-0001",
      {},
    );
    expect(created.status, await created.clone().text()).toBe(201);
    const createdBody = merchantPaymentOrderResponseSchema.parse(await created.json());
    expect(createdBody).toMatchObject({ attempt_number: 1, state: "PAYMENT_PENDING" });
    expect(merchantPaymentOrderHook).toHaveBeenCalledTimes(1);
    expect(orderCreationHook).toHaveBeenCalledWith(allowedTransactionId);

    const captured = await sendMerchantPaymentEvent({
      attemptNumber: 1,
      eventType: "PAYMENT_CAPTURED",
      fulfilmentEligible: true,
      orderStatus: "paid",
      paymentStatus: "captured",
      providerOrderId: createdBody.provider_order_id,
      providerPaymentId: "pay_phase7captured0001",
      transactionId: allowedTransactionId,
    });
    expect(captured.status, await captured.clone().text()).toBe(204);
    expect(
      await database
        .prepare("SELECT state FROM transactions WHERE id = ?")
        .bind(allowedTransactionId)
        .first(),
    ).toEqual({ state: "ENTITLEMENT_ISSUED" });
    const issuedEntitlement = await database
      .prepare(
        `SELECT e.status, length(e.token_hash) AS token_hash_length, d.encrypted_token
         FROM entitlements e JOIN entitlement_deliveries d ON d.entitlement_id = e.id
         WHERE e.transaction_id = ?`,
      )
      .bind(allowedTransactionId)
      .first<{ encrypted_token: string; status: string; token_hash_length: number }>();
    expect(issuedEntitlement).toMatchObject({ status: "ISSUED", token_hash_length: 64 });
    expect(issuedEntitlement?.encrypted_token).not.toContain("eyJ");
    const entitlement = await database
      .prepare("SELECT id FROM entitlements WHERE transaction_id = ?")
      .bind(allowedTransactionId)
      .first<{ id: string }>();
    if (entitlement === null) throw new Error("Paid entitlement was not persisted");
    const result = marketSnapshotResultSchema.parse({
      data_source: "DETERMINISTIC_DEMO_FIXTURE",
      executive_summary: "A deterministic test result that contains no live market claims.",
      findings: [
        {
          confidence: "HIGH",
          evidence: "The result is bound to the exact paid transaction and entitlement.",
          finding: "Payment binding verified",
        },
        {
          confidence: "MEDIUM",
          evidence: "This test fixture intentionally contains no external market research.",
          finding: "Production data source required",
        },
      ],
      generated_at: currentTime.toISOString(),
      market: "India",
      schema_version: "signalworks.market_snapshot.1",
      service_id: "market_snapshot",
      subject_company: "Acme",
    });
    const outputHash = await sha256CanonicalJsonHex(result);
    const deliveryReceiptId = `dlr_${createUlid(currentTime.getTime() + 30)}`;
    const receipt = deliveryReceiptSchema.parse({
      agent_id: AGENT_ID,
      audience: API_AUDIENCE,
      completed_at: currentTime.toISOString(),
      delivery_receipt_id: deliveryReceiptId,
      entitlement_id: entitlement.id,
      expires_at: new Date(currentTime.getTime() + 24 * 60 * 60_000).toISOString(),
      fulfilment_id: `ful_${createUlid(currentTime.getTime() + 31)}`,
      issued_at: currentTime.toISOString(),
      issuer: "https://merchant-demo.example.com/",
      jti: deliveryReceiptId,
      merchant_id: MERCHANT_ID,
      output_hash: outputHash,
      schema_version: "mindpay.delivery_receipt.1",
      service_id: "market_snapshot",
      status: "COMPLETED",
      transaction_id: allowedTransactionId,
    });
    const publication = signedDeliveryPublicationSchema.parse({
      receipt,
      result,
      signature: await signCanonicalJsonEs256(
        receipt,
        {
          kid: "signalworks.event.phase7",
          privateKey: merchantKeyPair.privateKey,
          validFromEpochMs: FIXED_NOW.getTime(),
        },
        currentTime.getTime(),
      ),
    });
    const delivered = await postDeliveryPublication(publication);
    expect(delivered.status, await delivered.clone().text()).toBe(204);
    expect((await postDeliveryPublication(publication)).status).toBe(204);
    expect(
      await database
        .prepare("SELECT state FROM transactions WHERE id = ?")
        .bind(allowedTransactionId)
        .first(),
    ).toEqual({ state: "FULFILLED" });
    expect(
      await database
        .prepare("SELECT output_hash FROM fulfilment_results WHERE transaction_id = ?")
        .bind(allowedTransactionId)
        .first(),
    ).toEqual({ output_hash: outputHash });
    expect(
      await database
        .prepare("SELECT spent_subunits, reserved_subunits FROM mandates WHERE id = ?")
        .bind(paymentMandateId)
        .first(),
    ).toEqual({ reserved_subunits: 44_900, spent_subunits: 29_900 });
    expect(
      (
        await sendMerchantPaymentEvent({
          attemptNumber: 1,
          eventType: "PAYMENT_CAPTURED",
          fulfilmentEligible: true,
          orderStatus: "paid",
          paymentStatus: "captured",
          providerOrderId: createdBody.provider_order_id,
          providerPaymentId: "pay_phase7captured0001",
          transactionId: allowedTransactionId,
        })
      ).status,
    ).toBe(204);

    failedTransactionId = reviewedTransactionId;
    const firstAttempt = await mutation(
      `/api/v1/transactions/${failedTransactionId}/checkout`,
      "phase7-failed-order-1",
      {},
    );
    const firstAttemptBody = merchantPaymentOrderResponseSchema.parse(await firstAttempt.json());
    expect(
      (
        await sendMerchantPaymentEvent({
          attemptNumber: 1,
          eventType: "PAYMENT_FAILED",
          fulfilmentEligible: false,
          orderStatus: "attempted",
          paymentStatus: "failed",
          providerOrderId: firstAttemptBody.provider_order_id,
          providerPaymentId: "pay_phase7failed000001",
          transactionId: failedTransactionId,
        })
      ).status,
    ).toBe(204);
    const retry = await mutation(
      `/api/v1/transactions/${failedTransactionId}/retry`,
      "phase7-retry-reserve-1",
      {},
    );
    expect(retry.status, await retry.clone().text()).toBe(200);
    const secondAttempt = await mutation(
      `/api/v1/transactions/${failedTransactionId}/checkout`,
      "phase7-failed-order-2",
      {},
    );
    const secondAttemptBody = merchantPaymentOrderResponseSchema.parse(await secondAttempt.json());
    expect(secondAttemptBody.attempt_number).toBe(2);
    expect(secondAttemptBody.provider_order_id).not.toBe(firstAttemptBody.provider_order_id);
    expect(
      (
        await sendMerchantPaymentEvent({
          attemptNumber: 2,
          eventType: "PAYMENT_FAILED",
          fulfilmentEligible: false,
          orderStatus: "attempted",
          paymentStatus: "failed",
          providerOrderId: secondAttemptBody.provider_order_id,
          providerPaymentId: "pay_phase7failed000002",
          transactionId: failedTransactionId,
        })
      ).status,
    ).toBe(204);
    const exhausted = await mutation(
      `/api/v1/transactions/${failedTransactionId}/retry`,
      "phase7-retry-exhausted",
      {},
    );
    expect(exhausted.status).toBe(409);
    await expect(exhausted.json()).resolves.toMatchObject({
      error: { code: "PAYMENT_ATTEMPTS_EXHAUSTED" },
    });
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM entitlements WHERE transaction_id = ?")
        .bind(failedTransactionId)
        .first(),
    ).toEqual({ count: 0 });
  });

  it("assembles portable evidence for successful, blocked, and exhausted-payment outcomes", async () => {
    for (const [transactionId, expectedState] of [
      [allowedTransactionId, "EVIDENCE_READY"],
      [blockedTransactionId, "BLOCKED"],
      [failedTransactionId, "PAYMENT_FAILED"],
    ] as const) {
      const assembled = await apiRequest(`/api/v1/transactions/${transactionId}/evidence`, {
        method: "GET",
      });
      expect(assembled.status, await assembled.clone().text()).toBe(200);
      const evidence = publicEvidenceBundleSchema.parse(await assembled.json());
      expect(evidence.verified).toBe(true);
      expect(evidence.bundle?.transaction.state).toBe(expectedState);
      expect(evidence.proofResults).toHaveLength(9);
      expect(evidence.proofResults.some((proof) => proof.status === "FAIL")).toBe(false);
      expect(evidence.signature).not.toBeNull();
      expect(evidence.auditSignatures).toHaveLength(evidence.bundle?.audit.event_count ?? 0);

      const portable = await app.request(
        `${AUTH_URL}/api/v1/evidence/${evidence.evidenceId}`,
        { headers: { origin: FRONTEND_ORIGIN }, method: "GET" },
        bindings,
      );
      expect(portable.status).toBe(200);
      await expect(portable.json()).resolves.toMatchObject({
        bundle: evidence.bundle,
        bundleHash: evidence.bundleHash,
        evidenceId: evidence.evidenceId,
        proofResults: evidence.proofResults,
        signingKid: evidence.signingKid,
        verified: true,
      });
    }
  });

  it("revokes before reservation and leaves the budget counters unchanged", async () => {
    const before = await mandateBudget();
    const orderCallsBefore = orderCreationHook.mock.calls.length;
    const revoked = await mutation(
      `/api/v1/mandates/${paymentMandateId}/revoke`,
      "phase6-mandate-revoke",
      {},
    );
    expect(revoked.status, await revoked.clone().text()).toBe(200);
    await expect(revoked.json()).resolves.toMatchObject({ status: "REVOKED" });

    const blocked = await proposeService("market_snapshot", 29_900, "phase6-revoked-proposal");
    expect(blocked.body).toMatchObject({
      decision: {
        decision: "BLOCK",
        reasons: expect.arrayContaining([expect.objectContaining({ code: "MANDATE_NOT_ACTIVE" })]),
      },
      reservationId: null,
      state: "BLOCKED",
    });
    expect(await mandateBudget()).toEqual(before);
    expect(orderCreationHook).toHaveBeenCalledTimes(orderCallsBefore);
  });

  async function seedPhaseSixPrerequisites() {
    const now = FIXED_NOW.getTime();
    const encryptionKey = await importAgentKeyEncryptionKey(TEST_KEY_SECRET);
    const agentSigning = await createAgentEncryptedSigningKey({
      agentId: AGENT_ID,
      encryptionKey,
      kid: "agent.phase6.signing.1",
    });
    merchantKeyPair = await generateEs256KeyPair(true);
    const merchantPublicJwk = await exportEs256PublicJwk(merchantKeyPair.publicKey);
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, 'Phase 6 Workspace', 'phase-6-workspace', 'ACTIVE', ?, ?)",
        )
        .bind(ORGANIZATION_ID, now, now),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'OWNER', ?)",
        )
        .bind(ORGANIZATION_ID, owner.id, now),
      database
        .prepare(
          "INSERT INTO passkey_credentials (id, user_id, name, credential_id, public_key, webauthn_user_id, counter, device_type, backed_up, transports, aaguid, created_at, updated_at) VALUES (?, ?, 'Phase 6 passkey', 'credential_phase_06', ?, 'phase6-webauthn-user', 0, 'singleDevice', 0, '[\"internal\"]', '00000000-0000-0000-0000-000000000000', ?, ?)",
        )
        .bind(PASSKEY_ID, owner.id, bytesToBase64Url(new Uint8Array([1, 2, 3, 4])), now, now),
      database
        .prepare(
          "INSERT INTO agents (id, organization_id, name, slug, description, status, current_version_id, created_by, created_at, updated_at) VALUES (?, ?, 'Phase 6 Agent', 'phase-6-agent', 'Procures verified research.', 'ACTIVE', NULL, ?, ?, ?)",
        )
        .bind(AGENT_ID, ORGANIZATION_ID, owner.id, now, now),
      database
        .prepare(
          "INSERT INTO agent_versions (id, agent_id, version, model_provider, model_name, system_policy, system_policy_hash, specialization, configuration_json, verification_status, published_at, created_at) VALUES (?, ?, '1.0.0', 'openai', 'gpt_5', 'Use only deterministic MindPay commerce tools.', ?, 'Verified procurement', '{\"maxOutputTokens\":2048,\"temperature\":0.2}', 'PASSED', NULL, ?)",
        )
        .bind(AGENT_VERSION_ID, AGENT_ID, "a".repeat(64), now),
      database
        .prepare(
          "INSERT INTO agent_keys (id, agent_id, kid, public_jwk, encrypted_private_jwk, valid_from, revoked_at, created_at) VALUES ('aky_01JGFJH900H8M2APVYVDZ4R6P6', ?, ?, ?, ?, ?, NULL, ?)",
        )
        .bind(
          AGENT_ID,
          agentSigning.kid,
          JSON.stringify(agentSigning.publicJwk),
          JSON.stringify(agentSigning.encryptedPrivateJwk),
          now,
          now,
        ),
      database
        .prepare(
          "INSERT INTO merchants (id, organization_id, name, slug, legal_name, domain, status, verification_status, risk_tier, verification_tier, last_admin_event_id, last_verification_at, verification_expires_at, revision, created_at, updated_at) VALUES (?, ?, 'SignalWorks', 'signalworks-phase6', 'SignalWorks Test Private Limited', 'merchant-demo.example.com', 'ACTIVE', 'APPROVED', 'LOW', 'TEST_VERIFIED', 'adm_phase6_seed', ?, ?, 1, ?, ?)",
        )
        .bind(MERCHANT_ID, ORGANIZATION_ID, now, now + 86_400_000, now, now),
      database
        .prepare(
          "INSERT INTO merchant_keys (id, merchant_id, kid, purpose, public_jwk, fingerprint, valid_from, valid_until, revoked_at, created_at) VALUES ('mky_phase6_checkout', ?, 'signalworks.checkout.phase6', 'checkout', ?, ?, ?, NULL, NULL, ?)",
        )
        .bind(MERCHANT_ID, JSON.stringify(merchantPublicJwk), "b".repeat(64), now, now),
      database
        .prepare(
          "INSERT INTO merchant_keys (id, merchant_id, kid, purpose, public_jwk, fingerprint, valid_from, valid_until, revoked_at, created_at) VALUES ('mky_phase7_event', ?, 'signalworks.event.phase7', 'event', ?, ?, ?, NULL, NULL, ?)",
        )
        .bind(MERCHANT_ID, JSON.stringify(merchantPublicJwk), "e".repeat(64), now, now),
      database
        .prepare(
          "INSERT INTO merchant_manifests (id, merchant_id, schema_version, manifest_json, manifest_hash, signature, verified_at, expires_at, created_at) VALUES ('mmf_phase6', ?, '1', '{}', ?, '{}', ?, ?, ?)",
        )
        .bind(MERCHANT_ID, "f".repeat(64), now, now + 86_400_000, now),
      database
        .prepare(
          "INSERT INTO merchant_catalogs (id, merchant_id, version, catalog_hash, catalog_json, signature, verified_at, expires_at, created_at) VALUES ('mct_phase6', ?, '1.0.0', ?, '{}', '{}', ?, ?, ?)",
        )
        .bind(MERCHANT_ID, "c".repeat(64), now, now + 86_400_000, now),
    ]);
    await database
      .prepare(
        "UPDATE merchants SET current_manifest_id = 'mmf_phase6', current_catalog_id = 'mct_phase6', updated_at = ? WHERE id = ?",
      )
      .bind(now, MERCHANT_ID)
      .run();
    await database
      .prepare("UPDATE agent_versions SET published_at = ? WHERE id = ?")
      .bind(now, AGENT_VERSION_ID)
      .run();
    await database
      .prepare("UPDATE agents SET current_version_id = ?, updated_at = ? WHERE id = ?")
      .bind(AGENT_VERSION_ID, now, AGENT_ID)
      .run();
    for (const [index, service] of [
      ["market_snapshot", 29_900],
      ["detailed_competitor_dossier", 44_900],
      ["enterprise_intelligence_pack", 79_900],
    ] as const) {
      const serviceId = `svc_phase6_${index}`;
      const versionId = `svv_phase6_${index}_1`;
      await database.batch([
        database
          .prepare(
            "INSERT INTO services (id, merchant_id, external_id, name, description, category, status, current_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'Verified research service for Phase 6.', 'business_research', 'ACTIVE', NULL, ?, ?)",
          )
          .bind(serviceId, MERCHANT_ID, index, index.replaceAll("_", " "), now, now),
        database
          .prepare(
            "INSERT INTO service_versions (id, service_id, version, price_subunits, currency, availability, fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url, terms_url, catalog_hash, content_hash, published_at, verified_at) VALUES (?, ?, '1.0.0', ?, 'INR', 'available', 'mcp', 'signalworks.research.v1', 60, 'https://merchant-demo.example.com/privacy', 'https://merchant-demo.example.com/terms', ?, ?, ?, ?)",
          )
          .bind(versionId, serviceId, service, "c".repeat(64), "d".repeat(64), now, now),
      ]);
      await database
        .prepare("UPDATE services SET current_version_id = ?, updated_at = ? WHERE id = ?")
        .bind(versionId, now, serviceId)
        .run();
    }
  }

  function defaultMandateRequest() {
    return {
      agentId: AGENT_ID,
      allowedCategories: ["business_research"],
      allowedMerchants: [MERCHANT_ID],
      allowedRails: ["razorpay:test"],
      allowedServices: [
        "market_snapshot",
        "detailed_competitor_dossier",
        "enterprise_intelligence_pack",
      ],
      approvalThresholdSubunits: 35_000,
      currency: "INR",
      expiresAt: new Date(FIXED_NOW.getTime() + 86_400_000).toISOString(),
      maxAttemptsPerTransaction: 2,
      maxLineItems: 1,
      maxQuantityPerItem: 1,
      maxTransactionSubunits: 50_000,
      maxTransactions: 3,
      maxUnitPriceSubunits: 50_000,
      passkeyId: PASSKEY_ID,
      totalBudgetSubunits: 100_000,
    };
  }

  async function createChallenge(mandateId: string, key: string) {
    const response = await mutation(`/api/v1/mandates/${mandateId}/challenges`, key, {
      credentialId: PASSKEY_ID,
    });
    expect(response.status, await response.clone().text()).toBe(201);
    return (await response.json()) as {
      challengeId: string;
      options: { challenge: string };
    };
  }

  function activateMandate(
    mandateId: string,
    challengeId: string,
    key: string,
    origin = FRONTEND_ORIGIN,
  ) {
    return mutation(
      `/api/v1/mandates/${mandateId}/activate`,
      key,
      { challengeId, response: { id: "credential_phase_06", type: "public-key" } },
      origin,
    );
  }

  async function proposeService(serviceId: string, priceSubunits: number, key: string) {
    const checkout = merchantCheckoutSchema.parse({
      audience: API_AUDIENCE,
      checkout_session_id: `checkout_${createUlid(currentTime.getTime() + priceSubunits)}`,
      currency: "INR",
      expires_at: new Date(currentTime.getTime() + 30 * 60_000).toISOString(),
      fulfilment_terms: {
        delivery_type: "mcp",
        policy_url: "https://merchant-demo.example.com/terms",
        summary: "Issue a scoped entitlement for the purchased research service.",
      },
      issued_at: currentTime.toISOString(),
      issuer: "https://merchant-demo.example.com/",
      kid: "signalworks.checkout.phase6",
      line_items: [
        {
          line_total_subunits: priceSubunits,
          quantity: 1,
          service_id: serviceId,
          service_version: "1.0.0",
          unit_price_subunits: priceSubunits,
        },
      ],
      merchant_domain: "merchant-demo.example.com",
      merchant_id: MERCHANT_ID,
      nonce: `checkout_nonce_${createUlid(currentTime.getTime() + priceSubunits)}`,
      schema_version: "1",
      total_subunits: priceSubunits,
    });
    const signature = await signCanonicalJsonEs256(
      checkout,
      {
        kid: checkout.kid,
        privateKey: merchantKeyPair.privateKey,
        validFromEpochMs: FIXED_NOW.getTime(),
      },
      currentTime.getTime(),
    );
    const response = await mutation(`/api/v1/transactions`, key, {
      checkout,
      checkoutMandateId,
      checkoutSignature: signature,
      offerHash: await sha256CanonicalJsonHex({ checkout, offer: serviceId }),
      offerId: `offer_${createUlid(currentTime.getTime() + priceSubunits)}`,
      paymentMandateId,
      paymentRail: "razorpay:test",
    });
    return { body: (await response.json()) as Record<string, unknown>, response };
  }

  async function createTransactionChallenge(transactionId: string, key: string) {
    const response = await mutation(`/api/v1/transactions/${transactionId}/challenges`, key, {
      credentialId: PASSKEY_ID,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as {
      challengeId: string;
      options: { challenge: string };
      payloadHash: string;
    };
  }

  function approveTransaction(
    transactionId: string,
    challengeId: string,
    key: string,
    origin = FRONTEND_ORIGIN,
  ) {
    return mutation(
      `/api/v1/transactions/${transactionId}/approve`,
      key,
      {
        challengeId,
        response: { id: "credential_phase_06", type: "public-key" },
      },
      origin,
    );
  }

  async function mandateBudget() {
    const row = await database
      .prepare("SELECT spent_subunits, reserved_subunits FROM mandates WHERE id = ?")
      .bind(paymentMandateId)
      .first<{ reserved_subunits: number; spent_subunits: number }>();
    if (row === null) throw new Error("Payment mandate disappeared");
    return row;
  }

  async function sendMerchantPaymentEvent(input: {
    readonly attemptNumber: number;
    readonly eventType: "PAYMENT_CAPTURED" | "PAYMENT_FAILED";
    readonly fulfilmentEligible: boolean;
    readonly orderStatus: "attempted" | "paid";
    readonly paymentStatus: "captured" | "failed";
    readonly providerOrderId: string;
    readonly providerPaymentId: string;
    readonly transactionId: string;
  }) {
    const publicationKey = `${input.transactionId}:${input.attemptNumber}:${input.eventType}`;
    const existingPublication = paymentPublications.get(publicationKey);
    if (existingPublication !== undefined) {
      return postMerchantPaymentPublication(existingPublication);
    }
    const transaction = await database
      .prepare("SELECT amount_subunits, policy_decision_json FROM transactions WHERE id = ?")
      .bind(input.transactionId)
      .first<{ amount_subunits: number; policy_decision_json: string }>();
    if (transaction === null) throw new Error("Payment event transaction is missing");
    const decision = JSON.parse(transaction.policy_decision_json) as {
      checkoutHash: string;
      closedPayment: { mandate: { checkout_session_id: string } };
    };
    const event = merchantPaymentEventSchema.parse({
      amount_subunits: transaction.amount_subunits,
      attempt_number: input.attemptNumber,
      audience: API_AUDIENCE,
      checkout_hash: decision.checkoutHash,
      checkout_session_id: decision.closedPayment.mandate.checkout_session_id,
      currency: "INR",
      event_id: `evt_${createUlid(currentTime.getTime() + input.attemptNumber + (input.eventType === "PAYMENT_FAILED" ? 10 : 0))}`,
      event_type: input.eventType,
      expires_at: new Date(currentTime.getTime() + 10 * 60_000).toISOString(),
      fulfilment_eligible: input.fulfilmentEligible,
      issued_at: currentTime.toISOString(),
      issuer: "https://merchant-demo.example.com/",
      kid: "signalworks.event.phase7",
      merchant_id: MERCHANT_ID,
      nonce: `phase7:${input.transactionId}:${input.attemptNumber}:${input.eventType}`,
      occurred_at: currentTime.toISOString(),
      order_status: input.orderStatus,
      payment_status: input.paymentStatus,
      provider_order_id: input.providerOrderId,
      provider_payment_id: input.providerPaymentId,
      schema_version: "mindpay.merchant.payment-event.1",
      transaction_id: input.transactionId,
    });
    const signature = await signCanonicalJsonEs256(
      event,
      {
        kid: event.kid,
        privateKey: merchantKeyPair.privateKey,
        validFromEpochMs: FIXED_NOW.getTime(),
      },
      currentTime.getTime(),
    );
    const storedEventKey = await database
      .prepare("SELECT public_jwk FROM merchant_keys WHERE merchant_id = ? AND kid = ?")
      .bind(MERCHANT_ID, event.kid)
      .first<{ public_jwk: string }>();
    if (storedEventKey === null) throw new Error("Payment event verification key is missing");
    const localVerification = await verifyCanonicalJsonEs256(
      event,
      signature,
      [
        {
          kid: event.kid,
          publicKey: await importEs256PublicJwk(JSON.parse(storedEventKey.public_jwk) as unknown),
          validFromEpochMs: FIXED_NOW.getTime(),
        },
      ],
      currentTime.getTime(),
    );
    if (!localVerification.valid) throw new Error("Payment event test signature is invalid");
    const publication = { event, signature };
    paymentPublications.set(publicationKey, publication);
    return postMerchantPaymentPublication(publication);
  }

  function postMerchantPaymentPublication(
    publication: Readonly<{ event: unknown; signature: unknown }>,
  ) {
    return app.request(
      `${AUTH_URL}/api/internal/v1/merchant-payment-events`,
      {
        body: JSON.stringify(publication),
        headers: {
          Authorization: `Bearer ${SIGNALWORKS_MACHINE_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      bindings,
    );
  }

  function postDeliveryPublication(publication: unknown) {
    return app.request(
      `${AUTH_URL}/api/internal/v1/merchant-delivery-receipts`,
      {
        body: JSON.stringify(publication),
        headers: {
          Authorization: `Bearer ${SIGNALWORKS_MACHINE_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      bindings,
    );
  }

  async function createAuthenticatedUser(email: string): Promise<TestUser> {
    expect(
      (
        await authRequest("sign-up/email", {
          body: JSON.stringify({ email, name: "Phase 6 Owner", password: TEST_PASSWORD }),
          method: "POST",
        })
      ).status,
    ).toBe(200);
    const signIn = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    const user = await database
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (cookie === undefined || user === null)
      throw new Error("Phase 6 authentication setup failed");
    return { cookie, id: user.id };
  }

  function authRequest(route: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", "203.0.113.66");
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      app.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  function apiRequest(path: string, init: RequestInit, origin = FRONTEND_ORIGIN) {
    const headers = new Headers(init.headers);
    headers.set("cookie", owner.cookie);
    headers.set("origin", origin);
    headers.set(ORGANIZATION_CONTEXT_HEADER, ORGANIZATION_ID);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    return Promise.resolve(app.request(`${AUTH_URL}${path}`, { ...init, headers }, bindings));
  }

  function mutation(path: string, key: string, body: unknown, origin = FRONTEND_ORIGIN) {
    return apiRequest(
      path,
      {
        body: JSON.stringify(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        method: "POST",
      },
      origin,
    );
  }
});

function required(value: string | undefined): string {
  if (value === undefined) throw new Error("Expected a Phase 6 identifier");
  return value;
}
