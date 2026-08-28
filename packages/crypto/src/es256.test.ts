import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url, toBytes } from "./bytes";
import {
  ES256_SIGNATURE_BYTE_LENGTH,
  Es256KeyError,
  Es256KeyUnavailableError,
  type Es256SigningKey,
  type Es256VerificationKey,
  exportEs256PrivateJwk,
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importEs256PrivateJwk,
  importEs256PublicJwk,
  parseEs256PublicJwk,
  signCanonicalJsonEs256,
  signEs256,
  verifyCanonicalJsonEs256,
  verifyEs256,
} from "./es256";

const ACTIVE_AT = 1_800_000_000_000;

describe("ES256 primitives and JWKs", () => {
  it("generates, exports, imports, signs, and verifies P-256 keys", async () => {
    const generated = await generateEs256KeyPair(true);
    const publicJwk = await exportEs256PublicJwk(generated.publicKey);
    const privateJwk = await exportEs256PrivateJwk(generated.privateKey);

    expect(publicJwk).not.toHaveProperty("d");
    expect(privateJwk).toHaveProperty("d");
    expect(Object.isFrozen(publicJwk)).toBe(true);
    expect(Object.isFrozen(privateJwk)).toBe(true);

    const importedPublicKey = await importEs256PublicJwk(publicJwk);
    const importedPrivateKey = await importEs256PrivateJwk(privateJwk);
    const signature = await signEs256(importedPrivateKey, toBytes("mindpay"));

    expect(signature).toHaveLength(ES256_SIGNATURE_BYTE_LENGTH);
    expect(await verifyEs256(importedPublicKey, toBytes("mindpay"), signature)).toBe(true);
  });

  it("rejects one-byte message and signature mutations", async () => {
    const generated = await generateEs256KeyPair();
    const message = toBytes("canonical payload");
    const signature = await signEs256(generated.privateKey, message);
    const mutatedSignature = Uint8Array.from(signature);
    mutatedSignature[0] = (mutatedSignature[0] ?? 0) ^ 1;

    expect(await verifyEs256(generated.publicKey, toBytes("canonical payloae"), signature)).toBe(
      false,
    );
    expect(await verifyEs256(generated.publicKey, message, mutatedSignature)).toBe(false);
    expect(await verifyEs256(generated.publicKey, message, signature.slice(1))).toBe(false);
  });

  it("rejects private material in public JWKs and incompatible curves", async () => {
    const generated = await generateEs256KeyPair(true);
    const privateJwk = await exportEs256PrivateJwk(generated.privateKey);
    const publicJwk = await exportEs256PublicJwk(generated.publicKey);

    expect(() => parseEs256PublicJwk(privateJwk)).toThrow(/private key material/);
    expect(() => parseEs256PublicJwk({ ...publicJwk, crv: "P-384" })).toThrow(Es256KeyError);
  });
});

describe("canonical ES256 signatures and key rotation", () => {
  it("verifies canonical payloads independently of insertion order", async () => {
    const generated = await generateEs256KeyPair();
    const signingKey = createSigningKey("sig-2026-01", generated.privateKey);
    const verificationKey = createVerificationKey("sig-2026-01", generated.publicKey);
    const signature = await signCanonicalJsonEs256(
      { currency: "INR", amountSubunits: 29_900 },
      signingKey,
      ACTIVE_AT,
    );

    await expect(
      verifyCanonicalJsonEs256(
        { amountSubunits: 29_900, currency: "INR" },
        signature,
        [verificationKey],
        ACTIVE_AT,
      ),
    ).resolves.toEqual({ kid: "sig-2026-01", valid: true });

    await expect(
      verifyCanonicalJsonEs256(
        { amountSubunits: 29_901, currency: "INR" },
        signature,
        [verificationKey],
        ACTIVE_AT,
      ),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
  });

  it("binds the algorithm and key ID into the signed bytes", async () => {
    const first = await generateEs256KeyPair();
    const second = await generateEs256KeyPair();
    const signature = await signCanonicalJsonEs256(
      { approved: true },
      createSigningKey("sig-old", first.privateKey),
      ACTIVE_AT,
    );

    const changedKid = { ...signature, kid: "sig-new" };
    const unsupportedAlgorithm = { ...signature, alg: "none" };
    const keys = [
      createVerificationKey("sig-old", first.publicKey),
      createVerificationKey("sig-new", second.publicKey),
    ];

    await expect(
      verifyCanonicalJsonEs256({ approved: true }, changedKid, keys, ACTIVE_AT),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
    await expect(
      verifyCanonicalJsonEs256({ approved: true }, unsupportedAlgorithm, keys, ACTIVE_AT),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
  });

  it("accepts both active keys during a planned overlap", async () => {
    const oldPair = await generateEs256KeyPair();
    const newPair = await generateEs256KeyPair();
    const oldSigningKey = createSigningKey("sig-old", oldPair.privateKey, {
      validFromEpochMs: ACTIVE_AT - 2_000,
      validUntilEpochMs: ACTIVE_AT + 1_000,
    });
    const newSigningKey = createSigningKey("sig-new", newPair.privateKey, {
      validFromEpochMs: ACTIVE_AT - 1_000,
      validUntilEpochMs: ACTIVE_AT + 2_000,
    });
    const keys = [
      createVerificationKey("sig-old", oldPair.publicKey, oldSigningKey),
      createVerificationKey("sig-new", newPair.publicKey, newSigningKey),
    ];

    const oldSignature = await signCanonicalJsonEs256({ event: "old" }, oldSigningKey, ACTIVE_AT);
    const newSignature = await signCanonicalJsonEs256({ event: "new" }, newSigningKey, ACTIVE_AT);

    await expect(
      verifyCanonicalJsonEs256({ event: "old" }, oldSignature, keys, ACTIVE_AT),
    ).resolves.toEqual({ kid: "sig-old", valid: true });
    await expect(
      verifyCanonicalJsonEs256({ event: "new" }, newSignature, keys, ACTIVE_AT),
    ).resolves.toEqual({ kid: "sig-new", valid: true });
  });

  it("rejects revoked keys even when their older signature was valid", async () => {
    const generated = await generateEs256KeyPair();
    const signingKey = createSigningKey("sig-revoked", generated.privateKey);
    const signature = await signCanonicalJsonEs256({ event: 1 }, signingKey, ACTIVE_AT);
    const revokedKey = createVerificationKey("sig-revoked", generated.publicKey, {
      validFromEpochMs: ACTIVE_AT - 1_000,
      revokedAtEpochMs: ACTIVE_AT + 1,
    });

    await expect(
      verifyCanonicalJsonEs256({ event: 1 }, signature, [revokedKey], ACTIVE_AT + 1),
    ).resolves.toEqual({ kid: "sig-revoked", reason: "REVOKED_KEY", valid: false });
  });

  it("prevents revoked keys from creating new signatures", async () => {
    const generated = await generateEs256KeyPair();
    const revokedSigningKey = createSigningKey("sig-revoked", generated.privateKey, {
      validFromEpochMs: ACTIVE_AT - 1_000,
      revokedAtEpochMs: ACTIVE_AT,
    });

    await expect(
      signCanonicalJsonEs256({ event: 1 }, revokedSigningKey, ACTIVE_AT),
    ).rejects.toBeInstanceOf(Es256KeyUnavailableError);
  });

  it("reports unknown, not-yet-valid, and expired keys without fallback", async () => {
    const generated = await generateEs256KeyPair();
    const lifecycle = {
      validFromEpochMs: ACTIVE_AT - 1_000,
      validUntilEpochMs: ACTIVE_AT + 1_000,
    } as const;
    const signature = await signCanonicalJsonEs256(
      { event: 1 },
      createSigningKey("sig-windowed", generated.privateKey, lifecycle),
      ACTIVE_AT,
    );
    const verificationKey = createVerificationKey("sig-windowed", generated.publicKey, lifecycle);

    await expect(verifyCanonicalJsonEs256({ event: 1 }, signature, [], ACTIVE_AT)).resolves.toEqual(
      { kid: "sig-windowed", reason: "UNKNOWN_KEY", valid: false },
    );
    await expect(
      verifyCanonicalJsonEs256({ event: 1 }, signature, [verificationKey], ACTIVE_AT - 1_001),
    ).resolves.toEqual({
      kid: "sig-windowed",
      reason: "KEY_NOT_YET_VALID",
      valid: false,
    });
    await expect(
      verifyCanonicalJsonEs256({ event: 1 }, signature, [verificationKey], ACTIVE_AT + 1_000),
    ).resolves.toEqual({ kid: "sig-windowed", reason: "EXPIRED_KEY", valid: false });
  });

  it("rejects malformed envelopes and one-byte signature mutations", async () => {
    const generated = await generateEs256KeyPair();
    const signingKey = createSigningKey("sig-1", generated.privateKey);
    const verificationKey = createVerificationKey("sig-1", generated.publicKey);
    const signature = await signCanonicalJsonEs256({ event: 1 }, signingKey, ACTIVE_AT);
    const signatureBytes = base64UrlToBytes(signature.signature);
    signatureBytes[signatureBytes.length - 1] =
      (signatureBytes[signatureBytes.length - 1] ?? 0) ^ 1;
    const mutated = { ...signature, signature: bytesToBase64Url(signatureBytes) };

    await expect(
      verifyCanonicalJsonEs256({ event: 1 }, mutated, [verificationKey], ACTIVE_AT),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
    await expect(
      verifyCanonicalJsonEs256(
        { event: 1 },
        { ...signature, signature: "invalid+base64" },
        [verificationKey],
        ACTIVE_AT,
      ),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
    await expect(
      verifyCanonicalJsonEs256(
        { event: 1 },
        { ...signature, extra: true },
        [verificationKey],
        ACTIVE_AT,
      ),
    ).resolves.toEqual({ reason: "INVALID_SIGNATURE", valid: false });
  });
});

function createSigningKey(
  kid: string,
  privateKey: CryptoKey,
  lifecycle: {
    validFromEpochMs: number;
    validUntilEpochMs?: number;
    revokedAtEpochMs?: number;
  } = { validFromEpochMs: ACTIVE_AT - 1_000 },
): Es256SigningKey {
  return { kid, privateKey, ...lifecycle };
}

function createVerificationKey(
  kid: string,
  publicKey: CryptoKey,
  lifecycle: {
    validFromEpochMs: number;
    validUntilEpochMs?: number;
    revokedAtEpochMs?: number;
  } = { validFromEpochMs: ACTIVE_AT - 1_000 },
): Es256VerificationKey {
  return { kid, publicKey, ...lifecycle };
}
