import { exportEs256PublicJwk, generateEs256KeyPair, importEs256PublicJwk } from "@mindpay/crypto";
import { describe, expect, it } from "vitest";
import { buildSignedAuditEvent, redactAuditPayload, verifySignedAuditChain } from "./index";

const NOW = new Date("2026-09-05T08:00:00.000Z");
const TRANSACTION_ID = "ctx_01JGFJH700H8M2APVYVDZ4R6A7";

describe("signed audit chains", () => {
  it("redacts secret classes while retaining hashes and exact financial facts", () => {
    expect(
      redactAuditPayload({
        amount_subunits: 29_900,
        nested: { authorization: "Bearer secret", challenge_hash: "a".repeat(64) },
        prompt: "private instruction",
      }),
    ).toEqual({
      amount_subunits: 29_900,
      nested: { authorization: "[REDACTED]", challenge_hash: "a".repeat(64) },
      prompt: "[REDACTED]",
    });
  });

  it("detects payload, link, event hash, and signature mutation", async () => {
    const pair = await generateEs256KeyPair(true);
    const signingKey = {
      kid: "mindpay.audit.2026-09",
      privateKey: pair.privateKey,
      validFromEpochMs: NOW.getTime(),
    };
    const first = await buildSignedAuditEvent({
      actor: { id: "usr_01JGFJH000H8M2APVYVDZ4R6A0", type: "USER" },
      audience: "https://mindpay.example/",
      eventType: "USER_INTENT_RECEIVED",
      expiresAt: new Date("2033-09-05T08:00:00.000Z"),
      issuer: "https://api.mindpay.example/",
      occurredAt: NOW,
      payload: { amount_subunits: 29_900 },
      previousEventHash: null,
      sequence: 0,
      signingKey,
      transactionId: TRANSACTION_ID,
    });
    const second = await buildSignedAuditEvent({
      actor: { id: "mindpay_gateway", type: "MINDPAY" },
      audience: "https://mindpay.example/",
      eventType: "POLICY_EVALUATED",
      expiresAt: new Date("2033-09-05T08:00:00.000Z"),
      issuer: "https://api.mindpay.example/",
      occurredAt: new Date(NOW.getTime() + 1),
      payload: { decision: "ALLOW" },
      previousEventHash: first.event.event_hash,
      sequence: 1,
      signingKey,
      transactionId: TRANSACTION_ID,
    });
    const publicKey = await importEs256PublicJwk(await exportEs256PublicJwk(pair.publicKey));
    const verificationKeys = [{ kid: signingKey.kid, publicKey, validFromEpochMs: NOW.getTime() }];
    await expect(
      verifySignedAuditChain([first, second], verificationKeys, NOW.getTime() + 1),
    ).resolves.toEqual({ failures: [], valid: true });

    const mutated = {
      ...second,
      event: { ...second.event, redacted_payload: { decision: "BLOCK" } },
    };
    const result = await verifySignedAuditChain(
      [first, mutated],
      verificationKeys,
      NOW.getTime() + 1,
    );
    expect(result.valid).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining(["EVENT_1_HASH_INVALID", "EVENT_1_SIGNATURE_INVALID"]),
    );
  });
});
