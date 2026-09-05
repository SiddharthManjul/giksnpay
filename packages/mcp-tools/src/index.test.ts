import { entitlementJwtClaimsSchema } from "@mindpay/contracts";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importEs256PublicJwk,
} from "@mindpay/crypto";
import { describe, expect, it } from "vitest";
import { signEntitlementJwt, verifyEntitlementJwt } from "./index";

const nowEpochMs = Date.parse("2026-09-04T10:00:00.000Z");
const claims = entitlementJwtClaimsSchema.parse({
  agent_id: "agt_01JGFJH900H8M2APVYVDZ4R6AA",
  amount_subunits: 29_900,
  aud: "https://merchant-demo.example.com/",
  checkout_hash: "a".repeat(64),
  currency: "INR",
  exp: Math.floor(nowEpochMs / 1_000) + 300,
  iat: Math.floor(nowEpochMs / 1_000),
  iss: "https://api.mindpay.example/",
  jti: "ent_01JGFJH900H8M2APVYVDZ4R6AB",
  merchant_id: "merchant_signalworks",
  schema_version: "mindpay.entitlement.jwt.1",
  scopes: ["service:redeem"],
  service_id: "market_snapshot",
  sub: "agt_01JGFJH900H8M2APVYVDZ4R6AA",
  transaction_id: "ctx_01JGFJH900H8M2APVYVDZ4R6AC",
});

describe("ES256 entitlement JWTs", () => {
  it("signs and verifies exact issuer, audience, agent, merchant, service, and transaction bindings", async () => {
    const pair = await generateEs256KeyPair(true);
    const token = await signEntitlementJwt(claims, {
      kid: "mindpay.entitlement.2026-09",
      privateKey: pair.privateKey,
    });
    const publicKey = await importEs256PublicJwk(await exportEs256PublicJwk(pair.publicKey));
    const result = await verifyEntitlementJwt(
      token,
      [{ kid: "mindpay.entitlement.2026-09", publicKey, validFromEpochMs: nowEpochMs - 1 }],
      {
        agentId: claims.agent_id,
        audience: claims.aud,
        issuer: claims.iss,
        merchantId: claims.merchant_id,
        nowEpochMs,
        serviceId: claims.service_id,
        transactionId: claims.transaction_id,
      },
    );
    expect(result).toMatchObject({ claims, valid: true });
  });

  it.each([
    ["audience", { audience: "https://wrong.example.com/" }],
    ["agent", { agentId: "agt_01JGFJH900H8M2APVYVDZ4R6AD" }],
    ["issuer", { issuer: "https://wrong.example.com/" }],
    ["merchant", { merchantId: "merchant_wrong" }],
    ["service", { serviceId: "detailed_competitor_dossier" }],
    ["transaction", { transactionId: "ctx_01JGFJH900H8M2APVYVDZ4R6AE" }],
  ])("rejects a wrong %s binding", async (_name, override) => {
    const pair = await generateEs256KeyPair(true);
    const token = await signEntitlementJwt(claims, { kid: "key-1", privateKey: pair.privateKey });
    const result = await verifyEntitlementJwt(
      token,
      [{ kid: "key-1", publicKey: pair.publicKey, validFromEpochMs: nowEpochMs - 1 }],
      {
        agentId: claims.agent_id,
        audience: claims.aud,
        issuer: claims.iss,
        merchantId: claims.merchant_id,
        nowEpochMs,
        serviceId: claims.service_id,
        transactionId: claims.transaction_id,
        ...override,
      },
    );
    expect(result).toEqual({ reason: "INVALID_BINDING", valid: false });
  });

  it("rejects expiry and a one-byte signature mutation", async () => {
    const pair = await generateEs256KeyPair(true);
    const token = await signEntitlementJwt(claims, { kid: "key-1", privateKey: pair.privateKey });
    const keys = [{ kid: "key-1", publicKey: pair.publicKey, validFromEpochMs: nowEpochMs - 1 }];
    const requirements = {
      audience: claims.aud,
      issuer: claims.iss,
      merchantId: claims.merchant_id,
      serviceId: claims.service_id,
    };
    await expect(
      verifyEntitlementJwt(token, keys, { ...requirements, nowEpochMs: nowEpochMs + 301_000 }),
    ).resolves.toEqual({ reason: "EXPIRED", valid: false });
    const segments = token.split(".");
    const signature = base64UrlToBytes(segments[2] ?? "");
    signature[0] = (signature[0] ?? 0) ^ 1;
    const mutated = `${segments[0]}.${segments[1]}.${bytesToBase64Url(signature)}`;
    await expect(
      verifyEntitlementJwt(mutated, keys, { ...requirements, nowEpochMs }),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
  });
});
