import { describe, expect, it } from "vitest";
import {
  deliveryReceiptSchema,
  entitlementJwtClaimsSchema,
  marketSnapshotResultSchema,
  signedDeliveryPublicationSchema,
} from "./fulfilment";

const NOW_SECONDS = Math.floor(Date.parse("2026-09-04T10:00:00.000Z") / 1_000);
const AGENT_ID = "agt_01JGFJH900H8M2APVYVDZ4R6AA";

describe("Phase 8 fulfilment contracts", () => {
  it("requires every JWT authority binding and exactly one redemption scope", () => {
    const claims = validClaims();
    expect(entitlementJwtClaimsSchema.safeParse(claims).success).toBe(true);
    expect(
      entitlementJwtClaimsSchema.safeParse({
        ...claims,
        scopes: ["service:redeem", "payment:execute"],
      }).success,
    ).toBe(false);
    expect(
      entitlementJwtClaimsSchema.safeParse({ ...claims, sub: "agt_01JGFJH900H8M2APVYVDZ4R6AB" })
        .success,
    ).toBe(false);
    const { merchant_id: _merchantId, ...missingMerchant } = claims;
    expect(entitlementJwtClaimsSchema.safeParse(missingMerchant).success).toBe(false);
  });

  it("rejects delivery output for a service other than the signed receipt service", () => {
    const result = validMarketSnapshot();
    const receipt = deliveryReceiptSchema.parse({
      agent_id: AGENT_ID,
      audience: "https://api.mindpay.example/",
      completed_at: "2026-09-04T10:01:00.000Z",
      delivery_receipt_id: "dlr_01JGFJH900H8M2APVYVDZ4R6AD",
      entitlement_id: "ent_01JGFJH900H8M2APVYVDZ4R6AB",
      expires_at: "2026-09-05T10:01:00.000Z",
      fulfilment_id: "ful_01JGFJH900H8M2APVYVDZ4R6AE",
      issued_at: "2026-09-04T10:01:00.000Z",
      issuer: "https://merchant-demo.example.com/",
      jti: "dlr_01JGFJH900H8M2APVYVDZ4R6AD",
      merchant_id: "merchant_signalworks",
      output_hash: "f".repeat(64),
      schema_version: "mindpay.delivery_receipt.1",
      service_id: "detailed_competitor_dossier",
      status: "COMPLETED",
      transaction_id: "ctx_01JGFJH900H8M2APVYVDZ4R6AC",
    });
    expect(
      signedDeliveryPublicationSchema.safeParse({
        receipt,
        result,
        signature: { alg: "ES256", kid: "signalworks.event.1", signature: "A".repeat(86) },
      }).success,
    ).toBe(false);
  });
});

function validClaims() {
  return {
    agent_id: AGENT_ID,
    amount_subunits: 29_900,
    aud: "https://merchant-demo.example.com/",
    checkout_hash: "a".repeat(64),
    currency: "INR",
    exp: NOW_SECONDS + 900,
    iat: NOW_SECONDS,
    iss: "https://api.mindpay.example/",
    jti: "ent_01JGFJH900H8M2APVYVDZ4R6AB",
    merchant_id: "merchant_signalworks",
    schema_version: "mindpay.entitlement.jwt.1",
    scopes: ["service:redeem"],
    service_id: "market_snapshot",
    sub: AGENT_ID,
    transaction_id: "ctx_01JGFJH900H8M2APVYVDZ4R6AC",
  } as const;
}

function validMarketSnapshot() {
  return marketSnapshotResultSchema.parse({
    data_source: "DETERMINISTIC_DEMO_FIXTURE",
    executive_summary: "A deterministic schema fixture containing no live market claims.",
    findings: [
      {
        confidence: "HIGH",
        evidence: "The typed service ID is exact and immutable.",
        finding: "Service binding retained",
      },
      {
        confidence: "MEDIUM",
        evidence: "The fixture explicitly excludes live research data.",
        finding: "Live source required",
      },
    ],
    generated_at: "2026-09-04T10:01:00.000Z",
    market: "India",
    schema_version: "signalworks.market_snapshot.1",
    service_id: "market_snapshot",
    subject_company: "Acme",
  });
}
