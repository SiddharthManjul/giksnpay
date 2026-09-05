import {
  apiErrorResponseSchema,
  type MerchantAdministrationResponse,
  merchantAdministrationResponseSchema,
  merchantAdministrationListResponseSchema,
  merchantIdSchema,
  merchantManifestSchema,
  merchantSubmissionRequestSchema,
  type signedMerchantCatalogSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createUlid, idempotencyKeySchema } from "@mindpay/domain";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
  resourceNotFound,
} from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";
import { warmMarketplaceCache } from "./marketplace";
import {
  catalogServiceFingerprint,
  compareSemanticVersions,
  DEFAULT_MINDPAY_API_AUDIENCE,
  fetchJsonPublication,
  MERCHANT_VERIFICATION_TTL_MS,
  type MerchantVerificationCheck,
  type MerchantVerificationDependencies,
  materialManifestFingerprint,
  verifyMerchant,
} from "./merchant-verification";
import { merchantVerificationTransitionPath } from "./merchant-verification-state";

const EMPTY_BODY_SCHEMA = z.object({}).strict();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const LOCAL_REFERENCE_MERCHANT_DOMAIN = "merchant-demo.example.com";
const LOCAL_REFERENCE_MERCHANT_ID = "merchant_signalworks";
const LOCAL_REFERENCE_PUBLICATION_PATHS = new Set([
  "/.well-known/mindpay.json",
  "/catalog/feed.json",
]);

type AdminAction = "REVERIFY" | "SUBMIT" | "SUSPEND" | "VERIFY";
type VerificationStatus =
  | "SUBMITTED"
  | "DOMAIN_VERIFIED"
  | "KEY_VERIFIED"
  | "CATALOG_VALIDATED"
  | "PAYMENT_CONFIGURATION_VERIFIED"
  | "APPROVED"
  | "REVIEW_REQUIRED"
  | "QUARANTINED";

const merchantRowSchema = z
  .object({
    current_catalog_id: z.string().nullable(),
    current_manifest_id: z.string().nullable(),
    domain: z.string(),
    id: z.string(),
    last_verification_at: z.number().nullable(),
    legal_name: z.string(),
    name: z.string(),
    organization_id: z.string(),
    revision: z.number().int().nonnegative(),
    risk_tier: z.enum(["LOW", "MEDIUM", "HIGH"]),
    status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
    verification_status: z.enum([
      "SUBMITTED",
      "DOMAIN_VERIFIED",
      "KEY_VERIFIED",
      "CATALOG_VALIDATED",
      "PAYMENT_CONFIGURATION_VERIFIED",
      "APPROVED",
      "REVIEW_REQUIRED",
      "QUARANTINED",
    ]),
    verification_tier: z.enum(["NONE", "TEST_VERIFIED"]),
  })
  .strict();

type MerchantRow = z.infer<typeof merchantRowSchema>;

export function createMerchantAdminRoutes(
  verificationDependencies: MerchantVerificationDependencies = {},
) {
  const routes = new Hono<GatewayEnvironment>();
  routes.use("*", requireAuthentication);

  routes.get("/", requireOrganizationCapability("merchant:review"), async (context) => {
    const result = await context.env.DB.prepare(
      `SELECT m.id, m.name, m.domain, m.status, m.verification_status, m.verification_tier,
       m.risk_tier, m.last_verification_at, mc.version AS catalog_version
       FROM merchants m LEFT JOIN merchant_catalogs mc ON mc.id = m.current_catalog_id
       WHERE m.organization_id = ? ORDER BY m.updated_at DESC, m.id DESC LIMIT 1000`,
    )
      .bind(context.get("organizationAuthorization").organization.id)
      .all();
    return context.json(
      merchantAdministrationListResponseSchema.parse({
        merchants: result.results.map((untrusted) => {
          const row = z
            .object({
              catalog_version: z.string().nullable(),
              domain: z.string(),
              id: z.string(),
              last_verification_at: z.number().nullable(),
              name: z.string(),
              risk_tier: z.string(),
              status: z.string(),
              verification_status: z.string(),
              verification_tier: z.string(),
            })
            .strict()
            .parse(untrusted);
          const failed = ["QUARANTINED", "REVIEW_REQUIRED"].includes(row.verification_status);
          return administrationResponse(
            row,
            row.verification_status === "APPROVED" ? "PASSED" : failed ? "FAILED" : "NOT_RUN",
            failed ? row.verification_status : null,
            row.catalog_version,
          );
        }),
      }),
    );
  });

  routes.post("/", requireOrganizationCapability("merchant:submit"), async (context) => {
    const request = merchantSubmissionRequestSchema.safeParse(await readJsonBody(context.req.raw));
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The merchant submission is invalid.");
    }
    const idempotency = await beginAdminMutation(context, "SUBMIT", request.data, 201);
    if (idempotency instanceof Response) return idempotency;

    const now = verificationDependencies.now?.() ?? new Date();
    const organization = context.get("organizationAuthorization").organization;
    const eventId = `mae_${createUlid(now.getTime())}`;
    const generation = await nextGeneration("SUBMIT", request.data.merchantId, eventId);
    const response = administrationResponse(
      {
        domain: request.data.domain,
        id: request.data.merchantId,
        last_verification_at: null,
        name: request.data.name,
        risk_tier: "LOW",
        status: "ACTIVE",
        verification_status: "SUBMITTED",
        verification_tier: "NONE",
      },
      "NOT_RUN",
      null,
      null,
    );

    try {
      await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT INTO merchants
           (id, organization_id, name, slug, legal_name, domain, status, verification_status,
            risk_tier, verification_tier, last_admin_event_id, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'SUBMITTED', 'LOW', 'NONE', ?, 0, ?, ?)`,
        ).bind(
          request.data.merchantId,
          organization.id,
          request.data.name,
          request.data.merchantId.replace(/^merchant_/u, "").replace(/_/gu, "-"),
          request.data.legalName,
          request.data.domain,
          eventId,
          now.getTime(),
          now.getTime(),
        ),
        adminEventStatement(context, {
          action: "SUBMIT",
          details: { domain: request.data.domain },
          eventId,
          merchantId: request.data.merchantId,
          nextStatus: "SUBMITTED",
          previousStatus: null,
          requestHash: idempotency.requestHash,
          idempotencyKey: idempotency.key,
          occurredAt: now,
        }),
        cacheGenerationStatement(context, generation, now),
        completeIdempotencyStatement(context, idempotency, response, 201),
      ]);
    } catch {
      const conflict = await context.env.DB.prepare(
        "SELECT id FROM merchants WHERE id = ? OR lower(domain) = lower(?) LIMIT 1",
      )
        .bind(request.data.merchantId, request.data.domain)
        .first();
      return failAdminMutation(
        context,
        idempotency,
        conflict === null ? 500 : 409,
        conflict === null ? "MERCHANT_VERIFICATION_UNAVAILABLE" : "MERCHANT_ALREADY_EXISTS",
        conflict === null
          ? "Merchant onboarding is temporarily unavailable."
          : "The merchant ID or domain is already registered.",
      );
    }
    await warmMarketplaceCache(context.env.DB, context.env.MARKETPLACE_CACHE, now.getTime()).catch(
      () => undefined,
    );
    return context.json(response, 201);
  });

  routes.post("/:merchantId/verify", requireOrganizationCapability("merchant:review"), (context) =>
    verificationMutation(context, "VERIFY", verificationDependencies),
  );
  routes.post(
    "/:merchantId/reverify",
    requireOrganizationCapability("merchant:review"),
    (context) => verificationMutation(context, "REVERIFY", verificationDependencies),
  );
  routes.post("/:merchantId/suspend", requireOrganizationCapability("merchant:review"), (context) =>
    suspendMerchant(context, verificationDependencies),
  );
  return routes;
}

export const merchantAdminRoutes = createMerchantAdminRoutes();

async function verificationMutation(
  context: Context<GatewayEnvironment>,
  action: "REVERIFY" | "VERIFY",
  dependencies: MerchantVerificationDependencies,
) {
  const emptyBody = EMPTY_BODY_SCHEMA.safeParse(await readJsonBody(context.req.raw));
  if (!emptyBody.success) {
    return apiError(context, 400, "INVALID_REQUEST", "This merchant action does not accept input.");
  }
  const merchantId = merchantIdSchema.safeParse(context.req.param("merchantId"));
  if (!merchantId.success) return resourceNotFound(context);
  const merchant = await readMerchant(context, merchantId.data);
  if (merchant === null) return resourceNotFound(context);
  if (merchant.status === "REVOKED") {
    return apiError(
      context,
      409,
      "MERCHANT_STATE_CONFLICT",
      "A revoked merchant cannot be verified.",
    );
  }

  const idempotency = await beginAdminMutation(context, action, {}, 200, merchant.id);
  if (idempotency instanceof Response) return idempotency;
  const now = dependencies.now?.() ?? new Date();
  let run: Awaited<ReturnType<typeof verifyMerchant>>;
  try {
    run = await verifyMerchant(
      {
        domain: merchant.domain,
        expectedAudience: context.env.MINDPAY_API_AUDIENCE ?? DEFAULT_MINDPAY_API_AUDIENCE,
        merchantId: merchant.id,
      },
      resolveMerchantVerificationDependencies({
        configured: dependencies,
        environment: context.env.ENVIRONMENT,
        merchant,
        signalWorks: context.env.SIGNALWORKS,
      }),
    );
  } catch {
    return failAdminMutation(
      context,
      idempotency,
      500,
      "MERCHANT_VERIFICATION_UNAVAILABLE",
      "Merchant verification is temporarily unavailable.",
    );
  }
  const eventId = `mae_${createUlid(now.getTime())}`;
  const generation = await nextGeneration(action, merchant.id, eventId);

  if (!run.valid) {
    const quarantined = run.reason.endsWith("INVALID_SIGNATURE");
    const nextStatus: VerificationStatus = quarantined ? "QUARANTINED" : "REVIEW_REQUIRED";
    const transitionPath = merchantVerificationTransitionPath(
      merchant.verification_status,
      nextStatus,
    );
    const response = administrationResponse(
      {
        ...merchant,
        last_verification_at: now.getTime(),
        status: merchant.status,
        verification_status: nextStatus,
        verification_tier: "NONE",
      },
      "FAILED",
      run.reason,
      null,
    );
    const statements = verificationCheckStatements(context, merchant.id, run.checks, now);
    statements.push(
      context.env.DB.prepare(
        `UPDATE merchants SET verification_status = ?, verification_tier = 'NONE',
         last_verification_at = ?, verification_expires_at = NULL, quarantined_at = ?,
         updated_at = ?, revision = revision + 1,
         last_admin_event_id = ? WHERE id = ? AND organization_id = ? AND revision = ?`,
      ).bind(
        nextStatus,
        now.getTime(),
        quarantined ? now.getTime() : null,
        now.getTime(),
        eventId,
        merchant.id,
        merchant.organization_id,
        merchant.revision,
      ),
      adminEventStatement(context, {
        action,
        details: { checkCount: run.checks.length, reason: run.reason, transitionPath },
        eventId,
        idempotencyKey: idempotency.key,
        merchantId: merchant.id,
        nextStatus,
        occurredAt: now,
        previousStatus: merchant.verification_status,
        requestHash: idempotency.requestHash,
      }),
      cacheGenerationStatement(context, generation, now),
      completeIdempotencyStatement(context, idempotency, response, 200),
    );
    try {
      await context.env.DB.batch(statements);
    } catch {
      return failAdminMutation(
        context,
        idempotency,
        409,
        "MERCHANT_STATE_CONFLICT",
        "The merchant changed during verification; retry with a new idempotency key.",
      );
    }
    await warmMarketplaceCache(context.env.DB, context.env.MARKETPLACE_CACHE, now.getTime()).catch(
      () => undefined,
    );
    return context.json(response);
  }

  const existingManifest = await readCurrentManifest(context.env.DB, merchant.current_manifest_id);
  const existingCatalog = await readCurrentCatalog(context.env.DB, merchant.current_catalog_id);
  const nextManifestFingerprint = await materialManifestFingerprint(
    run.manifestPublication.manifest,
  );
  const previousManifestFingerprint =
    existingManifest === null ? null : await materialManifestFingerprint(existingManifest);
  let result: "PASSED" | "MATERIAL_CHANGE" = "PASSED";
  let reason: string | null = null;

  if (
    action === "REVERIFY" &&
    previousManifestFingerprint !== null &&
    previousManifestFingerprint !== nextManifestFingerprint
  ) {
    result = "MATERIAL_CHANGE";
    reason = "MATERIAL_MANIFEST_CHANGE";
  }
  if (existingCatalog !== null) {
    const versionComparison = compareSemanticVersions(
      run.catalogPublication.catalog.version,
      existingCatalog.version,
    );
    if (
      versionComparison < 0 ||
      (versionComparison === 0 && run.catalogHash !== existingCatalog.catalog_hash)
    ) {
      result = "MATERIAL_CHANGE";
      reason = "CATALOG_VERSION_REPLAY";
    }
  }
  if (reason === null) {
    const replayReason = await detectServiceVersionReplay(
      context.env.DB,
      merchant.id,
      run.catalogPublication.catalog.services,
    );
    if (replayReason !== null) {
      result = "MATERIAL_CHANGE";
      reason = replayReason;
    }
  }

  if (result === "MATERIAL_CHANGE") {
    const transitionPath = merchantVerificationTransitionPath(
      merchant.verification_status,
      "REVIEW_REQUIRED",
    );
    const response = administrationResponse(
      {
        ...merchant,
        last_verification_at: now.getTime(),
        verification_status: "REVIEW_REQUIRED",
        verification_tier: "NONE",
      },
      result,
      reason,
      run.catalogPublication.catalog.version,
    );
    const statements = verificationCheckStatements(context, merchant.id, run.checks, now);
    statements.push(
      context.env.DB.prepare(
        `UPDATE merchants SET verification_status = 'REVIEW_REQUIRED', verification_tier = 'NONE',
         last_verification_at = ?, verification_expires_at = NULL, updated_at = ?,
         revision = revision + 1, last_admin_event_id = ?
         WHERE id = ? AND organization_id = ? AND revision = ?`,
      ).bind(
        now.getTime(),
        now.getTime(),
        eventId,
        merchant.id,
        merchant.organization_id,
        merchant.revision,
      ),
      adminEventStatement(context, {
        action,
        details: {
          catalogVersion: run.catalogPublication.catalog.version,
          reason,
          transitionPath,
        },
        eventId,
        idempotencyKey: idempotency.key,
        merchantId: merchant.id,
        nextStatus: "REVIEW_REQUIRED",
        occurredAt: now,
        previousStatus: merchant.verification_status,
        requestHash: idempotency.requestHash,
      }),
      cacheGenerationStatement(context, generation, now),
      completeIdempotencyStatement(context, idempotency, response, 200),
    );
    try {
      await context.env.DB.batch(statements);
    } catch {
      return failAdminMutation(
        context,
        idempotency,
        409,
        "MERCHANT_STATE_CONFLICT",
        "The merchant changed during verification; retry with a new idempotency key.",
      );
    }
    await warmMarketplaceCache(context.env.DB, context.env.MARKETPLACE_CACHE, now.getTime()).catch(
      () => undefined,
    );
    return context.json(response);
  }

  return approveAndIndex(context, {
    action,
    eventId,
    generation,
    idempotency,
    merchant,
    now,
    run,
  });
}

export function resolveMerchantVerificationDependencies(input: {
  readonly configured: MerchantVerificationDependencies;
  readonly environment: string;
  readonly merchant: Pick<MerchantRow, "domain" | "id">;
  readonly signalWorks: Fetcher | undefined;
}): MerchantVerificationDependencies {
  if (
    input.environment !== "development" ||
    input.merchant.id !== LOCAL_REFERENCE_MERCHANT_ID ||
    input.merchant.domain !== LOCAL_REFERENCE_MERCHANT_DOMAIN ||
    input.signalWorks === undefined
  ) {
    return input.configured;
  }

  const signalWorks = input.signalWorks;
  return Object.freeze({
    ...input.configured,
    fetchPublication:
      input.configured.fetchPublication ??
      (async (url) => {
        const publicationUrl = new URL(url);
        if (
          publicationUrl.protocol !== "https:" ||
          publicationUrl.hostname !== LOCAL_REFERENCE_MERCHANT_DOMAIN ||
          publicationUrl.port !== "" ||
          publicationUrl.search !== "" ||
          publicationUrl.hash !== "" ||
          !LOCAL_REFERENCE_PUBLICATION_PATHS.has(publicationUrl.pathname)
        ) {
          throw new Error("The local reference publication URL is not allowed");
        }
        return fetchJsonPublication(url, (request) => signalWorks.fetch(request));
      }),
    resolveHostname:
      input.configured.resolveHostname ??
      (async (hostname) => (hostname === LOCAL_REFERENCE_MERCHANT_DOMAIN ? ["8.8.8.8"] : [])),
  });
}

async function approveAndIndex(
  context: Context<GatewayEnvironment>,
  input: {
    readonly action: "REVERIFY" | "VERIFY";
    readonly eventId: string;
    readonly generation: string;
    readonly idempotency: IdempotencyClaim;
    readonly merchant: MerchantRow;
    readonly now: Date;
    readonly run: Extract<Awaited<ReturnType<typeof verifyMerchant>>, { valid: true }>;
  },
) {
  const { catalogPublication, manifestPublication } = input.run;
  const catalog = catalogPublication.catalog;
  const manifest = manifestPublication.manifest;
  const verificationExpiresAt = verificationExpiry(input.now, manifest, catalog);
  const existingManifestId = await findManifestId(
    context.env.DB,
    input.merchant.id,
    input.run.manifestHash,
  );
  const manifestId = existingManifestId ?? `mmf_${createUlid(input.now.getTime())}`;
  const existingCatalogId = await findCatalogId(
    context.env.DB,
    input.merchant.id,
    catalog.version,
    input.run.catalogHash,
  );
  const catalogId = existingCatalogId ?? `mct_${createUlid(input.now.getTime())}`;
  const existingServices = await readExistingServices(context.env.DB, input.merchant.id);
  const statements = verificationCheckStatements(
    context,
    input.merchant.id,
    input.run.checks,
    input.now,
  );

  if (existingManifestId === null) {
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO merchant_manifests
         (id, merchant_id, schema_version, manifest_json, manifest_hash, signature,
          verified_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        manifestId,
        input.merchant.id,
        manifest.schema_version,
        JSON.stringify(manifest),
        input.run.manifestHash,
        JSON.stringify(manifestPublication.signature),
        input.now.getTime(),
        Date.parse(manifest.expires_at),
        input.now.getTime(),
      ),
    );
  }
  if (existingCatalogId === null) {
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO merchant_catalogs
         (id, merchant_id, version, catalog_hash, catalog_json, signature,
          verified_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        catalogId,
        input.merchant.id,
        catalog.version,
        input.run.catalogHash,
        JSON.stringify(catalog),
        JSON.stringify(catalogPublication.signature),
        input.now.getTime(),
        Date.parse(catalog.expires_at),
        input.now.getTime(),
      ),
    );
  }

  for (const key of manifest.signing_keys) {
    const fingerprint = await sha256CanonicalJsonHex(key.public_jwk);
    for (const purpose of key.purpose) {
      statements.push(
        context.env.DB.prepare(
          `INSERT OR IGNORE INTO merchant_keys
           (id, merchant_id, kid, purpose, public_jwk, fingerprint, valid_from,
            valid_until, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `mky_${createUlid(input.now.getTime())}_${purpose}`,
          input.merchant.id,
          key.kid,
          purpose,
          JSON.stringify(key.public_jwk),
          fingerprint,
          Date.parse(key.valid_from),
          key.valid_until === undefined ? null : Date.parse(key.valid_until),
          key.revoked_at === undefined ? null : Date.parse(key.revoked_at),
          input.now.getTime(),
        ),
      );
    }
  }

  const activeExternalIds: string[] = [];
  for (const service of catalog.services) {
    activeExternalIds.push(service.service_id);
    const existing = existingServices.get(service.service_id);
    const serviceId = existing?.id ?? `service_${createUlid(input.now.getTime())}`;
    const contentHash = await sha256CanonicalJsonHex(
      JSON.parse(catalogServiceFingerprint(service)) as unknown,
    );
    const existingVersionId = await findServiceVersionId(
      context.env.DB,
      serviceId,
      service.version,
      contentHash,
    );
    const serviceVersionId = existingVersionId ?? `svr_${createUlid(input.now.getTime())}`;
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO services
         (id, merchant_id, external_id, name, description, category, status,
          current_version_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NULL, ?, ?)
         ON CONFLICT(merchant_id, external_id) DO UPDATE SET
          name = excluded.name, description = excluded.description, category = excluded.category,
          status = 'ACTIVE', updated_at = excluded.updated_at`,
      ).bind(
        serviceId,
        input.merchant.id,
        service.service_id,
        service.name,
        service.description,
        service.category,
        input.now.getTime(),
        input.now.getTime(),
      ),
    );
    if (existingVersionId === null) {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO service_versions
           (id, service_id, version, price_subunits, currency, availability,
            fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url,
            terms_url, catalog_hash, content_hash, published_at, verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          serviceVersionId,
          serviceId,
          service.version,
          service.price_subunits,
          service.currency,
          service.availability,
          service.fulfilment.type,
          service.fulfilment.tool_id,
          service.fulfilment.estimated_delivery_seconds,
          service.policy_links.privacy_url,
          service.policy_links.terms_url,
          input.run.catalogHash,
          contentHash,
          Date.parse(service.published_at),
          input.now.getTime(),
        ),
      );
    }
    statements.push(
      context.env.DB.prepare(
        "UPDATE services SET current_version_id = ?, updated_at = ? WHERE id = ? AND merchant_id = ?",
      ).bind(serviceVersionId, input.now.getTime(), serviceId, input.merchant.id),
    );
  }

  statements.push(
    retireMissingServicesStatement(context, input.merchant.id, activeExternalIds, input.now),
  );
  statements.push(
    context.env.DB.prepare(
      `UPDATE merchants SET name = ?, legal_name = ?, domain = ?, status = 'ACTIVE',
       verification_status = 'APPROVED', verification_tier = 'TEST_VERIFIED',
       current_manifest_id = ?, current_catalog_id = ?, last_verification_at = ?,
       verification_expires_at = ?, quarantined_at = NULL, updated_at = ?,
       revision = revision + 1, last_admin_event_id = ?
       WHERE id = ? AND organization_id = ? AND revision = ?`,
    ).bind(
      manifest.name,
      manifest.legal_name,
      manifest.domain,
      manifestId,
      catalogId,
      input.now.getTime(),
      verificationExpiresAt,
      input.now.getTime(),
      input.eventId,
      input.merchant.id,
      input.merchant.organization_id,
      input.merchant.revision,
    ),
  );

  const response = administrationResponse(
    {
      ...input.merchant,
      domain: manifest.domain,
      last_verification_at: input.now.getTime(),
      name: manifest.name,
      status: "ACTIVE",
      verification_status: "APPROVED",
      verification_tier: "TEST_VERIFIED",
    },
    "PASSED",
    null,
    catalog.version,
  );
  statements.push(
    adminEventStatement(context, {
      action: input.action,
      details: {
        catalogHash: input.run.catalogHash,
        catalogVersion: catalog.version,
        serviceCount: catalog.services.length,
        transitionPath: merchantVerificationTransitionPath(
          input.merchant.verification_status,
          "APPROVED",
        ),
      },
      eventId: input.eventId,
      idempotencyKey: input.idempotency.key,
      merchantId: input.merchant.id,
      nextStatus: "APPROVED",
      occurredAt: input.now,
      previousStatus: input.merchant.verification_status,
      requestHash: input.idempotency.requestHash,
    }),
    cacheGenerationStatement(context, input.generation, input.now),
    completeIdempotencyStatement(context, input.idempotency, response, 200),
  );
  try {
    await context.env.DB.batch(statements);
  } catch {
    return failAdminMutation(
      context,
      input.idempotency,
      409,
      "MERCHANT_STATE_CONFLICT",
      "The merchant changed during verification; retry with a new idempotency key.",
    );
  }
  await warmMarketplaceCache(
    context.env.DB,
    context.env.MARKETPLACE_CACHE,
    input.now.getTime(),
  ).catch(() => undefined);
  return context.json(response);
}

async function suspendMerchant(
  context: Context<GatewayEnvironment>,
  dependencies: MerchantVerificationDependencies,
) {
  const emptyBody = EMPTY_BODY_SCHEMA.safeParse(await readJsonBody(context.req.raw));
  if (!emptyBody.success) {
    return apiError(context, 400, "INVALID_REQUEST", "This merchant action does not accept input.");
  }
  const merchantId = merchantIdSchema.safeParse(context.req.param("merchantId"));
  if (!merchantId.success) return resourceNotFound(context);
  const merchant = await readMerchant(context, merchantId.data);
  if (merchant === null) return resourceNotFound(context);
  const idempotency = await beginAdminMutation(context, "SUSPEND", {}, 200, merchant.id);
  if (idempotency instanceof Response) return idempotency;
  const now = dependencies.now?.() ?? new Date();
  const eventId = `mae_${createUlid(now.getTime())}`;
  const generation = await nextGeneration("SUSPEND", merchant.id, eventId);
  const response = administrationResponse(
    {
      ...merchant,
      status: "SUSPENDED",
      verification_status: "REVIEW_REQUIRED",
      verification_tier: "NONE",
    },
    "NOT_RUN",
    null,
    null,
  );
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE merchants SET status = 'SUSPENDED', verification_status = 'REVIEW_REQUIRED',
         verification_tier = 'NONE', verification_expires_at = NULL, updated_at = ?,
         revision = revision + 1,
         last_admin_event_id = ? WHERE id = ? AND organization_id = ? AND revision = ?`,
      ).bind(now.getTime(), eventId, merchant.id, merchant.organization_id, merchant.revision),
      adminEventStatement(context, {
        action: "SUSPEND",
        details: {
          operationalStatus: "SUSPENDED",
          transitionPath: merchantVerificationTransitionPath(
            merchant.verification_status,
            "REVIEW_REQUIRED",
          ),
        },
        eventId,
        idempotencyKey: idempotency.key,
        merchantId: merchant.id,
        nextStatus: "REVIEW_REQUIRED",
        occurredAt: now,
        previousStatus: merchant.verification_status,
        requestHash: idempotency.requestHash,
      }),
      cacheGenerationStatement(context, generation, now),
      completeIdempotencyStatement(context, idempotency, response, 200),
    ]);
  } catch {
    return failAdminMutation(
      context,
      idempotency,
      409,
      "MERCHANT_STATE_CONFLICT",
      "The merchant changed while it was being suspended.",
    );
  }
  await warmMarketplaceCache(context.env.DB, context.env.MARKETPLACE_CACHE, now.getTime()).catch(
    () => undefined,
  );
  return context.json(response);
}

interface IdempotencyClaim {
  readonly key: string;
  readonly requestHash: string;
  readonly scope: string;
}

async function beginAdminMutation(
  context: Context<GatewayEnvironment>,
  action: AdminAction,
  body: unknown,
  successStatus: 200 | 201,
  merchantId = "new",
): Promise<IdempotencyClaim | Response> {
  const key = idempotencyKeySchema.safeParse(context.req.header(IDEMPOTENCY_KEY_HEADER));
  if (!key.success) {
    return apiError(
      context,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      `A valid ${IDEMPOTENCY_KEY_HEADER} header is required.`,
    );
  }
  const organization = context.get("organizationAuthorization").organization;
  const actor = context.get("principal");
  const scope = `merchant-admin:${action.toLowerCase()}:${organization.id}:${actor.id}:${merchantId}`;
  const requestHash = await sha256CanonicalJsonHex({
    action,
    body,
    merchantId,
    organizationId: organization.id,
  });
  const now = Date.now();
  await context.env.DB.prepare(
    "DELETE FROM idempotency_records WHERE scope = ? AND key = ? AND expires_at <= ?",
  )
    .bind(scope, key.data, now)
    .run();
  const inserted = await context.env.DB.prepare(
    `INSERT OR IGNORE INTO idempotency_records
     (scope, key, request_hash, state, expires_at, created_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
  )
    .bind(scope, key.data, requestHash, now + IDEMPOTENCY_TTL_MS, now)
    .run();
  if ((inserted.meta.changes ?? 0) > 0) return { key: key.data, requestHash, scope };

  const record = await context.env.DB.prepare(
    "SELECT request_hash, response_status, response_body, state FROM idempotency_records WHERE scope = ? AND key = ?",
  )
    .bind(scope, key.data)
    .first();
  const parsed = z
    .object({
      request_hash: z.string(),
      response_body: z.string().nullable(),
      response_status: z.number().nullable(),
      state: z.enum(["PENDING", "COMPLETED", "FAILED"]),
    })
    .strict()
    .nullable()
    .parse(record);
  if (parsed === null || parsed.state === "PENDING") {
    return apiError(
      context,
      409,
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "The idempotent request is still in progress.",
    );
  }
  if (parsed.request_hash !== requestHash) {
    return apiError(
      context,
      409,
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used with a different request.",
    );
  }
  if (parsed.response_body === null || parsed.response_status === null) {
    return apiError(
      context,
      500,
      "MERCHANT_VERIFICATION_UNAVAILABLE",
      "The stored response is invalid.",
    );
  }
  const storedBody = JSON.parse(parsed.response_body) as unknown;
  if (parsed.state === "FAILED") {
    return context.json(
      apiErrorResponseSchema.parse(storedBody),
      parsed.response_status as 409 | 500,
    );
  }
  return context.json(merchantAdministrationResponseSchema.parse(storedBody), successStatus);
}

function completeIdempotencyStatement(
  context: Context<GatewayEnvironment>,
  claim: IdempotencyClaim,
  response: MerchantAdministrationResponse,
  status: 200 | 201,
) {
  return context.env.DB.prepare(
    `UPDATE idempotency_records SET response_status = ?, response_body = ?, state = 'COMPLETED'
     WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'`,
  ).bind(status, JSON.stringify(response), claim.scope, claim.key, claim.requestHash);
}

async function failAdminMutation(
  context: Context<GatewayEnvironment>,
  claim: IdempotencyClaim,
  status: 409 | 500,
  code: "MERCHANT_ALREADY_EXISTS" | "MERCHANT_STATE_CONFLICT" | "MERCHANT_VERIFICATION_UNAVAILABLE",
  message: string,
) {
  const response = apiErrorResponseSchema.parse({ error: { code, message } });
  await context.env.DB.prepare(
    `UPDATE idempotency_records SET response_status = ?, response_body = ?, state = 'FAILED'
     WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'`,
  )
    .bind(status, JSON.stringify(response), claim.scope, claim.key, claim.requestHash)
    .run();
  return context.json(response, status);
}

async function readMerchant(
  context: Context<GatewayEnvironment>,
  merchantId: string,
): Promise<MerchantRow | null> {
  const organization = context.get("organizationAuthorization").organization;
  const row = await context.env.DB.prepare(
    `SELECT id, organization_id, name, legal_name, domain, status, verification_status,
      risk_tier, verification_tier, current_manifest_id, current_catalog_id,
      last_verification_at, revision FROM merchants WHERE id = ? AND organization_id = ?`,
  )
    .bind(merchantId, organization.id)
    .first();
  return row === null ? null : merchantRowSchema.parse(row);
}

function administrationResponse(
  merchant: {
    readonly domain: string;
    readonly id: string;
    readonly last_verification_at: number | null;
    readonly name: string;
    readonly risk_tier: string;
    readonly status: string;
    readonly verification_status: string;
    readonly verification_tier: string;
  },
  result: "FAILED" | "MATERIAL_CHANGE" | "NOT_RUN" | "PASSED",
  reason: string | null,
  catalogVersion: string | null,
): MerchantAdministrationResponse {
  return merchantAdministrationResponseSchema.parse({
    merchant: {
      domain: merchant.domain,
      id: merchant.id,
      name: merchant.name,
      operationalStatus: merchant.status,
      riskTier: merchant.risk_tier,
      verificationStatus: merchant.verification_status,
      verificationTier: merchant.verification_tier,
      verifiedAt:
        merchant.last_verification_at === null
          ? null
          : new Date(merchant.last_verification_at).toISOString(),
    },
    verification: { catalogVersion, reason, result },
  });
}

function adminEventStatement(
  context: Context<GatewayEnvironment>,
  input: {
    readonly action: AdminAction;
    readonly details: Readonly<Record<string, unknown>>;
    readonly eventId: string;
    readonly idempotencyKey: string;
    readonly merchantId: string;
    readonly nextStatus: VerificationStatus;
    readonly occurredAt: Date;
    readonly previousStatus: VerificationStatus | null;
    readonly requestHash: string;
  },
) {
  const organization = context.get("organizationAuthorization").organization;
  const actor = context.get("principal");
  return context.env.DB.prepare(
    `INSERT INTO merchant_admin_events
     (id, merchant_id, organization_id, actor_id, action, idempotency_key,
      request_hash, previous_verification_status, next_verification_status,
      details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.eventId,
    input.merchantId,
    organization.id,
    actor.id,
    input.action,
    input.idempotencyKey,
    input.requestHash,
    input.previousStatus,
    input.nextStatus,
    JSON.stringify(input.details),
    input.occurredAt.getTime(),
  );
}

function verificationCheckStatements(
  context: Context<GatewayEnvironment>,
  merchantId: string,
  checks: readonly MerchantVerificationCheck[],
  now: Date,
) {
  const runId = `mvr_${createUlid(now.getTime())}`;
  return checks.map((check) =>
    context.env.DB.prepare(
      `INSERT INTO merchant_verifications
       (id, merchant_id, run_id, check_type, status, reason, evidence_json, checked_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `mvc_${createUlid(now.getTime())}_${check.type.toLowerCase()}`,
      merchantId,
      runId,
      check.type,
      check.status,
      check.reason,
      JSON.stringify(check.evidence),
      now.getTime(),
      now.getTime() + MERCHANT_VERIFICATION_TTL_MS,
    ),
  );
}

function cacheGenerationStatement(
  context: Context<GatewayEnvironment>,
  generation: string,
  now: Date,
) {
  return context.env.DB.prepare(
    `INSERT INTO marketplace_cache_versions (namespace, generation, updated_at)
     VALUES ('services', ?, ?)
     ON CONFLICT(namespace) DO UPDATE SET generation = excluded.generation,
     updated_at = excluded.updated_at`,
  ).bind(generation, now.getTime());
}

async function nextGeneration(action: string, merchantId: string, eventId: string) {
  return sha256CanonicalJsonHex({ action, eventId, merchantId });
}

async function readCurrentManifest(database: D1Database, manifestId: string | null) {
  if (manifestId === null) return null;
  const row = await database
    .prepare("SELECT manifest_json FROM merchant_manifests WHERE id = ?")
    .bind(manifestId)
    .first();
  const parsed = z.object({ manifest_json: z.string() }).strict().nullable().parse(row);
  return parsed === null
    ? null
    : merchantManifestSchema.parse(JSON.parse(parsed.manifest_json) as unknown);
}

async function readCurrentCatalog(database: D1Database, catalogId: string | null) {
  if (catalogId === null) return null;
  const row = await database
    .prepare("SELECT version, catalog_hash FROM merchant_catalogs WHERE id = ?")
    .bind(catalogId)
    .first();
  return z.object({ catalog_hash: z.string(), version: z.string() }).strict().nullable().parse(row);
}

async function detectServiceVersionReplay(
  database: D1Database,
  merchantId: string,
  catalogServices: Awaited<
    ReturnType<typeof signedMerchantCatalogSchema.parse>
  >["catalog"]["services"],
): Promise<string | null> {
  for (const service of catalogServices) {
    const row = await database
      .prepare(
        `SELECT sv.content_hash FROM services s JOIN service_versions sv ON sv.service_id = s.id
         WHERE s.merchant_id = ? AND s.external_id = ? AND sv.version = ?`,
      )
      .bind(merchantId, service.service_id, service.version)
      .first();
    const parsed = z.object({ content_hash: z.string() }).strict().nullable().parse(row);
    if (parsed !== null) {
      const fingerprint = await sha256CanonicalJsonHex(
        JSON.parse(catalogServiceFingerprint(service)) as unknown,
      );
      if (fingerprint !== parsed.content_hash) return "SERVICE_VERSION_REPLAY";
    }
  }
  return null;
}

async function findManifestId(database: D1Database, merchantId: string, hash: string) {
  const row = await database
    .prepare("SELECT id FROM merchant_manifests WHERE merchant_id = ? AND manifest_hash = ?")
    .bind(merchantId, hash)
    .first();
  return z.object({ id: z.string() }).strict().nullable().parse(row)?.id ?? null;
}

async function findCatalogId(
  database: D1Database,
  merchantId: string,
  version: string,
  hash: string,
) {
  const row = await database
    .prepare(
      "SELECT id FROM merchant_catalogs WHERE merchant_id = ? AND version = ? AND catalog_hash = ?",
    )
    .bind(merchantId, version, hash)
    .first();
  return z.object({ id: z.string() }).strict().nullable().parse(row)?.id ?? null;
}

async function readExistingServices(database: D1Database, merchantId: string) {
  const result = await database
    .prepare("SELECT id, external_id FROM services WHERE merchant_id = ?")
    .bind(merchantId)
    .all();
  const rowSchema = z.object({ external_id: z.string(), id: z.string() }).strict();
  return new Map(
    result.results.map((row) => {
      const parsed = rowSchema.parse(row);
      return [parsed.external_id, parsed] as const;
    }),
  );
}

async function findServiceVersionId(
  database: D1Database,
  serviceId: string,
  version: string,
  contentHash: string,
) {
  const row = await database
    .prepare(
      "SELECT id FROM service_versions WHERE service_id = ? AND version = ? AND content_hash = ?",
    )
    .bind(serviceId, version, contentHash)
    .first();
  return z.object({ id: z.string() }).strict().nullable().parse(row)?.id ?? null;
}

function retireMissingServicesStatement(
  context: Context<GatewayEnvironment>,
  merchantId: string,
  activeExternalIds: readonly string[],
  now: Date,
) {
  const placeholders = activeExternalIds.map(() => "?").join(", ");
  return context.env.DB.prepare(
    `UPDATE services SET status = 'RETIRED', updated_at = ?
     WHERE merchant_id = ? AND external_id NOT IN (${placeholders})`,
  ).bind(now.getTime(), merchantId, ...activeExternalIds);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.trim() === "") return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function verificationExpiry(
  now: Date,
  manifest: ReturnType<typeof merchantManifestSchema.parse>,
  catalog: ReturnType<typeof signedMerchantCatalogSchema.parse>["catalog"],
): number {
  const signingKids = new Set([manifest.kid, catalog.kid]);
  const keyBoundaries = manifest.signing_keys
    .filter((key) => signingKids.has(key.kid))
    .flatMap((key) => [key.valid_until, key.revoked_at])
    .flatMap((value) => (value === undefined ? [] : [Date.parse(value)]));
  return Math.min(
    now.getTime() + MERCHANT_VERIFICATION_TTL_MS,
    Date.parse(manifest.expires_at),
    Date.parse(catalog.expires_at),
    ...keyBoundaries,
  );
}
