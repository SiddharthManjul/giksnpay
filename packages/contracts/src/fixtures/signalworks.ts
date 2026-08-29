import {
  merchantCatalogSchema,
  merchantCheckoutSchema,
  merchantManifestSchema,
  merchantOfferSchema,
} from "../merchant";

export const signalWorksManifestFixture = merchantManifestSchema.parse({
  acp_base_url: "https://merchant-demo.example.com/",
  audience: "https://api.mindpay.example/",
  catalog_url: "https://merchant-demo.example.com/catalog/feed.json",
  domain: "merchant-demo.example.com",
  expires_at: "2026-09-04T12:00:00.000Z",
  issued_at: "2026-08-28T12:00:00.000Z",
  issuer: "https://merchant-demo.example.com/",
  kid: "sig-2026-01",
  legal_name: "SignalWorks Research Private Limited",
  mcp_url: "https://merchant-demo.example.com/mcp",
  merchant_id: "merchant_signalworks",
  name: "SignalWorks",
  nonce: "nonce_manifest_2026_0001",
  payment_rails: ["razorpay:test"],
  schema_version: "1",
  signing_keys: [
    {
      kid: "sig-2026-01",
      public_jwk: {
        crv: "P-256",
        ext: true,
        key_ops: ["verify"],
        kty: "EC",
        x: "9QvAGuBVXXQsxhSLHjT68lqLPhRcNS7E3e2VLohFjHI",
        y: "eKdH2nsdbo9zkgquztJptOwJ9w5Ba7z-5fVkfSVenjw",
      },
      purpose: ["manifest", "catalog", "checkout", "event"],
      valid_from: "2026-08-01T00:00:00.000Z",
    },
  ],
});

export const signalWorksCatalogFixture = merchantCatalogSchema.parse({
  audience: "https://api.mindpay.example/",
  catalog_id: "catalog_signalworks",
  expires_at: "2026-09-01T12:00:00.000Z",
  generated_at: "2026-08-28T12:00:00.000Z",
  issued_at: "2026-08-28T12:00:00.000Z",
  issuer: "https://merchant-demo.example.com/",
  kid: "sig-2026-01",
  nonce: "nonce_catalog_2026_0001",
  schema_version: "1",
  seller: {
    domain: "merchant-demo.example.com",
    merchant_id: "merchant_signalworks",
    name: "SignalWorks",
  },
  services: [
    {
      availability: "available",
      category: "business_research",
      currency: "INR",
      description:
        "A concise competitor and market landscape report for rapid purchasing decisions.",
      fulfilment: {
        estimated_delivery_seconds: 30,
        tool_id: "redeem_market_snapshot",
        type: "mcp",
      },
      merchant_id: "merchant_signalworks",
      name: "Market Snapshot",
      policy_links: {
        privacy_url: "https://merchant-demo.example.com/policies/privacy",
        terms_url: "https://merchant-demo.example.com/policies/market-snapshot",
      },
      price_subunits: 29_900,
      published_at: "2026-08-27T12:00:00.000Z",
      service_id: "market_snapshot",
      version: "1.0.0",
    },
    {
      availability: "available",
      category: "business_research",
      currency: "INR",
      description:
        "A detailed competitor dossier with positioning, product, and market comparisons.",
      fulfilment: {
        estimated_delivery_seconds: 45,
        tool_id: "redeem_competitor_dossier",
        type: "mcp",
      },
      merchant_id: "merchant_signalworks",
      name: "Detailed Competitor Dossier",
      policy_links: {
        privacy_url: "https://merchant-demo.example.com/policies/privacy",
        terms_url: "https://merchant-demo.example.com/policies/competitor-dossier",
      },
      price_subunits: 44_900,
      published_at: "2026-08-27T12:00:00.000Z",
      service_id: "detailed_competitor_dossier",
      version: "1.0.0",
    },
    {
      availability: "available",
      category: "business_research",
      currency: "INR",
      description:
        "An enterprise intelligence pack covering competitors, risks, and strategic options.",
      fulfilment: {
        estimated_delivery_seconds: 60,
        tool_id: "redeem_enterprise_intelligence",
        type: "mcp",
      },
      merchant_id: "merchant_signalworks",
      name: "Enterprise Intelligence Pack",
      policy_links: {
        privacy_url: "https://merchant-demo.example.com/policies/privacy",
        terms_url: "https://merchant-demo.example.com/policies/enterprise-intelligence",
      },
      price_subunits: 79_900,
      published_at: "2026-08-27T12:00:00.000Z",
      service_id: "enterprise_intelligence_pack",
      version: "1.0.0",
    },
  ],
  version: "1.0.0",
});

export const signalWorksOfferFixture = merchantOfferSchema.parse({
  amount_subunits: 29_900,
  audience: "https://api.mindpay.example/",
  checkout_session_id: "checkout_01JGFJJZ00H8M2APVYVDZ4R6G6",
  currency: "INR",
  expires_at: "2026-08-28T12:20:00.000Z",
  issued_at: "2026-08-28T12:05:00.000Z",
  issuer: "https://merchant-demo.example.com/",
  kid: "sig-2026-01",
  merchant_domain: "merchant-demo.example.com",
  merchant_id: "merchant_signalworks",
  nonce: "nonce_market_snapshot_0001",
  offer_id: "offer_01JGFJK000H8M2APVYVDZ4R6G7",
  quantity: 1,
  schema_version: "1",
  service_id: "market_snapshot",
  service_version: "1.0.0",
  terms_url: "https://merchant-demo.example.com/policies/market-snapshot",
});

export const signalWorksCheckoutFixture = merchantCheckoutSchema.parse({
  audience: "https://api.mindpay.example/",
  checkout_session_id: "checkout_01JGFJJZ00H8M2APVYVDZ4R6G6",
  currency: "INR",
  expires_at: "2026-08-28T12:20:00.000Z",
  fulfilment_terms: {
    delivery_type: "mcp",
    policy_url: "https://merchant-demo.example.com/policies/market-snapshot",
    summary: "Issue one scoped entitlement for the Market Snapshot fulfilment tool.",
  },
  issued_at: "2026-08-28T12:05:00.000Z",
  issuer: "https://merchant-demo.example.com/",
  kid: "sig-2026-01",
  line_items: [
    {
      line_total_subunits: 29_900,
      quantity: 1,
      service_id: "market_snapshot",
      service_version: "1.0.0",
      unit_price_subunits: 29_900,
    },
  ],
  merchant_domain: "merchant-demo.example.com",
  merchant_id: "merchant_signalworks",
  nonce: "nonce_checkout_snapshot_0001",
  schema_version: "1",
  total_subunits: 29_900,
});
