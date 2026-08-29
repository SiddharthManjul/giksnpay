import { describe, expect, it } from "vitest";
import {
  auditEventSchema,
  closedCheckoutMandateSchema,
  closedPaymentMandateSchema,
  entitlementSchema,
  evidenceBundleSchema,
  mandateSchema,
  merchantEventSchema,
  openCheckoutMandateSchema,
  openPaymentMandateSchema,
} from "./cross-party";
import {
  auditFinalEventFixture,
  auditRootEventFixture,
  closedCheckoutMandateFixture,
  closedPaymentMandateFixture,
  completedEvidenceBundleFixture,
  marketSnapshotEntitlementFixture,
  openCheckoutMandateFixture,
  openPaymentMandateFixture,
  signalWorksMerchantEventFixture,
} from "./fixtures/cross-party";

describe("reference cross-party fixtures", () => {
  it("accepts all four AP2-aligned MindPay mandate forms", () => {
    for (const mandate of [
      openCheckoutMandateFixture,
      openPaymentMandateFixture,
      closedCheckoutMandateFixture,
      closedPaymentMandateFixture,
    ]) {
      expect(mandateSchema.parse(mandate)).toEqual(mandate);
    }
  });

  it("accepts merchant, audit, entitlement, and evidence fixtures", () => {
    expect(merchantEventSchema.parse(signalWorksMerchantEventFixture)).toEqual(
      signalWorksMerchantEventFixture,
    );
    expect(auditEventSchema.parse(auditRootEventFixture)).toEqual(auditRootEventFixture);
    expect(auditEventSchema.parse(auditFinalEventFixture)).toEqual(auditFinalEventFixture);
    expect(entitlementSchema.parse(marketSnapshotEntitlementFixture)).toEqual(
      marketSnapshotEntitlementFixture,
    );
    expect(evidenceBundleSchema.parse(completedEvidenceBundleFixture)).toEqual(
      completedEvidenceBundleFixture,
    );
  });

  it("freezes contracts and security-relevant nested records", () => {
    expect(Object.isFrozen(openCheckoutMandateFixture)).toBe(true);
    expect(Object.isFrozen(openCheckoutMandateFixture.agent)).toBe(true);
    expect(Object.isFrozen(openCheckoutMandateFixture.allowed_services)).toBe(true);
    expect(Object.isFrozen(signalWorksMerchantEventFixture.payment)).toBe(true);
    expect(Object.isFrozen(auditRootEventFixture.redacted_payload)).toBe(true);
    expect(Object.isFrozen(completedEvidenceBundleFixture.audit.events)).toBe(true);
    expect(Object.isFrozen(completedEvidenceBundleFixture.audit.events[0])).toBe(true);
    expect(Object.isFrozen(completedEvidenceBundleFixture.user_mandate.proof)).toBe(true);
    const nestedAudit = auditEventSchema.parse({
      ...auditRootEventFixture,
      redacted_payload: { nested: { values: ["redacted"] } },
    });
    expect(Object.isFrozen(nestedAudit.redacted_payload.nested)).toBe(true);
    expect(
      Object.isFrozen(
        (nestedAudit.redacted_payload.nested as { readonly values: readonly string[] }).values,
      ),
    ).toBe(true);
  });
});

describe("signed-object proof bindings", () => {
  it.each([
    [openCheckoutMandateSchema, openCheckoutMandateFixture, "nonce"],
    [openPaymentMandateSchema, openPaymentMandateFixture, "nonce"],
    [closedCheckoutMandateSchema, closedCheckoutMandateFixture, "nonce"],
    [closedPaymentMandateSchema, closedPaymentMandateFixture, "nonce"],
    [merchantEventSchema, signalWorksMerchantEventFixture, "jti"],
    [auditEventSchema, auditRootEventFixture, "jti"],
    [entitlementSchema, marketSnapshotEntitlementFixture, "jti"],
    [evidenceBundleSchema, completedEvidenceBundleFixture, "jti"],
  ] as const)("requires common signed claims for %#", (schema, fixture, replayField) => {
    for (const field of ["issuer", "audience", "kid", "issued_at", "expires_at", replayField]) {
      const missing: Record<string, unknown> = { ...fixture };
      delete missing[field];
      expect(schema.safeParse(missing).success, field).toBe(false);
    }
  });

  it.each([
    [openPaymentMandateSchema, openPaymentMandateFixture],
    [merchantEventSchema, signalWorksMerchantEventFixture],
    [auditEventSchema, auditRootEventFixture],
    [entitlementSchema, marketSnapshotEntitlementFixture],
    [evidenceBundleSchema, completedEvidenceBundleFixture],
  ] as const)("rejects unknown signed fields for %#", (schema, fixture) => {
    expect(schema.safeParse({ ...fixture, unsigned_display_hint: "trusted" }).success).toBe(false);
  });

  it("rejects invalid principals, key IDs, hashes, and validity windows", () => {
    expect(
      openCheckoutMandateSchema.safeParse({
        ...openCheckoutMandateFixture,
        issuer: "http://mindpay.example/users/demo",
      }).success,
    ).toBe(false);
    expect(
      openCheckoutMandateSchema.safeParse({ ...openCheckoutMandateFixture, kid: "bad key" })
        .success,
    ).toBe(false);
    expect(
      closedPaymentMandateSchema.safeParse({
        ...closedPaymentMandateFixture,
        checkout_hash: "A".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      entitlementSchema.safeParse({
        ...marketSnapshotEntitlementFixture,
        expires_at: marketSnapshotEntitlementFixture.issued_at,
      }).success,
    ).toBe(false);
    expect(
      entitlementSchema.safeParse({
        ...marketSnapshotEntitlementFixture,
        transaction_id: `ctx_${"Z".repeat(26)}`,
      }).success,
    ).toBe(false);
  });
});

describe("mandate constraints", () => {
  it("captures the default ₹500/₹1,000/₹350 policy in integer INR subunits", () => {
    expect(openPaymentMandateFixture).toMatchObject({
      approval_threshold_subunits: 35_000,
      currency: "INR",
      max_attempts_per_transaction: 2,
      max_transaction_subunits: 50_000,
      total_budget_subunits: 100_000,
    });
  });

  it("rejects duplicate allowlists and unsupported money fields", () => {
    expect(
      openCheckoutMandateSchema.safeParse({
        ...openCheckoutMandateFixture,
        allowed_services: ["market_snapshot", "market_snapshot"],
      }).success,
    ).toBe(false);
    expect(
      openPaymentMandateSchema.safeParse({
        ...openPaymentMandateFixture,
        currency: "USD",
      }).success,
    ).toBe(false);
    expect(
      openPaymentMandateSchema.safeParse({
        ...openPaymentMandateFixture,
        max_transaction_subunits: 50_000.5,
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe threshold and budget relationships", () => {
    expect(
      openPaymentMandateSchema.safeParse({
        ...openPaymentMandateFixture,
        approval_threshold_subunits: 50_001,
      }).success,
    ).toBe(false);
    expect(
      openPaymentMandateSchema.safeParse({
        ...openPaymentMandateFixture,
        max_transaction_subunits: 100_001,
      }).success,
    ).toBe(false);
  });

  it("rejects closed mandates without exact open and checkout proof bindings", () => {
    const missingOpenHash: Record<string, unknown> = { ...closedCheckoutMandateFixture };
    delete missingOpenHash.open_checkout_mandate_hash;
    expect(closedCheckoutMandateSchema.safeParse(missingOpenHash).success).toBe(false);

    const missingCheckoutHash: Record<string, unknown> = { ...closedPaymentMandateFixture };
    delete missingCheckoutHash.checkout_hash;
    expect(closedPaymentMandateSchema.safeParse(missingCheckoutHash).success).toBe(false);
  });

  it("recalculates the closed checkout total", () => {
    expect(
      closedCheckoutMandateSchema.safeParse({
        ...closedCheckoutMandateFixture,
        total_subunits: closedCheckoutMandateFixture.total_subunits + 1,
      }).success,
    ).toBe(false);
  });
});

describe("merchant event reconciliation proof", () => {
  it("rejects inconsistent root and provider money", () => {
    expect(
      merchantEventSchema.safeParse({
        ...signalWorksMerchantEventFixture,
        payment: {
          ...signalWorksMerchantEventFixture.payment,
          amount_subunits: signalWorksMerchantEventFixture.amount_subunits + 1,
        },
      }).success,
    ).toBe(false);
  });

  it("requires capture and paid-order facts for reconciliation", () => {
    for (const field of ["captured", "order_paid"] as const) {
      expect(
        merchantEventSchema.safeParse({
          ...signalWorksMerchantEventFixture,
          payment: { ...signalWorksMerchantEventFixture.payment, [field]: false },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects browser callback proof as sole reconciliation authority", () => {
    expect(
      merchantEventSchema.safeParse({
        ...signalWorksMerchantEventFixture,
        payment: {
          ...signalWorksMerchantEventFixture.payment,
          verification_source: "CALLBACK",
        },
      }).success,
    ).toBe(false);
  });

  it("requires fulfilment receipts only for fulfilment completion", () => {
    expect(
      merchantEventSchema.safeParse({
        ...signalWorksMerchantEventFixture,
        delivery_receipt_hash: "a".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      merchantEventSchema.safeParse({
        ...signalWorksMerchantEventFixture,
        delivery_receipt_hash: undefined,
        event_type: "FULFILMENT_COMPLETED",
      }).success,
    ).toBe(false);
  });

  it("requires a checkout and provider evidence hash", () => {
    const eventWithoutCheckoutHash: Record<string, unknown> = {
      ...signalWorksMerchantEventFixture,
    };
    delete eventWithoutCheckoutHash.checkout_hash;
    expect(merchantEventSchema.safeParse(eventWithoutCheckoutHash).success).toBe(false);

    const paymentWithoutEvidence: Record<string, unknown> = {
      ...signalWorksMerchantEventFixture.payment,
    };
    delete paymentWithoutEvidence.evidence_hash;
    expect(
      merchantEventSchema.safeParse({
        ...signalWorksMerchantEventFixture,
        payment: paymentWithoutEvidence,
      }).success,
    ).toBe(false);
  });
});

describe("audit chain contract", () => {
  it("requires root and non-root previous-hash semantics", () => {
    expect(
      auditEventSchema.safeParse({
        ...auditRootEventFixture,
        previous_event_hash: "a".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      auditEventSchema.safeParse({ ...auditFinalEventFixture, previous_event_hash: null }).success,
    ).toBe(false);
  });

  it("binds the event hash timestamp to the signed issuance instant", () => {
    expect(
      auditEventSchema.safeParse({
        ...auditRootEventFixture,
        occurred_at: "2026-08-28T12:05:00.001Z",
      }).success,
    ).toBe(false);
  });

  it("requires both canonical payload and event hashes", () => {
    for (const field of ["payload_hash", "event_hash"] as const) {
      const missing: Record<string, unknown> = { ...auditRootEventFixture };
      delete missing[field];
      expect(auditEventSchema.safeParse(missing).success).toBe(false);
    }
  });
});

describe("one-time entitlement contract", () => {
  it("binds jti and subject to the exact entitlement and agent", () => {
    expect(
      entitlementSchema.safeParse({
        ...marketSnapshotEntitlementFixture,
        jti: "ent_01JGFJHD00H8M2APVYVDZ4R6AD",
      }).success,
    ).toBe(false);
    expect(
      entitlementSchema.safeParse({
        ...marketSnapshotEntitlementFixture,
        subject: "agt_01JGFJHE00H8M2APVYVDZ4R6AE",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate scopes and wrong currency", () => {
    expect(
      entitlementSchema.safeParse({
        ...marketSnapshotEntitlementFixture,
        scopes: ["service:redeem", "service:redeem"],
      }).success,
    ).toBe(false);
    expect(
      entitlementSchema.safeParse({ ...marketSnapshotEntitlementFixture, currency: "USD" }).success,
    ).toBe(false);
  });
});

describe("public evidence proof graph", () => {
  it("requires a WebAuthn proof bound to the exact mandate hash", () => {
    const proofWithoutBinding: Record<string, unknown> = {
      ...completedEvidenceBundleFixture.user_mandate.proof,
    };
    delete proofWithoutBinding.signed_payload_hash;
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        user_mandate: {
          ...completedEvidenceBundleFixture.user_mandate,
          proof: proofWithoutBinding,
        },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        user_mandate: {
          ...completedEvidenceBundleFixture.user_mandate,
          proof: {
            ...completedEvidenceBundleFixture.user_mandate.proof,
            signed_payload_hash: "f".repeat(64),
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects checkout or payment amounts inconsistent with the transaction", () => {
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        merchant: {
          ...completedEvidenceBundleFixture.merchant,
          checkout_amount_subunits: completedEvidenceBundleFixture.transaction.amount_subunits + 1,
        },
      }).success,
    ).toBe(false);
    expect(completedEvidenceBundleFixture.payment).not.toBeNull();
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        payment: {
          ...completedEvidenceBundleFixture.payment,
          amount_subunits: completedEvidenceBundleFixture.transaction.amount_subunits + 1,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects proof records bound to another transaction or checkout", () => {
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        fulfilment: {
          ...completedEvidenceBundleFixture.fulfilment,
          transaction_id: "ctx_01JGFJHF00H8M2APVYVDZ4R6AF",
        },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        merchant: {
          ...completedEvidenceBundleFixture.merchant,
          checkout_session_id: "checkout_01JGFJHG00H8M2APVYVDZ4R6AG",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects audit count, sequence, link, root, and final inconsistencies", () => {
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        audit: { ...completedEvidenceBundleFixture.audit, event_count: 3 },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        audit: {
          ...completedEvidenceBundleFixture.audit,
          events: [
            completedEvidenceBundleFixture.audit.events[0],
            {
              ...completedEvidenceBundleFixture.audit.events[1],
              jti: completedEvidenceBundleFixture.audit.events[0]?.jti,
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        audit: {
          ...completedEvidenceBundleFixture.audit,
          events: [
            completedEvidenceBundleFixture.audit.events[0],
            {
              ...completedEvidenceBundleFixture.audit.events[1],
              previous_event_hash: "f".repeat(64),
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        audit: { ...completedEvidenceBundleFixture.audit, final_event_hash: "f".repeat(64) },
      }).success,
    ).toBe(false);
  });

  it("requires payment and fulfilment proof for completed evidence", () => {
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        fulfilment: null,
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        payment: {
          ...completedEvidenceBundleFixture.payment,
          callback_signature_verified: false,
          verification_sources: ["SERVER_FETCH"],
          webhook_signature_verified: false,
        },
      }).success,
    ).toBe(true);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        payment: {
          ...completedEvidenceBundleFixture.payment,
          captured: false,
        },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        payment: {
          ...completedEvidenceBundleFixture.payment,
          verification_sources: ["CALLBACK"],
          webhook_signature_verified: false,
        },
      }).success,
    ).toBe(false);
    expect(
      evidenceBundleSchema.safeParse({
        ...completedEvidenceBundleFixture,
        policy: { ...completedEvidenceBundleFixture.policy, decision: "BLOCK" },
      }).success,
    ).toBe(false);
  });

  it("accepts a blocked proof graph only without payment or fulfilment", () => {
    const blocked = {
      ...completedEvidenceBundleFixture,
      fulfilment: null,
      payment: null,
      policy: { ...completedEvidenceBundleFixture.policy, decision: "BLOCK" },
      transaction: { ...completedEvidenceBundleFixture.transaction, state: "BLOCKED" },
    };
    expect(evidenceBundleSchema.safeParse(blocked).success).toBe(true);
    expect(
      evidenceBundleSchema.safeParse({
        ...blocked,
        payment: completedEvidenceBundleFixture.payment,
      }).success,
    ).toBe(false);
  });
});
