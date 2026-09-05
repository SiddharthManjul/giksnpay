import { buildSignedAuditEvent } from "@mindpay/audit";
import {
  completedEvidenceBundleFixture,
  evidenceBundleSchema,
  publicEvidenceBundleSchema,
  signedEvidenceBundleSchema,
} from "@mindpay/contracts";
import {
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importEs256PublicJwk,
  sha256CanonicalJsonHex,
  signCanonicalJsonEs256,
} from "@mindpay/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPortableEvidenceEnvelope } from "./evidence";

const NOW = new Date("2026-08-28T12:31:00.000Z");
const EXPIRES = new Date("2036-08-28T12:31:00.000Z");

let envelope: ReturnType<typeof signedEvidenceBundleSchema.parse>;
let verificationKeys: Parameters<typeof verifyPortableEvidenceEnvelope>[1];

beforeAll(async () => {
  const pair = await generateEs256KeyPair(true);
  const signingKey = {
    kid: "mindpay-platform-2026-01",
    privateKey: pair.privateKey,
    validFromEpochMs: NOW.getTime() - 60_000,
  };
  verificationKeys = [
    {
      kid: signingKey.kid,
      publicKey: await importEs256PublicJwk(await exportEs256PublicJwk(pair.publicKey)),
      validFromEpochMs: signingKey.validFromEpochMs,
    },
  ];
  const transactionId = completedEvidenceBundleFixture.transaction.transaction_id;
  const root = await buildSignedAuditEvent({
    actor: { id: "usr_01JGFJH000H8M2APVYVDZ4R6A0", type: "USER" },
    audience: "https://mindpay.example/",
    eventId: "evt_01JGFJHB00H8M2APVYVDZ4R6AB",
    eventType: "USER_INTENT_RECEIVED",
    expiresAt: EXPIRES,
    issuer: "https://api.mindpay.example/",
    occurredAt: new Date(NOW.getTime() - 1_000),
    payload: { amount_subunits: 29_900 },
    previousEventHash: null,
    sequence: 0,
    signingKey,
    transactionId,
  });
  const final = await buildSignedAuditEvent({
    actor: { id: "mindpay_gateway", type: "MINDPAY" },
    audience: "https://mindpay.example/",
    eventId: "evt_01JGFJHC00H8M2APVYVDZ4R6AC",
    eventType: "TRANSACTION_COMPLETED",
    expiresAt: EXPIRES,
    issuer: "https://api.mindpay.example/",
    occurredAt: NOW,
    payload: { amount_subunits: 29_900, currency: "INR" },
    previousEventHash: root.event.event_hash,
    sequence: 1,
    signingKey,
    transactionId,
  });
  const bundle = evidenceBundleSchema.parse({
    ...completedEvidenceBundleFixture,
    audit: {
      event_count: 2,
      events: [root.event, final.event],
      final_event_hash: final.event.event_hash,
      root_event_hash: root.event.event_hash,
    },
  });
  envelope = signedEvidenceBundleSchema.parse({
    auditSignatures: [
      { eventId: root.event.jti, signature: root.signature },
      { eventId: final.event.jti, signature: final.signature },
    ],
    bundle,
    bundleHash: await sha256CanonicalJsonHex(bundle),
    signature: await signCanonicalJsonEs256(bundle, signingKey, NOW.getTime()),
  });
});

describe("portable evidence verification", () => {
  it("accepts an intact portable envelope", async () => {
    const result = await verifyPortableEvidenceEnvelope(envelope, verificationKeys, NOW);
    expect(result.verified).toBe(true);
    expect(result.proofResults).toHaveLength(9);
    expect(result.proofResults.every((proof) => proof.status !== "FAIL")).toBe(true);
  });

  it("accepts the flat public download envelope without trusting its displayed verdict", async () => {
    const checked = await verifyPortableEvidenceEnvelope(envelope, verificationKeys, NOW);
    const publicDownload = publicEvidenceBundleSchema.parse({
      ...envelope,
      evidenceId: envelope.bundle.evidence_id,
      proofResults: checked.proofResults,
      signingKid: envelope.signature.kid,
      verified: true,
      verifiedAt: NOW.toISOString(),
    });
    const result = await verifyPortableEvidenceEnvelope(publicDownload, verificationKeys, NOW);
    expect(result.verified).toBe(true);
  });

  it("detects audit-event mutation independently", async () => {
    const first = envelope.bundle.audit.events[0];
    if (first === undefined) throw new Error("Fixture requires an audit root");
    const mutated = {
      ...envelope,
      bundle: {
        ...envelope.bundle,
        audit: {
          ...envelope.bundle.audit,
          events: [
            { ...first, redacted_payload: { amount_subunits: 79_900 } },
            ...envelope.bundle.audit.events.slice(1),
          ],
        },
      },
    };
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(proof(result, "AUDIT_CHAIN")).toBe("FAIL");
    expect(proof(result, "AUDIT_SIGNATURES")).toBe("FAIL");
  });

  it("detects merchant-checkout proof mutation", async () => {
    const mutated = {
      ...envelope,
      bundle: {
        ...envelope.bundle,
        merchant: { ...envelope.bundle.merchant, checkout_signature_verified: false },
      },
    };
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(result.verified).toBe(false);
    expect(proof(result, "MERCHANT_CHECKOUT")).toBe("FAIL");
  });

  it("detects delivery-receipt proof mutation", async () => {
    if (envelope.bundle.fulfilment === null) throw new Error("Fixture requires fulfilment");
    const mutated = {
      ...envelope,
      bundle: {
        ...envelope.bundle,
        fulfilment: {
          ...envelope.bundle.fulfilment,
          merchant_receipt_signature_verified: false,
        },
      },
    };
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(result.verified).toBe(false);
    expect(proof(result, "DELIVERY_RECEIPT")).toBe("FAIL");
  });

  it("detects bundle mutation through both hash and signature", async () => {
    const mutated = {
      ...envelope,
      bundle: {
        ...envelope.bundle,
        risk: {
          ...envelope.bundle.risk,
          reasons: [
            { code: "mutated_reason", severity: "HIGH" },
            ...envelope.bundle.risk.reasons.slice(1),
          ],
        },
      },
    };
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(proof(result, "BUNDLE_HASH")).toBe("FAIL");
    expect(proof(result, "BUNDLE_SIGNATURE")).toBe("FAIL");
  });

  it("fails schema and redaction when a forbidden field class is injected", async () => {
    const mutated = structuredClone(envelope) as unknown as Record<string, unknown>;
    const rawBundle = mutated.bundle;
    if (typeof rawBundle !== "object" || rawBundle === null)
      throw new Error("Fixture bundle missing");
    Object.assign(rawBundle, { prompt: "do not expose this" });
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(proof(result, "BUNDLE_SCHEMA")).toBe("FAIL");
    expect(proof(result, "PUBLIC_REDACTION")).toBe("FAIL");
  });

  it("rejects an unredacted credential nested inside an otherwise valid audit payload", async () => {
    const first = envelope.bundle.audit.events[0];
    if (first === undefined) throw new Error("Fixture requires an audit root");
    const mutated = {
      ...envelope,
      bundle: {
        ...envelope.bundle,
        audit: {
          ...envelope.bundle.audit,
          events: [
            { ...first, redacted_payload: { api_key: "credential-must-not-be-public" } },
            ...envelope.bundle.audit.events.slice(1),
          ],
        },
      },
    };
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(proof(result, "PUBLIC_REDACTION")).toBe("FAIL");
  });

  it("allows explicit redaction markers while other cryptographic checks remain independent", async () => {
    const first = envelope.bundle.audit.events[0];
    if (first === undefined) throw new Error("Fixture requires an audit root");
    const mutated = {
      ...envelope,
      bundle: {
        ...envelope.bundle,
        audit: {
          ...envelope.bundle.audit,
          events: [
            { ...first, redacted_payload: { api_key: "[REDACTED]" } },
            ...envelope.bundle.audit.events.slice(1),
          ],
        },
      },
    };
    const result = await verifyPortableEvidenceEnvelope(mutated, verificationKeys, NOW);
    expect(proof(result, "PUBLIC_REDACTION")).toBe("PASS");
    expect(proof(result, "AUDIT_SIGNATURES")).toBe("FAIL");
  });
});

function proof(
  result: Awaited<ReturnType<typeof verifyPortableEvidenceEnvelope>>,
  type: (typeof result.proofResults)[number]["type"],
) {
  return result.proofResults.find((entry) => entry.type === type)?.status;
}
