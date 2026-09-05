import {
  type SignedDeliveryPublication,
  entitlementJwtClaimsSchema,
  marketSnapshotResultSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import { signEntitlementJwt } from "@mindpay/mcp-tools";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redeemSignalWorksService, SignalWorksFulfilmentError } from "./fulfilment";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "./identity";
import type { MerchantBindings } from "./index";
import { seedSignalWorksMachineCredential } from "./machine-auth";
import { createSignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-09-04T10:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);
const MACHINE_TOKEN = "mindpay_test_machine_token_0000000001";
const CHECKOUT_HASH = "a".repeat(64);
const AGENT_ID = "agt_01JGFJH900H8M2APVYVDZ4R6AA";
const TRANSACTION_ID = "ctx_01JGFJH900H8M2APVYVDZ4R6AC";

describe("SignalWorks entitlement fulfilment", () => {
  let database: D1Database;
  let miniflare: Miniflare;
  let bindings: MerchantBindings;
  let entitlementKeyPair: CryptoKeyPair;
  let delivered: SignedDeliveryPublication[];

  beforeEach(async () => {
    ({ database, miniflare } = await createSignalWorksTestDatabase(
      `signalworks-fulfilment-${crypto.randomUUID()}`,
    ));
    await seedSignalWorksIdentity(
      database,
      await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET),
      NOW,
    );
    await seedSignalWorksMachineCredential(database, MACHINE_TOKEN, NOW);
    bindings = {
      DB: database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
      SIGNALWORKS_MACHINE_AUTH_TOKEN: MACHINE_TOKEN,
    };
    entitlementKeyPair = await crypto.subtle.generateKey(
      { hash: "SHA-256", name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    delivered = [];
  });

  afterEach(async () => miniflare.dispose());

  it("redeems a captured-and-paid entitlement exactly once under concurrent replay", async () => {
    await seedPayment(true, AGENT_ID, TRANSACTION_ID, "market_snapshot");
    const token = await entitlementToken({});
    const generateResult = vi.fn(async () => validMarketSnapshot());
    const dependencies = {
      deliverPublication: async (
        _bindings: MerchantBindings,
        publication: SignedDeliveryPublication,
      ) => {
        delivered.push(publication);
      },
      generateResult,
      now: () => NOW,
      readVerificationKeys: async () => [verificationKey()],
    };
    const attempts = await Promise.allSettled([
      redeemSignalWorksService(
        bindings,
        "market_snapshot",
        { company: "Acme", entitlementJwt: token, market: "India" },
        dependencies,
      ),
      redeemSignalWorksService(
        bindings,
        "market_snapshot",
        { company: "Acme", entitlementJwt: token, market: "India" },
        dependencies,
      ),
    ]);
    if (!attempts.some((result) => result.status === "fulfilled")) {
      throw new Error(
        attempts
          .map((result) =>
            result.status === "rejected" && result.reason instanceof Error
              ? result.reason.message
              : result.status,
          )
          .join(","),
      );
    }
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(generateResult).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.receipt.output_hash).toBe(
      await sha256CanonicalJsonHex(delivered[0]?.result),
    );
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM merchant_entitlement_redemptions")
        .first(),
    ).toMatchObject({ count: 1 });
    expect(await database.prepare("SELECT state FROM merchant_fulfilments").first()).toMatchObject({
      state: "COMPLETED",
    });
  });

  it("rejects unpaid and wrong-service entitlements before service execution", async () => {
    await seedPayment(false, AGENT_ID, TRANSACTION_ID, "market_snapshot");
    const token = await entitlementToken({});
    const generateResult = vi.fn(async () => validMarketSnapshot());
    const dependencies = {
      deliverPublication: vi.fn(),
      generateResult,
      now: () => NOW,
      readVerificationKeys: async () => [verificationKey()],
    };
    await expect(
      redeemSignalWorksService(
        bindings,
        "market_snapshot",
        { company: "Acme", entitlementJwt: token, market: "India" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    await expect(
      redeemSignalWorksService(
        bindings,
        "detailed_competitor_dossier",
        { company: "Acme", competitors: ["Beta"], entitlementJwt: token, market: "India" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_INVALID" });
    expect(generateResult).not.toHaveBeenCalled();
  });

  it("retries one invalid structured result, then fails without a receipt or success state", async () => {
    await seedPayment(true, AGENT_ID, TRANSACTION_ID, "market_snapshot");
    const token = await entitlementToken({});
    const generateResult = vi.fn(async () => ({ service_id: "wrong_service" }));
    const deliverPublication = vi.fn();
    await expect(
      redeemSignalWorksService(
        bindings,
        "market_snapshot",
        { company: "Acme", entitlementJwt: token, market: "India" },
        {
          deliverPublication,
          generateResult,
          now: () => NOW,
          readVerificationKeys: async () => [verificationKey()],
        },
      ),
    ).rejects.toEqual(new SignalWorksFulfilmentError("INVALID_SERVICE_OUTPUT"));
    expect(generateResult).toHaveBeenCalledTimes(2);
    expect(deliverPublication).not.toHaveBeenCalled();
    expect(
      await database.prepare("SELECT state, generation_attempts FROM merchant_fulfilments").first(),
    ).toMatchObject({ generation_attempts: 2, state: "FAILED" });
  });

  async function seedPayment(
    paid: boolean,
    agentId: string,
    transactionId: string,
    serviceId: string,
  ) {
    const checkoutId = `checkout_${createUlid(NOW.getTime())}`;
    await database
      .prepare(
        `INSERT INTO merchant_checkout_sessions
       (id, credential_id, status, revision, acp_state, acp_state_hash, acp_signature,
        merchant_checkout, merchant_checkout_signature, created_at, updated_at, expires_at)
       VALUES (?, 'machine_mindpay_gateway', 'ready_for_payment', 1, '{}', ?, '{}', '{}', '{}', ?, ?, ?)`,
      )
      .bind(checkoutId, "b".repeat(64), NOW.getTime(), NOW.getTime(), NOW.getTime() + 900_000)
      .run();
    await database
      .prepare(
        `INSERT INTO merchant_payment_orders
       (id, checkout_session_id, transaction_id, mandate_id, agent_id, service_id, attempt_number,
        receipt, provider_order_id, provider_payment_id, provider_refund_id, amount_subunits,
        currency, checkout_hash, closed_payment_mandate_hash, notes, status, order_status,
        payment_status, fulfilment_eligible, failure_code, provider_order_snapshot,
        provider_payment_snapshot, completed_at, retention_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, 29900, 'INR', ?, ?, '{}', ?, ?, ?, ?,
        NULL, NULL, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        `mpo_${createUlid(NOW.getTime() + 1)}`,
        checkoutId,
        transactionId,
        `mnd_${createUlid(NOW.getTime() + 2)}`,
        agentId,
        serviceId,
        `receipt_${paid ? "paid" : "unpaid"}`,
        "order_test_phase8",
        paid ? "pay_test_phase8" : null,
        CHECKOUT_HASH,
        "c".repeat(64),
        paid ? "CAPTURED" : "CREATED",
        paid ? "paid" : "created",
        paid ? "captured" : null,
        paid ? 1 : 0,
        paid ? NOW.getTime() : null,
        NOW.getTime() + 86_400_000,
        NOW.getTime(),
        NOW.getTime(),
      )
      .run();
  }

  async function entitlementToken(overrides: Readonly<Record<string, unknown>>) {
    const claims = entitlementJwtClaimsSchema.parse({
      agent_id: AGENT_ID,
      amount_subunits: 29_900,
      aud: "https://merchant-demo.example.com/",
      checkout_hash: CHECKOUT_HASH,
      currency: "INR",
      exp: Math.floor(NOW.getTime() / 1_000) + 300,
      iat: Math.floor(NOW.getTime() / 1_000),
      iss: "https://api.mindpay.example/",
      jti: `ent_${createUlid(NOW.getTime() + 4)}`,
      merchant_id: "merchant_signalworks",
      schema_version: "mindpay.entitlement.jwt.1",
      scopes: ["service:redeem"],
      service_id: "market_snapshot",
      sub: AGENT_ID,
      transaction_id: TRANSACTION_ID,
      ...overrides,
    });
    return signEntitlementJwt(claims, {
      kid: "mindpay.entitlement.2026-09",
      privateKey: entitlementKeyPair.privateKey,
    });
  }

  function verificationKey() {
    return {
      kid: "mindpay.entitlement.2026-09",
      publicKey: entitlementKeyPair.publicKey,
      validFromEpochMs: NOW.getTime() - 1,
    };
  }
});

function validMarketSnapshot() {
  return marketSnapshotResultSchema.parse({
    data_source: "DETERMINISTIC_DEMO_FIXTURE",
    executive_summary: "A deterministic test result that contains no live market claims.",
    findings: [
      {
        confidence: "HIGH",
        evidence: "The exact typed request crossed the fulfilment boundary.",
        finding: "Request binding verified",
      },
      {
        confidence: "MEDIUM",
        evidence: "This deterministic fixture intentionally contains no live market claims.",
        finding: "Production data source required",
      },
    ],
    generated_at: NOW.toISOString(),
    market: "India",
    schema_version: "signalworks.market_snapshot.1",
    service_id: "market_snapshot",
    subject_company: "Acme",
  });
}
