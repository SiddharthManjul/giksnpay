import { type ServiceVersion, serviceVersionSchema } from "@mindpay/contracts";
import { z } from "zod";
import { SIGNALWORKS_MERCHANT } from "./identity";

export const SIGNALWORKS_CATALOG_ID = "catalog_signalworks";
export const SIGNALWORKS_CATALOG_VERSION = "1.0.0";
export const SIGNALWORKS_SERVICE_PUBLISHED_AT = "2026-08-27T12:00:00.000Z";

const epochMillisecondsSchema = z.number().int().safe().nonnegative();

const serviceVersionRowSchema = z
  .object({
    availability: z.enum(["available", "paused", "unavailable"]),
    category: z.string(),
    created_at: epochMillisecondsSchema,
    currency: z.string(),
    description: z.string(),
    estimated_delivery_seconds: z.number().int().safe(),
    fulfilment_tool_id: z.string(),
    fulfilment_type: z.enum(["mcp", "rest"]),
    merchant_id: z.string(),
    name: z.string(),
    price_subunits: z.number().int().safe(),
    privacy_url: z.string(),
    published_at: epochMillisecondsSchema,
    service_id: z.string(),
    terms_url: z.string(),
    version: z.string(),
  })
  .strict();

type ServiceVersionRow = z.infer<typeof serviceVersionRowSchema>;

export const SIGNALWORKS_SERVICE_VERSIONS = Object.freeze([
  serviceVersionSchema.parse({
    availability: "available",
    category: "business_research",
    currency: "INR",
    description: "A concise competitor and market landscape report for rapid purchasing decisions.",
    fulfilment: {
      estimated_delivery_seconds: 30,
      tool_id: "redeem_market_snapshot",
      type: "mcp",
    },
    merchant_id: SIGNALWORKS_MERCHANT.merchantId,
    name: "Market Snapshot",
    policy_links: {
      privacy_url: "https://merchant-demo.example.com/policies/privacy",
      terms_url: "https://merchant-demo.example.com/policies/market-snapshot",
    },
    price_subunits: 29_900,
    published_at: SIGNALWORKS_SERVICE_PUBLISHED_AT,
    service_id: "market_snapshot",
    version: "1.0.0",
  }),
  serviceVersionSchema.parse({
    availability: "available",
    category: "business_research",
    currency: "INR",
    description: "A detailed competitor dossier with positioning, product, and market comparisons.",
    fulfilment: {
      estimated_delivery_seconds: 45,
      tool_id: "redeem_competitor_dossier",
      type: "mcp",
    },
    merchant_id: SIGNALWORKS_MERCHANT.merchantId,
    name: "Detailed Competitor Dossier",
    policy_links: {
      privacy_url: "https://merchant-demo.example.com/policies/privacy",
      terms_url: "https://merchant-demo.example.com/policies/competitor-dossier",
    },
    price_subunits: 44_900,
    published_at: SIGNALWORKS_SERVICE_PUBLISHED_AT,
    service_id: "detailed_competitor_dossier",
    version: "1.0.0",
  }),
  serviceVersionSchema.parse({
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
    merchant_id: SIGNALWORKS_MERCHANT.merchantId,
    name: "Enterprise Intelligence Pack",
    policy_links: {
      privacy_url: "https://merchant-demo.example.com/policies/privacy",
      terms_url: "https://merchant-demo.example.com/policies/enterprise-intelligence",
    },
    price_subunits: 79_900,
    published_at: SIGNALWORKS_SERVICE_PUBLISHED_AT,
    service_id: "enterprise_intelligence_pack",
    version: "1.0.0",
  }),
] as const satisfies readonly ServiceVersion[]);

export class SignalWorksServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksServiceError";
  }
}

export async function seedSignalWorksServiceVersions(
  database: D1Database,
): Promise<readonly ServiceVersion[]> {
  const publishedAtEpochMs = Date.parse(SIGNALWORKS_SERVICE_PUBLISHED_AT);
  await database.batch(
    SIGNALWORKS_SERVICE_VERSIONS.map((service) =>
      database
        .prepare(
          "INSERT INTO merchant_service_versions (merchant_id, service_id, version, name, description, category, currency, price_subunits, availability, fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url, terms_url, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(merchant_id, service_id, version) DO NOTHING",
        )
        .bind(
          service.merchant_id,
          service.service_id,
          service.version,
          service.name,
          service.description,
          service.category,
          service.currency,
          service.price_subunits,
          service.availability,
          service.fulfilment.type,
          service.fulfilment.tool_id,
          service.fulfilment.estimated_delivery_seconds,
          service.policy_links.privacy_url,
          service.policy_links.terms_url,
          publishedAtEpochMs,
          publishedAtEpochMs,
        ),
    ),
  );
  return readSignalWorksServiceVersions(database);
}

export async function readSignalWorksServiceVersions(
  database: D1Database,
): Promise<readonly ServiceVersion[]> {
  const result = await database
    .prepare(
      "SELECT merchant_id, service_id, version, name, description, category, currency, price_subunits, availability, fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url, terms_url, published_at, created_at FROM merchant_service_versions WHERE merchant_id = ? AND version = ? ORDER BY price_subunits, service_id",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId, SIGNALWORKS_CATALOG_VERSION)
    .all();
  const rows = z.array(serviceVersionRowSchema).parse(result.results);
  const services = rows.map(toServiceVersion);
  if (
    services.length !== SIGNALWORKS_SERVICE_VERSIONS.length ||
    services.some(
      (service, index) =>
        JSON.stringify(service) !== JSON.stringify(SIGNALWORKS_SERVICE_VERSIONS[index]),
    )
  ) {
    throw new SignalWorksServiceError(
      "Stored SignalWorks service versions conflict with the published catalog",
    );
  }
  return Object.freeze(services);
}

function toServiceVersion(row: ServiceVersionRow): ServiceVersion {
  if (row.created_at !== row.published_at) {
    throw new SignalWorksServiceError("SignalWorks service creation and publication must match");
  }
  return serviceVersionSchema.parse({
    availability: row.availability,
    category: row.category,
    currency: row.currency,
    description: row.description,
    fulfilment: {
      estimated_delivery_seconds: row.estimated_delivery_seconds,
      tool_id: row.fulfilment_tool_id,
      type: row.fulfilment_type,
    },
    merchant_id: row.merchant_id,
    name: row.name,
    policy_links: {
      privacy_url: row.privacy_url,
      terms_url: row.terms_url,
    },
    price_subunits: row.price_subunits,
    published_at: new Date(row.published_at).toISOString(),
    service_id: row.service_id,
    version: row.version,
  });
}
