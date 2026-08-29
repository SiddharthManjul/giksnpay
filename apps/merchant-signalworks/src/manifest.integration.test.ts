import {
  signedMerchantManifestSchema,
  verifyMerchantManifestPublication,
} from "@mindpay/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "./identity";
import { createMerchantApp, type MerchantBindings } from "./index";
import { SIGNALWORKS_MANIFEST_TTL_MS } from "./manifest";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_MANIFEST_URL } from "./publication";
import { createSignalWorksTestDatabase, type SignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);
const MANIFEST_NONCE = "manifest_nonce_0001";

let testDatabase: SignalWorksTestDatabase | undefined;

afterEach(async () => {
  await testDatabase?.miniflare.dispose();
  testDatabase = undefined;
});

describe("SignalWorks well-known manifest", () => {
  it("publishes an exact-origin canonical manifest signed by the persisted manifest key", async () => {
    testDatabase = await createSignalWorksTestDatabase("signalworks-manifest-publication");
    const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
    await seedSignalWorksIdentity(
      testDatabase.database,
      keyEncryptionKey,
      new Date("2026-08-30T00:00:00.000Z"),
    );
    const app = createMerchantApp({
      createManifestNonce: () => MANIFEST_NONCE,
      now: () => NOW,
    });
    const bindings: MerchantBindings = {
      DB: testDatabase.database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
    };

    const response = await app.request(SIGNALWORKS_MANIFEST_URL, undefined, bindings);
    const body: unknown = await response.json();
    const publication = signedMerchantManifestSchema.parse(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(publication.manifest).toMatchObject({
      acp_base_url: "https://merchant-demo.example.com/",
      audience: MINDPAY_API_AUDIENCE,
      catalog_url: "https://merchant-demo.example.com/catalog/feed.json",
      domain: "merchant-demo.example.com",
      issuer: "https://merchant-demo.example.com/",
      legal_name: "SignalWorks Research Private Limited",
      mcp_url: "https://merchant-demo.example.com/mcp",
      merchant_id: "merchant_signalworks",
      name: "SignalWorks",
      nonce: MANIFEST_NONCE,
      payment_rails: ["razorpay:test"],
      schema_version: "1",
    });
    expect(Date.parse(publication.manifest.expires_at) - NOW.getTime()).toBe(
      SIGNALWORKS_MANIFEST_TTL_MS,
    );
    expect(publication.manifest.signing_keys.map((key) => key.purpose)).toEqual([
      ["catalog"],
      ["checkout"],
      ["event"],
      ["manifest"],
    ]);
    expect(publication.manifest.signing_keys).toHaveLength(4);
    expect(JSON.stringify(publication)).not.toContain('"d"');
    expect(publication.signature.kid).toBe(publication.manifest.kid);

    await expect(
      verifyMerchantManifestPublication(
        {
          body,
          expectedAudience: MINDPAY_API_AUDIENCE,
          expectedUrl: SIGNALWORKS_MANIFEST_URL,
          location: response.headers.get("location"),
          responseUrl: SIGNALWORKS_MANIFEST_URL,
          status: response.status,
        },
        NOW.getTime(),
      ),
    ).resolves.toEqual({ manifest: publication.manifest, valid: true });
  });

  it("does not redirect similar or unknown paths to the trust endpoint", async () => {
    const app = createMerchantApp({
      createManifestNonce: () => MANIFEST_NONCE,
      now: () => NOW,
    });
    const bindings: MerchantBindings = {
      DB: {} as D1Database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
    };

    for (const path of ["/.well-known/mindpay.json/", "/mindpay.json", "/.well-known/mindpay"]) {
      const response = await app.request(path, undefined, bindings);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("location"), path).toBeNull();
    }
  });
});
