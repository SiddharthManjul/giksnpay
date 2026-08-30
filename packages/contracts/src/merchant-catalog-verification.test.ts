import {
  exportEs256PublicJwk,
  generateEs256KeyPair,
  signCanonicalJsonEs256,
} from "@mindpay/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { signalWorksCatalogFixture, signalWorksManifestFixture } from "./fixtures/signalworks";
import {
  es256PublicJwkSchema,
  merchantCatalogSchema,
  merchantManifestSchema,
  type SignedMerchantCatalog,
  signedMerchantCatalogSchema,
} from "./merchant";
import {
  type MerchantCatalogPublicationInput,
  verifyMerchantCatalogPublication,
} from "./merchant-catalog-verification";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");
const CATALOG_URL = "https://merchant-demo.example.com/catalog/feed.json";
const AUDIENCE = "https://api.mindpay.example/";
let publication: SignedMerchantCatalog;
let manifest: ReturnType<typeof merchantManifestSchema.parse>;

beforeAll(async () => {
  const keyPair = await generateEs256KeyPair(true);
  const kid = "catalog-verification-test";
  const publicJwk = es256PublicJwkSchema.parse(await exportEs256PublicJwk(keyPair.publicKey));
  manifest = merchantManifestSchema.parse({
    ...signalWorksManifestFixture,
    expires_at: "2026-08-31T12:00:00.000Z",
    issued_at: "2026-08-30T12:00:00.000Z",
    kid,
    signing_keys: [
      {
        kid,
        public_jwk: publicJwk,
        purpose: ["manifest", "catalog"],
        valid_from: "2026-08-30T00:00:00.000Z",
      },
    ],
  });
  const catalog = merchantCatalogSchema.parse({
    ...signalWorksCatalogFixture,
    expires_at: "2026-08-31T12:00:00.000Z",
    generated_at: "2026-08-30T12:00:00.000Z",
    issued_at: "2026-08-30T12:00:00.000Z",
    kid,
  });
  publication = signedMerchantCatalogSchema.parse({
    catalog,
    signature: await signCanonicalJsonEs256(
      catalog,
      { kid, privateKey: keyPair.privateKey, validFromEpochMs: NOW - 1 },
      NOW,
    ),
  });
});

describe("MindPay catalog publication verification", () => {
  it("verifies a strict signed INR service catalog", async () => {
    await expect(verify(publication)).resolves.toEqual({
      catalog: publication.catalog,
      valid: true,
    });
  });

  it("rejects redirects and cross-origin response URLs before body trust", async () => {
    await expect(
      verifyMerchantCatalogPublication(
        input(publication, { location: "https://evil.example/catalog", status: 302 }),
        NOW,
      ),
    ).resolves.toEqual({ reason: "REDIRECTED", valid: false });
    await expect(
      verifyMerchantCatalogPublication(
        input(publication, { responseUrl: "https://cdn.example/catalog/feed.json" }),
        NOW,
      ),
    ).resolves.toEqual({ reason: "REDIRECTED", valid: false });
  });

  it("rejects expiry, merchant mismatch, and a signed-payload mutation", async () => {
    await expect(
      verify({
        ...publication,
        catalog: {
          ...publication.catalog,
          expires_at: "2026-08-30T11:59:59.999Z",
          issued_at: "2026-08-30T11:00:00.000Z",
          generated_at: "2026-08-30T11:00:00.000Z",
        },
      }),
    ).resolves.toEqual({ reason: "EXPIRED_CATALOG", valid: false });
    await expect(
      verifyMerchantCatalogPublication(
        input(publication, { expectedMerchantId: "merchant_other" }),
        NOW,
      ),
    ).resolves.toEqual({ reason: "MERCHANT_MISMATCH", valid: false });
    await expect(
      verify({
        ...publication,
        catalog: {
          ...publication.catalog,
          services: publication.catalog.services.map((service, index) =>
            index === 0 ? { ...service, price_subunits: service.price_subunits + 100 } : service,
          ),
        },
      }),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
  });
});

function input(
  body: unknown,
  overrides: Partial<MerchantCatalogPublicationInput> = {},
): MerchantCatalogPublicationInput {
  return {
    body,
    expectedAudience: AUDIENCE,
    expectedMerchantId: "merchant_signalworks",
    expectedUrl: CATALOG_URL,
    location: null,
    manifest,
    responseUrl: CATALOG_URL,
    status: 200,
    ...overrides,
  };
}

function verify(body: unknown) {
  return verifyMerchantCatalogPublication(input(body), NOW);
}
