import { describe, expect, it } from "vitest";
import {
  marketplaceSearchQuerySchema,
  merchantAdministrationResponseSchema,
  merchantSubmissionRequestSchema,
} from "./marketplace";

describe("marketplace API contracts", () => {
  it("normalizes deterministic search pagination and price filters", () => {
    expect(
      marketplaceSearchQuerySchema.parse({ limit: "25", minPriceSubunits: "100", q: "research" }),
    ).toEqual({ limit: 25, minPriceSubunits: 100, q: "research" });
    expect(() =>
      marketplaceSearchQuerySchema.parse({ maxPriceSubunits: "99", minPriceSubunits: "100" }),
    ).toThrow(/Minimum price/);
    expect(() => marketplaceSearchQuerySchema.parse({ injected: "true" })).toThrow();
  });

  it("accepts strict merchant submissions and stable administration outcomes", () => {
    expect(
      merchantSubmissionRequestSchema.parse({
        domain: "merchant-demo.example.com",
        legalName: "SignalWorks Research Private Limited",
        merchantId: "merchant_signalworks",
        name: "SignalWorks",
      }),
    ).toMatchObject({ merchantId: "merchant_signalworks" });
    expect(() =>
      merchantSubmissionRequestSchema.parse({
        domain: "127.0.0.1",
        legalName: "Local Merchant",
        merchantId: "merchant_localhost",
        name: "Local",
      }),
    ).toThrow();

    expect(
      merchantAdministrationResponseSchema.parse({
        merchant: {
          domain: "merchant-demo.example.com",
          id: "merchant_signalworks",
          name: "SignalWorks",
          operationalStatus: "ACTIVE",
          riskTier: "LOW",
          verificationStatus: "QUARANTINED",
          verificationTier: "NONE",
          verifiedAt: "2026-08-30T12:00:00.000Z",
        },
        verification: {
          catalogVersion: null,
          reason: "CATALOG_INVALID_SIGNATURE",
          result: "FAILED",
        },
      }),
    ).toMatchObject({ merchant: { verificationStatus: "QUARANTINED" } });
  });
});
