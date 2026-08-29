import {
  exportEs256PublicJwk,
  generateEs256KeyPair,
  signCanonicalJsonEs256,
} from "@mindpay/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { signalWorksManifestFixture } from "./fixtures/signalworks";
import {
  es256PublicJwkSchema,
  merchantManifestSchema,
  type SignedMerchantManifest,
  signedMerchantManifestSchema,
} from "./merchant";
import {
  type MerchantManifestPublicationInput,
  verifyMerchantManifestPublication,
} from "./merchant-manifest-verification";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");
const EXPECTED_URL = "https://merchant-demo.example.com/.well-known/mindpay.json";
const EXPECTED_AUDIENCE = "https://api.mindpay.example/";

let validPublication: SignedMerchantManifest;

beforeAll(async () => {
  const keyPair = await generateEs256KeyPair(true);
  const kid = "signalworks.manifest.contract-test";
  const manifest = merchantManifestSchema.parse({
    ...signalWorksManifestFixture,
    expires_at: "2026-08-31T12:00:00.000Z",
    issued_at: "2026-08-30T12:00:00.000Z",
    kid,
    nonce: "manifest_contract_test_0001",
    signing_keys: [
      {
        kid,
        public_jwk: es256PublicJwkSchema.parse(await exportEs256PublicJwk(keyPair.publicKey)),
        purpose: ["manifest"],
        valid_from: "2026-08-30T00:00:00.000Z",
      },
    ],
  });
  const signature = await signCanonicalJsonEs256(
    manifest,
    { kid, privateKey: keyPair.privateKey, validFromEpochMs: Date.parse("2026-08-30T00:00:00Z") },
    NOW,
  );
  validPublication = signedMerchantManifestSchema.parse({ manifest, signature });
});

describe("MindPay manifest publication verification", () => {
  it("verifies a canonical signed manifest", async () => {
    await expect(verify(validPublication)).resolves.toEqual({
      manifest: validPublication.manifest,
      valid: true,
    });
  });

  it("rejects redirects before trusting a response body", async () => {
    await expect(
      verifyMerchantManifestPublication(
        publicationInput(validPublication, {
          location: "https://evil.example.com/.well-known/mindpay.json",
          status: 302,
        }),
        NOW,
      ),
    ).resolves.toEqual({ reason: "REDIRECTED", valid: false });
    await expect(
      verifyMerchantManifestPublication(
        publicationInput(validPublication, {
          responseUrl: "https://cdn.example.com/.well-known/mindpay.json",
        }),
        NOW,
      ),
    ).resolves.toEqual({ reason: "REDIRECTED", valid: false });
  });

  it("rejects a coherently changed merchant domain", async () => {
    const manifest = {
      ...validPublication.manifest,
      acp_base_url: "https://evil.example.com/",
      catalog_url: "https://evil.example.com/catalog/feed.json",
      domain: "evil.example.com",
      issuer: "https://evil.example.com/",
      mcp_url: "https://evil.example.com/mcp",
    };

    await expect(verify({ ...validPublication, manifest })).resolves.toEqual({
      reason: "DOMAIN_MISMATCH",
      valid: false,
    });
  });

  it("rejects an expired manifest", async () => {
    const manifest = {
      ...validPublication.manifest,
      expires_at: "2026-08-30T11:59:59.999Z",
      issued_at: "2026-08-30T11:00:00.000Z",
    };

    await expect(verify({ ...validPublication, manifest })).resolves.toEqual({
      reason: "EXPIRED_MANIFEST",
      valid: false,
    });
  });

  it("rejects a one-byte payload mutation", async () => {
    const manifest = {
      ...validPublication.manifest,
      name: "SignalWorkt",
    };

    await expect(verify({ ...validPublication, manifest })).resolves.toEqual({
      reason: "INVALID_SIGNATURE",
      valid: false,
    });
  });
});

function publicationInput(
  body: unknown,
  overrides: Partial<MerchantManifestPublicationInput> = {},
): MerchantManifestPublicationInput {
  return {
    body,
    expectedAudience: EXPECTED_AUDIENCE,
    expectedUrl: EXPECTED_URL,
    location: null,
    responseUrl: EXPECTED_URL,
    status: 200,
    ...overrides,
  };
}

function verify(body: unknown) {
  return verifyMerchantManifestPublication(publicationInput(body), NOW);
}
