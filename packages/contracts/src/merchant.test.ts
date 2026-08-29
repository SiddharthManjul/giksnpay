import { describe, expect, it } from "vitest";
import {
  signalWorksCatalogFixture,
  signalWorksCheckoutFixture,
  signalWorksManifestFixture,
  signalWorksOfferFixture,
} from "./fixtures/signalworks";
import {
  merchantCatalogSchema,
  merchantCheckoutSchema,
  merchantDomainSchema,
  merchantManifestSchema,
  merchantOfferSchema,
  serviceVersionSchema,
  signedMerchantCatalogSchema,
  signedMerchantManifestSchema,
} from "./merchant";

describe("SignalWorks merchant fixtures", () => {
  it("accepts the reference manifest, catalog, offer, and checkout", () => {
    expect(merchantManifestSchema.parse(signalWorksManifestFixture)).toEqual(
      signalWorksManifestFixture,
    );
    expect(merchantCatalogSchema.parse(signalWorksCatalogFixture)).toEqual(
      signalWorksCatalogFixture,
    );
    expect(merchantOfferSchema.parse(signalWorksOfferFixture)).toEqual(signalWorksOfferFixture);
    expect(merchantCheckoutSchema.parse(signalWorksCheckoutFixture)).toEqual(
      signalWorksCheckoutFixture,
    );
  });

  it("contains the three required integer-INR service versions", () => {
    expect(
      signalWorksCatalogFixture.services.map((service) => [
        service.service_id,
        service.price_subunits,
        service.currency,
      ]),
    ).toEqual([
      ["market_snapshot", 29_900, "INR"],
      ["detailed_competitor_dossier", 44_900, "INR"],
      ["enterprise_intelligence_pack", 79_900, "INR"],
    ]);
  });

  it("returns frozen protocol objects and nested version records", () => {
    expect(Object.isFrozen(signalWorksManifestFixture)).toBe(true);
    expect(Object.isFrozen(signalWorksManifestFixture.signing_keys)).toBe(true);
    expect(Object.isFrozen(signalWorksManifestFixture.signing_keys[0])).toBe(true);
    expect(Object.isFrozen(signalWorksManifestFixture.signing_keys[0]?.public_jwk)).toBe(true);
    expect(Object.isFrozen(signalWorksCatalogFixture.services)).toBe(true);
    expect(Object.isFrozen(signalWorksCatalogFixture.services[0])).toBe(true);
    expect(Object.isFrozen(signalWorksCatalogFixture.services[0]?.fulfilment)).toBe(true);
    expect(Object.isFrozen(signalWorksCheckoutFixture.line_items)).toBe(true);
    expect(Object.isFrozen(signalWorksCheckoutFixture.line_items[0])).toBe(true);
  });
});

describe("strict merchant boundaries", () => {
  it("accepts only a strict canonical signed-manifest envelope", () => {
    const publication = {
      manifest: signalWorksManifestFixture,
      signature: {
        alg: "ES256",
        kid: signalWorksManifestFixture.kid,
        signature: `${"A".repeat(85)}A`,
      },
    };

    expect(signedMerchantManifestSchema.parse(publication)).toEqual(publication);
    expect(
      signedMerchantManifestSchema.safeParse({
        ...publication,
        signature: { ...publication.signature, kid: "another-key" },
      }).success,
    ).toBe(false);
    expect(
      signedMerchantManifestSchema.safeParse({
        ...publication,
        signature: { ...publication.signature, signature: `${"A".repeat(85)}B` },
      }).success,
    ).toBe(false);
    expect(signedMerchantManifestSchema.safeParse({ ...publication, unsigned: true }).success).toBe(
      false,
    );
  });

  it("accepts only a strict canonical signed-catalog envelope", () => {
    const publication = {
      catalog: signalWorksCatalogFixture,
      signature: {
        alg: "ES256",
        kid: signalWorksCatalogFixture.kid,
        signature: `${"A".repeat(85)}A`,
      },
    };

    expect(signedMerchantCatalogSchema.parse(publication)).toEqual(publication);
    expect(
      signedMerchantCatalogSchema.safeParse({
        ...publication,
        signature: { ...publication.signature, kid: "another-key" },
      }).success,
    ).toBe(false);
    expect(signedMerchantCatalogSchema.safeParse({ ...publication, unsigned: true }).success).toBe(
      false,
    );
  });

  it.each([
    [merchantManifestSchema, signalWorksManifestFixture, "nonce"],
    [merchantCatalogSchema, signalWorksCatalogFixture, "nonce"],
    [merchantOfferSchema, signalWorksOfferFixture, "nonce"],
    [merchantCheckoutSchema, signalWorksCheckoutFixture, "nonce"],
  ] as const)("requires common signed claims for %#", (schema, fixture, replayField) => {
    for (const field of ["issuer", "audience", "kid", "issued_at", "expires_at", replayField]) {
      const missing: Record<string, unknown> = { ...fixture };
      delete missing[field];
      expect(schema.safeParse(missing).success, field).toBe(false);
    }
  });

  it("binds signed merchant issuers and manifest keys", () => {
    expect(
      merchantCatalogSchema.safeParse({
        ...signalWorksCatalogFixture,
        issuer: "https://impostor.example.com/",
      }).success,
    ).toBe(false);
    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        kid: "unknown-signing-key",
      }).success,
    ).toBe(false);
    expect(
      merchantCatalogSchema.safeParse({
        ...signalWorksCatalogFixture,
        generated_at: "2026-08-28T12:00:00.001Z",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields instead of silently dropping signed data", () => {
    expect(
      merchantManifestSchema.safeParse({ ...signalWorksManifestFixture, unexpected: true }).success,
    ).toBe(false);
    expect(
      serviceVersionSchema.safeParse({
        ...signalWorksCatalogFixture.services[0],
        display_price: 299,
      }).success,
    ).toBe(false);
    expect(
      merchantCheckoutSchema.safeParse({ ...signalWorksCheckoutFixture, payment_status: "paid" })
        .success,
    ).toBe(false);
  });

  it("rejects floating, unsafe, negative, and wrong-currency prices", () => {
    for (const price of [29_900.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        serviceVersionSchema.safeParse({
          ...signalWorksCatalogFixture.services[0],
          price_subunits: price,
        }).success,
      ).toBe(false);
    }

    expect(
      serviceVersionSchema.safeParse({
        ...signalWorksCatalogFixture.services[0],
        currency: "USD",
      }).success,
    ).toBe(false);
  });

  it.each([
    "http://merchant-demo.example.com/catalog/feed.json",
    "https://evil.example.com/catalog/feed.json",
    "https://user:password@merchant-demo.example.com/catalog/feed.json",
    "https://merchant-demo.example.com/catalog/feed.json?version=1",
    "https://merchant-demo.example.com:444/catalog/feed.json",
    "https://127.0.0.1/catalog/feed.json",
    "https://Merchant-Demo.example.com/catalog/feed.json",
  ])("rejects invalid manifest endpoint %s", (catalogUrl) => {
    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        catalog_url: catalogUrl,
      }).success,
    ).toBe(false);
  });

  it.each(["localhost", "merchant.local", "127.0.0.1", "Merchant.Example.com"])(
    "rejects non-public or non-canonical domain %s",
    (domain) => {
      expect(merchantDomainSchema.safeParse(domain).success).toBe(false);
    },
  );

  it("rejects public JWKs containing private material", () => {
    const signingKey = signalWorksManifestFixture.signing_keys[0];
    expect(signingKey).toBeDefined();

    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        signing_keys: [
          {
            ...signingKey,
            public_jwk: { ...signingKey?.public_jwk, d: "secret-private-coordinate" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate signing-key IDs and catalogs without a manifest key", () => {
    const signingKey = signalWorksManifestFixture.signing_keys[0];
    expect(signingKey).toBeDefined();

    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        signing_keys: [signingKey, signingKey],
      }).success,
    ).toBe(false);
    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        signing_keys: [{ ...signingKey, purpose: ["event"] }],
      }).success,
    ).toBe(false);
  });

  it("rejects inverted manifest and key validity windows", () => {
    const signingKey = signalWorksManifestFixture.signing_keys[0];

    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        expires_at: signalWorksManifestFixture.issued_at,
      }).success,
    ).toBe(false);
    expect(
      merchantManifestSchema.safeParse({
        ...signalWorksManifestFixture,
        signing_keys: [
          {
            ...signingKey,
            valid_until: "2026-07-31T00:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("catalog and checkout consistency", () => {
  it("rejects unstable and duplicate service identifiers", () => {
    const firstService = signalWorksCatalogFixture.services[0];
    const secondService = signalWorksCatalogFixture.services[1];
    expect(firstService).toBeDefined();
    expect(secondService).toBeDefined();

    expect(
      serviceVersionSchema.safeParse({ ...firstService, service_id: "Market Snapshot" }).success,
    ).toBe(false);
    expect(
      merchantCatalogSchema.safeParse({
        ...signalWorksCatalogFixture,
        services: [firstService, { ...secondService, service_id: firstService?.service_id }],
      }).success,
    ).toBe(false);
  });

  it("rejects services belonging to another merchant or policy origin", () => {
    const service = signalWorksCatalogFixture.services[0];

    expect(
      merchantCatalogSchema.safeParse({
        ...signalWorksCatalogFixture,
        services: [{ ...service, merchant_id: "merchant_impostor" }],
      }).success,
    ).toBe(false);
    expect(
      merchantCatalogSchema.safeParse({
        ...signalWorksCatalogFixture,
        services: [
          {
            ...service,
            policy_links: {
              ...service?.policy_links,
              terms_url: "https://evil.example.com/terms",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent line and checkout totals", () => {
    const lineItem = signalWorksCheckoutFixture.line_items[0];

    expect(
      merchantCheckoutSchema.safeParse({
        ...signalWorksCheckoutFixture,
        line_items: [{ ...lineItem, line_total_subunits: 29_901 }],
      }).success,
    ).toBe(false);
    expect(
      merchantCheckoutSchema.safeParse({
        ...signalWorksCheckoutFixture,
        total_subunits: 29_901,
      }).success,
    ).toBe(false);
  });

  it("rejects offers and checkouts bound to a different policy origin", () => {
    expect(
      merchantOfferSchema.safeParse({
        ...signalWorksOfferFixture,
        terms_url: "https://evil.example.com/terms",
      }).success,
    ).toBe(false);
    expect(
      merchantCheckoutSchema.safeParse({
        ...signalWorksCheckoutFixture,
        fulfilment_terms: {
          ...signalWorksCheckoutFixture.fulfilment_terms,
          policy_url: "https://evil.example.com/policy",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects malformed external IDs, nonces, and semantic versions", () => {
    expect(
      merchantOfferSchema.safeParse({ ...signalWorksOfferFixture, offer_id: "offer_random" })
        .success,
    ).toBe(false);
    expect(
      merchantOfferSchema.safeParse({ ...signalWorksOfferFixture, nonce: "short" }).success,
    ).toBe(false);
    expect(
      serviceVersionSchema.safeParse({
        ...signalWorksCatalogFixture.services[0],
        version: "latest",
      }).success,
    ).toBe(false);
  });
});
