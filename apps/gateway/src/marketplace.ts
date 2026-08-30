import {
  type MarketplaceService,
  marketplaceServiceResponseSchema,
  marketplaceServiceSchema,
  marketplaceServicesResponseSchema,
  marketplaceSearchQuerySchema,
  merchantIdSchema,
  merchantManifestSchema,
  merchantTrustResponseSchema,
} from "@mindpay/contracts";
import { z } from "zod";
import { Hono } from "hono";
import { apiError, type GatewayEnvironment, resourceNotFound } from "./authorization";

export const MARKETPLACE_CACHE_KEY = "marketplace:services:v1";

const cacheDocumentSchema = z
  .object({
    expiresAt: z.number().int().positive(),
    generation: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]+$/u),
    services: z.array(marketplaceServiceSchema).readonly(),
  })
  .strict()
  .readonly();

const generationRowSchema = z.object({ generation: z.string() }).strict();
const serviceRowSchema = z
  .object({
    availability: z.string(),
    category: z.string(),
    currency: z.string(),
    description: z.string(),
    domain: z.string(),
    estimated_delivery_seconds: z.number(),
    external_id: z.string(),
    fulfilment_tool_id: z.string(),
    fulfilment_type: z.string(),
    id: z.string(),
    merchant_id: z.string(),
    merchant_name: z.string(),
    name: z.string(),
    price_subunits: z.number(),
    privacy_url: z.string(),
    risk_tier: z.string(),
    terms_url: z.string(),
    verification_status: z.string(),
    verification_tier: z.string(),
    verification_expires_at: z.number(),
    verified_at: z.number(),
    version: z.string(),
  })
  .strict();

export function createMarketplaceRoutes(dependencies: { readonly now?: () => Date } = {}) {
  const routes = new Hono<GatewayEnvironment>();

  routes.get("/services", async (context) => {
    const queryInput = readUniqueQuery(context.req.url);
    if (queryInput === null) {
      return apiError(context, 400, "INVALID_REQUEST", "Marketplace query parameters are invalid.");
    }
    const query = marketplaceSearchQuerySchema.safeParse(queryInput);
    if (!query.success) {
      return apiError(context, 400, "INVALID_REQUEST", "Marketplace query parameters are invalid.");
    }

    const document = await readMarketplaceDocument(
      context.env.DB,
      context.env.MARKETPLACE_CACHE,
      dependencies.now?.().getTime() ?? Date.now(),
    );
    const normalizedSearch = query.data.q?.toLocaleLowerCase("en-US");
    const filtered = document.services.filter((service) => {
      const searchable =
        `${service.name}\n${service.description}\n${service.merchant.name}`.toLocaleLowerCase(
          "en-US",
        );
      return (
        (normalizedSearch === undefined || searchable.includes(normalizedSearch)) &&
        (query.data.category === undefined || service.category === query.data.category) &&
        (query.data.merchantId === undefined || service.merchant.id === query.data.merchantId) &&
        (query.data.availability === undefined ||
          service.availability === query.data.availability) &&
        (query.data.fulfilment === undefined ||
          service.fulfilment.type === query.data.fulfilment) &&
        (query.data.minPriceSubunits === undefined ||
          service.priceSubunits >= query.data.minPriceSubunits) &&
        (query.data.maxPriceSubunits === undefined ||
          service.priceSubunits <= query.data.maxPriceSubunits)
      );
    });

    let start = 0;
    if (query.data.cursor !== undefined) {
      const cursorValue = decodeCursor(query.data.cursor);
      if (cursorValue === null) {
        return apiError(context, 400, "INVALID_REQUEST", "The marketplace cursor is invalid.");
      }
      const index = filtered.findIndex((service) => cursorFor(service) === cursorValue);
      if (index < 0) {
        return apiError(context, 400, "INVALID_REQUEST", "The marketplace cursor is invalid.");
      }
      start = index + 1;
    }
    const services = filtered.slice(start, start + query.data.limit);
    const last = services.at(-1);
    const hasMore = start + services.length < filtered.length;
    return context.json(
      marketplaceServicesResponseSchema.parse({
        nextCursor: hasMore && last !== undefined ? encodeCursor(cursorFor(last)) : null,
        services,
      }),
    );
  });

  routes.get("/services/:serviceId", async (context) => {
    const document = await readMarketplaceDocument(
      context.env.DB,
      context.env.MARKETPLACE_CACHE,
      dependencies.now?.().getTime() ?? Date.now(),
    );
    const service = document.services.find((entry) => entry.id === context.req.param("serviceId"));
    if (service === undefined) return resourceNotFound(context);
    return context.json(marketplaceServiceResponseSchema.parse({ service }));
  });

  routes.get("/merchants/:merchantId", async (context) => {
    const merchantId = merchantIdSchema.safeParse(context.req.param("merchantId"));
    if (!merchantId.success) return resourceNotFound(context);
    const merchant = await readMerchantTrust(
      context.env.DB,
      merchantId.data,
      dependencies.now?.().getTime() ?? Date.now(),
    );
    if (merchant === null) return resourceNotFound(context);
    return context.json(merchant);
  });

  return routes;
}

export const marketplaceRoutes = createMarketplaceRoutes();

export async function warmMarketplaceCache(
  database: D1Database,
  cache: KVNamespace | undefined,
  nowEpochMs = Date.now(),
): Promise<void> {
  if (cache === undefined) return;
  const document = await buildMarketplaceDocument(database, nowEpochMs);
  if (document !== null) {
    await cache.put(MARKETPLACE_CACHE_KEY, JSON.stringify(document));
  } else {
    await cache.delete(MARKETPLACE_CACHE_KEY);
  }
}

export async function readMarketplaceDocument(
  database: D1Database,
  cache: KVNamespace | undefined,
  nowEpochMs = Date.now(),
) {
  const generation = await readGeneration(database);
  if (generation === null) {
    return cacheDocumentSchema.parse({
      expiresAt: nowEpochMs + 60_000,
      generation: "0".repeat(64),
      services: [],
    });
  }
  if (cache !== undefined) {
    try {
      const cached = await cache.get(MARKETPLACE_CACHE_KEY, "json");
      const parsed = cacheDocumentSchema.safeParse(cached);
      if (
        parsed.success &&
        parsed.data.generation === generation &&
        parsed.data.expiresAt > nowEpochMs
      ) {
        return parsed.data;
      }
    } catch {
      // D1 remains canonical and can serve discovery during a KV incident.
    }
  }
  const document = await buildMarketplaceDocument(database, nowEpochMs);
  if (document === null) {
    return cacheDocumentSchema.parse({ expiresAt: nowEpochMs + 60_000, generation, services: [] });
  }
  if (cache !== undefined) {
    await cache.put(MARKETPLACE_CACHE_KEY, JSON.stringify(document)).catch(() => undefined);
  }
  return document;
}

async function buildMarketplaceDocument(database: D1Database, nowEpochMs: number) {
  const generation = await readGeneration(database);
  if (generation === null) return null;
  const result = await database
    .prepare(
      `SELECT s.id, s.external_id, s.name, s.description, s.category,
        sv.version, sv.price_subunits, sv.currency, sv.availability,
        sv.fulfilment_type, sv.fulfilment_tool_id, sv.estimated_delivery_seconds,
        sv.privacy_url, sv.terms_url, m.id AS merchant_id, m.name AS merchant_name,
        m.domain, m.risk_tier, m.verification_status, m.verification_tier,
        m.last_verification_at AS verified_at, m.verification_expires_at
       FROM services s
       JOIN service_versions sv ON sv.id = s.current_version_id
       JOIN merchants m ON m.id = s.merchant_id
       WHERE s.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.verification_status = 'APPROVED'
         AND m.verification_expires_at > ?
       ORDER BY lower(s.name), s.id`,
    )
    .bind(nowEpochMs)
    .all();
  const services = result.results.map((untrusted) =>
    serviceFromRow(serviceRowSchema.parse(untrusted)),
  );
  return cacheDocumentSchema.parse({
    expiresAt:
      services.length === 0
        ? nowEpochMs + 60_000
        : Math.min(
            ...result.results.map((row) => serviceRowSchema.parse(row).verification_expires_at),
          ),
    generation,
    services,
  });
}

async function readGeneration(database: D1Database): Promise<string | null> {
  const row = await database
    .prepare("SELECT generation FROM marketplace_cache_versions WHERE namespace = 'services'")
    .first();
  if (row === null) return null;
  return generationRowSchema.parse(row).generation;
}

async function readMerchantTrust(database: D1Database, merchantId: string, nowEpochMs: number) {
  const row = await database
    .prepare(
      `SELECT m.id, m.name, m.domain, m.risk_tier, m.verification_status,
        m.verification_tier, m.last_verification_at, mc.version AS catalog_version,
        mm.manifest_json
       FROM merchants m
       JOIN merchant_catalogs mc ON mc.id = m.current_catalog_id
       JOIN merchant_manifests mm ON mm.id = m.current_manifest_id
       WHERE m.id = ? AND m.status = 'ACTIVE' AND m.verification_status = 'APPROVED'
         AND m.verification_expires_at > ?`,
    )
    .bind(merchantId, nowEpochMs)
    .first();
  if (row === null) return null;
  const parsed = z
    .object({
      catalog_version: z.string(),
      domain: z.string(),
      id: z.string(),
      last_verification_at: z.number(),
      manifest_json: z.string(),
      name: z.string(),
      risk_tier: z.string(),
      verification_status: z.string(),
      verification_tier: z.string(),
    })
    .strict()
    .parse(row);
  const manifest = merchantManifestSchema.parse(JSON.parse(parsed.manifest_json) as unknown);
  const checksResult = await database
    .prepare(
      `SELECT check_type, checked_at FROM merchant_verifications
       WHERE merchant_id = ? AND status = 'PASS'
         AND run_id = (
           SELECT run_id FROM merchant_verifications
           WHERE merchant_id = ?
           ORDER BY checked_at DESC, id DESC LIMIT 1
         )
       ORDER BY checked_at DESC, check_type LIMIT 32`,
    )
    .bind(merchantId, merchantId)
    .all();
  const checkRowSchema = z.object({ checked_at: z.number(), check_type: z.string() }).strict();
  const protocols = new Set<"ACP" | "MCP">(["ACP"]);
  if (manifest.mcp_url.length > 0) protocols.add("MCP");
  return merchantTrustResponseSchema.parse({
    merchant: {
      catalogVersion: parsed.catalog_version,
      checks: checksResult.results.map((check) => {
        const value = checkRowSchema.parse(check);
        return { checkedAt: new Date(value.checked_at).toISOString(), type: value.check_type };
      }),
      domain: parsed.domain,
      id: parsed.id,
      name: parsed.name,
      paymentRails: manifest.payment_rails,
      protocols: [...protocols],
      riskTier: parsed.risk_tier,
      verificationStatus: parsed.verification_status,
      verificationTier: parsed.verification_tier,
      verifiedAt: new Date(parsed.last_verification_at).toISOString(),
    },
  });
}

function serviceFromRow(row: z.infer<typeof serviceRowSchema>): MarketplaceService {
  return marketplaceServiceSchema.parse({
    availability: row.availability,
    category: row.category,
    currency: row.currency,
    description: row.description,
    externalId: row.external_id,
    fulfilment: {
      estimatedDeliverySeconds: row.estimated_delivery_seconds,
      toolId: row.fulfilment_tool_id,
      type: row.fulfilment_type,
    },
    id: row.id,
    merchant: {
      domain: row.domain,
      id: row.merchant_id,
      name: row.merchant_name,
      riskTier: row.risk_tier,
      verificationStatus: row.verification_status,
      verificationTier: row.verification_tier,
      verifiedAt: new Date(row.verified_at).toISOString(),
    },
    name: row.name,
    paymentRail: "razorpay:test",
    policyLinks: { privacyUrl: row.privacy_url, termsUrl: row.terms_url },
    priceSubunits: row.price_subunits,
    protocol: "ACP",
    version: row.version,
  });
}

function readUniqueQuery(url: string): Readonly<Record<string, string>> | null {
  const entries = new URL(url).searchParams;
  const output: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (Object.hasOwn(output, key)) return null;
    output[key] = value;
  }
  return output;
}

function cursorFor(service: MarketplaceService): string {
  return `${service.name.toLocaleLowerCase("en-US")}\u0000${service.id}`;
}

function encodeCursor(value: string): string {
  const binary = Array.from(new TextEncoder().encode(value), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary).replace(/=/gu, "").replace(/\+/gu, "-").replace(/\//gu, "_");
}

function decodeCursor(value: string): string | null {
  try {
    const base64 = value
      .replace(/-/gu, "+")
      .replace(/_/gu, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
