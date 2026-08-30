import { signedMerchantCatalogSchema } from "@mindpay/contracts";
import { importEs256PublicJwk, verifyCanonicalJsonEs256 } from "@mindpay/crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SIGNALWORKS_CATALOG_TTL_MS } from "./catalog";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "./identity";
import { createMerchantApp, type MerchantBindings } from "./index";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_CATALOG_URL } from "./publication";
import { seedSignalWorksServiceVersions } from "./services";
import { createSignalWorksTestDatabase, type SignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);
const CATALOG_NONCE = "catalog_nonce_000001";

let testDatabase: SignalWorksTestDatabase | undefined;

afterEach(async () => {
  await testDatabase?.miniflare.dispose();
  testDatabase = undefined;
});

describe("SignalWorks signed catalog feed", () => {
  it("publishes stable three-service versions signed only by the catalog key", async () => {
    testDatabase = await createSignalWorksTestDatabase("signalworks-catalog-publication");
    const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
    const identity = await seedSignalWorksIdentity(
      testDatabase.database,
      keyEncryptionKey,
      new Date("2026-08-27T00:00:00.000Z"),
    );
    await seedSignalWorksServiceVersions(testDatabase.database);
    const bindings: MerchantBindings = {
      DB: testDatabase.database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
      SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
    };
    const app = createMerchantApp({
      createCatalogNonce: () => CATALOG_NONCE,
      now: () => NOW,
    });

    const response = await app.request(SIGNALWORKS_CATALOG_URL, undefined, bindings);
    const body: unknown = await response.json();
    const publication = signedMerchantCatalogSchema.parse(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(publication.catalog).toMatchObject({
      audience: MINDPAY_API_AUDIENCE,
      catalog_id: "catalog_signalworks",
      generated_at: NOW.toISOString(),
      issued_at: NOW.toISOString(),
      issuer: "https://merchant-demo.example.com/",
      nonce: CATALOG_NONCE,
      schema_version: "1",
      seller: {
        domain: "merchant-demo.example.com",
        merchant_id: "merchant_signalworks",
        name: "SignalWorks",
      },
      version: "1.0.0",
    });
    expect(Date.parse(publication.catalog.expires_at) - NOW.getTime()).toBe(
      SIGNALWORKS_CATALOG_TTL_MS,
    );
    expect(
      publication.catalog.services.map((service) => [
        service.service_id,
        service.version,
        service.price_subunits,
        service.fulfilment.tool_id,
      ]),
    ).toEqual([
      ["market_snapshot", "1.0.0", 29_900, "redeem_market_snapshot"],
      ["detailed_competitor_dossier", "1.0.0", 44_900, "redeem_competitor_dossier"],
      ["enterprise_intelligence_pack", "1.0.0", 79_900, "redeem_enterprise_intelligence"],
    ]);

    const catalogKey = identity.signingKeys.find((key) => key.kid === publication.signature.kid);
    expect(catalogKey?.purpose).toEqual(["catalog"]);
    if (catalogKey === undefined) {
      throw new Error("Missing catalog verification key");
    }
    const verificationKey = {
      kid: catalogKey.kid,
      publicKey: await importEs256PublicJwk(catalogKey.public_jwk),
      validFromEpochMs: Date.parse(catalogKey.valid_from),
    };
    await expect(
      verifyCanonicalJsonEs256(
        publication.catalog,
        publication.signature,
        [verificationKey],
        NOW.getTime(),
      ),
    ).resolves.toEqual({ kid: catalogKey.kid, valid: true });

    const changedCatalog = {
      ...publication.catalog,
      services: publication.catalog.services.map((service, index) =>
        index === 0 ? { ...service, name: "Market Snapshou" } : service,
      ),
    };
    await expect(
      verifyCanonicalJsonEs256(
        changedCatalog,
        publication.signature,
        [verificationKey],
        NOW.getTime(),
      ),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
  });

  it("keeps service identity, price, version, and publication time stable across refreshes", async () => {
    testDatabase = await createSignalWorksTestDatabase("signalworks-catalog-refresh");
    const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
    await seedSignalWorksIdentity(
      testDatabase.database,
      keyEncryptionKey,
      new Date("2026-08-27T00:00:00.000Z"),
    );
    await seedSignalWorksServiceVersions(testDatabase.database);
    const bindings: MerchantBindings = {
      DB: testDatabase.database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
      SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
    };
    const firstApp = createMerchantApp({
      createCatalogNonce: () => CATALOG_NONCE,
      now: () => NOW,
    });
    const secondApp = createMerchantApp({
      createCatalogNonce: () => "catalog_nonce_000002",
      now: () => new Date(NOW.getTime() + 60 * 60 * 1_000),
    });

    const first = signedMerchantCatalogSchema.parse(
      await (await firstApp.request(SIGNALWORKS_CATALOG_URL, undefined, bindings)).json(),
    );
    const second = signedMerchantCatalogSchema.parse(
      await (await secondApp.request(SIGNALWORKS_CATALOG_URL, undefined, bindings)).json(),
    );

    expect(second.catalog.services).toEqual(first.catalog.services);
    expect(second.catalog.generated_at).not.toBe(first.catalog.generated_at);
    expect(second.catalog.nonce).not.toBe(first.catalog.nonce);
  });
});
