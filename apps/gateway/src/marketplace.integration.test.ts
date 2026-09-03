import {
  marketplaceServicesResponseSchema,
  merchantAdministrationResponseSchema,
  merchantCatalogSchema,
  merchantManifestSchema,
  merchantTrustResponseSchema,
  provisionDemoWorkspaceResponseSchema,
  type SignedMerchantCatalog,
  type SignedMerchantManifest,
  signalWorksCatalogFixture,
  signalWorksManifestFixture,
  signedMerchantCatalogSchema,
  signedMerchantManifestSchema,
} from "@mindpay/contracts";
import {
  exportEs256PublicJwk,
  generateEs256KeyPair,
  signCanonicalJsonEs256,
} from "@mindpay/crypto";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { ORGANIZATION_CONTEXT_HEADER } from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";
import { createGatewayApp } from "./index";
import { MARKETPLACE_CACHE_KEY } from "./marketplace";
import type { PublicationResponse } from "./merchant-verification";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-marketplace-auth-secret-with-at-least-32-characters";
const TEST_PASSWORD = "MindPay-Marketplace-Test-Password-2026";
const KEY_ENCRYPTION_TIME = Date.parse("2026-08-30T00:00:00.000Z");

interface TestUser {
  readonly cookie: string;
  readonly id: string;
}

describe("Gateway merchant verification and marketplace", () => {
  let bindings: GatewayAuthBindings;
  let database: D1Database;
  let currentKeyPair: Awaited<ReturnType<typeof generateEs256KeyPair>>;
  let currentNow = new Date("2026-08-30T12:00:00.000Z");
  let currentPublications: {
    catalog: SignedMerchantCatalog;
    manifest: SignedMerchantManifest;
  };
  let miniflare: Miniflare;
  let organizationId: string;
  let owner: TestUser;
  const memoryCache = createMemoryKv();
  const app = createGatewayApp({
    fetchPublication: async (url): Promise<PublicationResponse> => {
      const body = url.endsWith("/.well-known/mindpay.json")
        ? currentPublications.manifest
        : currentPublications.catalog;
      return { body, location: null, status: 200, url };
    },
    now: () => currentNow,
    resolveHostname: async () => ["8.8.8.8"],
  });

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-marketplace-test"));
    bindings = {
      AGENT_KEY_ENCRYPTION_KEY: "A".repeat(43),
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      MARKETPLACE_CACHE: memoryCache.binding,
      MINDPAY_API_AUDIENCE: "https://api.mindpay.example/",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: FRONTEND_ORIGIN,
    };
    currentKeyPair = await generateEs256KeyPair(true);
    currentPublications = await createPublications(
      currentKeyPair,
      currentNow,
      "marketplace-key-1",
      "1.0.0",
      "1.0.0",
      29_900,
    );
    owner = await createAuthenticatedUser("marketplace-owner@mindpay.test", "Marketplace Owner");
    const provision = await apiRequest(owner, "/api/v1/demo-workspaces", {
      body: JSON.stringify({ name: "Marketplace Review" }),
      headers: { [IDEMPOTENCY_KEY_HEADER]: "marketplace-workspace-0001" },
      method: "POST",
    });
    const provisioned = provisionDemoWorkspaceResponseSchema.parse(await provision.json());
    organizationId = provisioned.workspace.organization.id;
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("runs onboarding, approval, safe re-indexing, material review, quarantine, recovery, and suspension", async () => {
    const submission = {
      domain: "merchant-demo.example.com",
      legalName: "SignalWorks Research Private Limited",
      merchantId: "merchant_signalworks",
      name: "SignalWorks",
    };
    const submitted = await adminRequest(
      owner,
      "/api/v1/admin/merchants",
      "merchant-submit-idempotency-0001",
      submission,
    );
    expect(submitted.status).toBe(201);
    expect(merchantAdministrationResponseSchema.parse(await submitted.json())).toMatchObject({
      merchant: { verificationStatus: "SUBMITTED" },
    });
    const replay = await adminRequest(
      owner,
      "/api/v1/admin/merchants",
      "merchant-submit-idempotency-0001",
      submission,
    );
    expect(replay.status).toBe(201);
    expect((await marketplace()).services).toEqual([]);

    const approved = await merchantAction("verify", "merchant-verify-idempotency-0001");
    expect(approved).toMatchObject({
      merchant: { verificationStatus: "APPROVED", verificationTier: "TEST_VERIFIED" },
      verification: { catalogVersion: "1.0.0", result: "PASSED" },
    });
    expect(await merchantAction("verify", "merchant-verify-idempotency-0001")).toEqual(approved);
    const initialMarketplace = await marketplace();
    expect(initialMarketplace.services).toHaveLength(3);
    expect(initialMarketplace.services[0]).toMatchObject({
      currency: "INR",
      merchant: { id: "merchant_signalworks", verificationStatus: "APPROVED" },
      paymentRail: "razorpay:test",
    });
    expect(initialMarketplace.services.every((service) => service.protocol === "ACP")).toBe(true);
    bindings.MARKETPLACE_CACHE = createUnavailableKv();
    expect((await marketplace()).services).toHaveLength(3);
    bindings.MARKETPLACE_CACHE = memoryCache.binding;
    const firstCache = memoryCache.values.get(MARKETPLACE_CACHE_KEY);
    expect(firstCache).toBeDefined();

    const page = await publicRequest("/api/v1/marketplace/services?limit=2");
    const firstPage = marketplaceServicesResponseSchema.parse(await page.json());
    expect(firstPage.services).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await publicRequest(
      `/api/v1/marketplace/services?limit=2&cursor=${firstPage.nextCursor ?? ""}`,
    );
    expect(marketplaceServicesResponseSchema.parse(await secondPage.json()).services).toHaveLength(
      1,
    );
    const detail = await publicRequest(
      `/api/v1/marketplace/services/${initialMarketplace.services[0]?.id ?? "missing"}`,
    );
    expect(detail.status).toBe(200);
    const trust = await publicRequest("/api/v1/marketplace/merchants/merchant_signalworks");
    expect(merchantTrustResponseSchema.parse(await trust.json()).merchant).toMatchObject({
      catalogVersion: "1.0.0",
      paymentRails: ["razorpay:test"],
    });

    currentNow = new Date(currentNow.getTime() + 60_000);
    currentPublications = await createPublications(
      currentKeyPair,
      currentNow,
      "marketplace-key-1",
      "1.1.0",
      "1.1.0",
      31_900,
    );
    const safeReverification = await merchantAction("reverify", "merchant-reverify-safe-0002");
    expect(safeReverification).toMatchObject({
      merchant: { verificationStatus: "APPROVED" },
      verification: { catalogVersion: "1.1.0", result: "PASSED" },
    });
    const reindexed = await marketplace();
    expect(
      reindexed.services.find((service) => service.externalId === "market_snapshot"),
    ).toMatchObject({ priceSubunits: 31_900, version: "1.1.0" });
    expect(memoryCache.values.get(MARKETPLACE_CACHE_KEY)).not.toBe(firstCache);
    const reverificationTrust = merchantTrustResponseSchema.parse(
      await (await publicRequest("/api/v1/marketplace/merchants/merchant_signalworks")).json(),
    ).merchant;
    expect(reverificationTrust.checks.length).toBeGreaterThan(0);
    expect(new Set(reverificationTrust.checks.map((check) => check.type)).size).toBe(
      reverificationTrust.checks.length,
    );
    expect(
      reverificationTrust.checks.every((check) => check.checkedAt === currentNow.toISOString()),
    ).toBe(true);

    currentNow = new Date(currentNow.getTime() + 60_000);
    currentKeyPair = await generateEs256KeyPair(true);
    currentPublications = await createPublications(
      currentKeyPair,
      currentNow,
      "marketplace-key-2",
      "1.1.0",
      "1.1.0",
      31_900,
    );
    const materialChange = await merchantAction("reverify", "merchant-reverify-material-0003");
    expect(materialChange).toMatchObject({
      merchant: { verificationStatus: "REVIEW_REQUIRED" },
      verification: { reason: "MATERIAL_MANIFEST_CHANGE", result: "MATERIAL_CHANGE" },
    });
    expect((await marketplace()).services).toEqual([]);
    const reviewerApproval = await merchantAction("verify", "merchant-review-approve-0004");
    expect(reviewerApproval).toMatchObject({ merchant: { verificationStatus: "APPROVED" } });

    const validCatalog = currentPublications.catalog;
    currentPublications = {
      ...currentPublications,
      catalog: {
        ...validCatalog,
        catalog: {
          ...validCatalog.catalog,
          services: validCatalog.catalog.services.map((service, index) =>
            index === 0 ? { ...service, name: "Tampered Market Snapshot" } : service,
          ),
        },
      },
    };
    const staleApprovedCache = memoryCache.values.get(MARKETPLACE_CACHE_KEY);
    const quarantined = await merchantAction("reverify", "merchant-reverify-signature-0005");
    expect(quarantined).toMatchObject({
      merchant: { verificationStatus: "QUARANTINED" },
      verification: { reason: "CATALOG_INVALID_SIGNATURE", result: "FAILED" },
    });
    if (staleApprovedCache !== undefined) {
      memoryCache.values.set(MARKETPLACE_CACHE_KEY, staleApprovedCache);
    }
    expect((await marketplace()).services).toEqual([]);

    currentPublications = { ...currentPublications, catalog: validCatalog };
    expect(await merchantAction("verify", "merchant-quarantine-recovery-0006")).toMatchObject({
      merchant: { verificationStatus: "APPROVED" },
    });
    expect((await marketplace()).services).toHaveLength(3);
    currentNow = new Date(currentNow.getTime() + 24 * 60 * 60 * 1_000 + 1);
    expect((await marketplace()).services).toEqual([]);
    expect(await merchantAction("suspend", "merchant-suspend-0007")).toMatchObject({
      merchant: { operationalStatus: "SUSPENDED", verificationStatus: "REVIEW_REQUIRED" },
    });
    expect((await marketplace()).services).toEqual([]);

    await expect(
      database
        .prepare("SELECT count(*) AS count FROM merchant_admin_events WHERE merchant_id = ?")
        .bind("merchant_signalworks")
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 8 });
  });

  it("denies merchant administration to a viewer", async () => {
    const viewer = await createAuthenticatedUser(
      "marketplace-viewer@mindpay.test",
      "Marketplace Viewer",
    );
    await database
      .prepare(
        "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'VIEWER', ?)",
      )
      .bind(organizationId, viewer.id, Date.now())
      .run();
    const response = await adminRequest(
      viewer,
      "/api/v1/admin/merchants/merchant_signalworks/reverify",
      "merchant-viewer-denied-0008",
      {},
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHORIZATION_DENIED" },
    });
  });

  async function createAuthenticatedUser(email: string, name: string): Promise<TestUser> {
    const signUp = await authRequest("sign-up/email", {
      body: JSON.stringify({ email, name, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signUp.status).toBe(200);
    const signIn = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    const user = await database
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (cookie === undefined || user === null) throw new Error("Authentication setup failed");
    return { cookie, id: user.id };
  }

  function authRequest(route: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", "203.0.113.75");
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      app.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  function apiRequest(user: TestUser, path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", user.cookie);
    headers.set("origin", FRONTEND_ORIGIN);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    return Promise.resolve(app.request(`${AUTH_URL}${path}`, { ...init, headers }, bindings));
  }

  function adminRequest(
    user: TestUser,
    path: string,
    idempotencyKey: string,
    body: unknown,
  ): Promise<Response> {
    const headers = new Headers({
      [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
      [ORGANIZATION_CONTEXT_HEADER]: organizationId,
    });
    return apiRequest(user, path, { body: JSON.stringify(body), headers, method: "POST" });
  }

  async function merchantAction(action: "reverify" | "suspend" | "verify", key: string) {
    const response = await adminRequest(
      owner,
      `/api/v1/admin/merchants/merchant_signalworks/${action}`,
      key,
      {},
    );
    const body: unknown = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    return merchantAdministrationResponseSchema.parse(body);
  }

  function publicRequest(path: string) {
    return Promise.resolve(app.request(`${AUTH_URL}${path}`, undefined, bindings));
  }

  async function marketplace() {
    const response = await publicRequest("/api/v1/marketplace/services?limit=100");
    expect(response.status).toBe(200);
    return marketplaceServicesResponseSchema.parse(await response.json());
  }
});

async function createPublications(
  keyPair: Awaited<ReturnType<typeof generateEs256KeyPair>>,
  now: Date,
  kid: string,
  catalogVersion: string,
  firstServiceVersion: string,
  firstServicePrice: number,
) {
  const publicJwk = await exportEs256PublicJwk(keyPair.publicKey);
  const manifest = merchantManifestSchema.parse({
    ...signalWorksManifestFixture,
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    issued_at: now.toISOString(),
    kid,
    nonce: `manifest_nonce_${now.getTime()}`,
    signing_keys: [
      {
        kid,
        public_jwk: publicJwk,
        purpose: ["manifest", "catalog", "checkout", "event"],
        valid_from: new Date(KEY_ENCRYPTION_TIME).toISOString(),
      },
    ],
  });
  const signingKid = manifest.kid;
  const privateKey = keyPair.privateKey;
  const catalog = merchantCatalogSchema.parse({
    ...signalWorksCatalogFixture,
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    generated_at: now.toISOString(),
    issued_at: now.toISOString(),
    kid: signingKid,
    nonce: `catalog_nonce_${now.getTime()}`,
    services: signalWorksCatalogFixture.services.map((service, index) =>
      index === 0
        ? { ...service, price_subunits: firstServicePrice, version: firstServiceVersion }
        : service,
    ),
    version: catalogVersion,
  });
  return {
    catalog: signedMerchantCatalogSchema.parse({
      catalog,
      signature: await signCanonicalJsonEs256(
        catalog,
        { kid: signingKid, privateKey, validFromEpochMs: KEY_ENCRYPTION_TIME },
        now.getTime(),
      ),
    }),
    manifest: signedMerchantManifestSchema.parse({
      manifest,
      signature: await signCanonicalJsonEs256(
        manifest,
        { kid: signingKid, privateKey, validFromEpochMs: KEY_ENCRYPTION_TIME },
        now.getTime(),
      ),
    }),
  };
}

function createMemoryKv() {
  const values = new Map<string, string>();
  const binding = {
    delete: async (key: string) => {
      values.delete(key);
    },
    get: async (key: string, type?: string) => {
      const value = values.get(key) ?? null;
      return type === "json" && value !== null ? (JSON.parse(value) as unknown) : value;
    },
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  } as unknown as KVNamespace;
  return { binding, values };
}

function createUnavailableKv(): KVNamespace {
  return {
    delete: async () => {
      throw new Error("KV unavailable");
    },
    get: async () => {
      throw new Error("KV unavailable");
    },
    put: async () => {
      throw new Error("KV unavailable");
    },
  } as unknown as KVNamespace;
}
