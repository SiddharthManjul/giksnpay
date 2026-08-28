import { describe, expect, it } from "vitest";
import {
  AES_GCM_IV_BYTE_LENGTH,
  AES_GCM_KEY_BYTE_LENGTH,
  AesGcmDecryptionError,
  AesGcmKeyError,
  decryptAesGcm,
  decryptEs256PrivateJwk,
  encryptAesGcm,
  encryptEs256PrivateJwk,
  exportAesGcmKey,
  generateAesGcmKey,
  importAesGcmKey,
} from "./aes-gcm";
import { base64UrlToBytes, bytesToBase64Url, hexToBytes } from "./bytes";
import {
  exportEs256PrivateJwk,
  generateEs256KeyPair,
  importEs256PrivateJwk,
  signEs256,
  verifyEs256,
} from "./es256";

describe("A256GCM", () => {
  it("decrypts the NIST AES-256-GCM zero-key vector", async () => {
    const key = await importAesGcmKey(new Uint8Array(AES_GCM_KEY_BYTE_LENGTH));
    const envelope = {
      algorithm: "A256GCM",
      ciphertext: bytesToBase64Url(
        hexToBytes("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919"),
      ),
      iv: bytesToBase64Url(new Uint8Array(AES_GCM_IV_BYTE_LENGTH)),
      version: 1,
    };

    await expect(decryptAesGcm(key, envelope, new Uint8Array())).resolves.toEqual(
      new Uint8Array(16),
    );
  });

  it("generates and explicitly exports 256-bit keys", async () => {
    const key = await generateAesGcmKey(true);
    expect(await exportAesGcmKey(key)).toHaveLength(AES_GCM_KEY_BYTE_LENGTH);
  });

  it("uses a fresh 96-bit IV for each encryption", async () => {
    const key = await generateAesGcmKey();
    const first = await encryptAesGcm(key, "private material", "agent-1");
    const second = await encryptAesGcm(key, "private material", "agent-1");

    expect(base64UrlToBytes(first.iv)).toHaveLength(AES_GCM_IV_BYTE_LENGTH);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects wrong key lengths", async () => {
    await expect(importAesGcmKey(new Uint8Array(16))).rejects.toBeInstanceOf(AesGcmKeyError);
  });

  it("fails authentication for ciphertext, IV, context, and key mutations", async () => {
    const key = await generateAesGcmKey();
    const wrongKey = await generateAesGcmKey();
    const envelope = await encryptAesGcm(key, "private material", "agent-1");

    const ciphertext = base64UrlToBytes(envelope.ciphertext);
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    const changedCiphertext = { ...envelope, ciphertext: bytesToBase64Url(ciphertext) };

    const iv = base64UrlToBytes(envelope.iv);
    iv[0] = (iv[0] ?? 0) ^ 1;
    const changedIv = { ...envelope, iv: bytesToBase64Url(iv) };

    await expect(decryptAesGcm(key, changedCiphertext, "agent-1")).rejects.toBeInstanceOf(
      AesGcmDecryptionError,
    );
    await expect(decryptAesGcm(key, changedIv, "agent-1")).rejects.toBeInstanceOf(
      AesGcmDecryptionError,
    );
    await expect(decryptAesGcm(key, envelope, "agent-2")).rejects.toBeInstanceOf(
      AesGcmDecryptionError,
    );
    await expect(decryptAesGcm(wrongKey, envelope, "agent-1")).rejects.toBeInstanceOf(
      AesGcmDecryptionError,
    );
  });

  it("rejects malformed or extended envelopes", async () => {
    const key = await generateAesGcmKey();
    const envelope = await encryptAesGcm(key, "private material", "agent-1");

    await expect(
      decryptAesGcm(key, { ...envelope, algorithm: "AES-CBC" }, "agent-1"),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
    await expect(
      decryptAesGcm(key, { ...envelope, extra: true }, "agent-1"),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
    await expect(
      decryptAesGcm(key, { ...envelope, ciphertext: "not+base64" }, "agent-1"),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
    await expect(
      decryptAesGcm(key, { ...envelope, iv: bytesToBase64Url(new Uint8Array(8)) }, "agent-1"),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
  });
});

describe("encrypted ES256 private JWK storage", () => {
  it("round-trips a private JWK and preserves its signing capability", async () => {
    const signingPair = await generateEs256KeyPair(true);
    const privateJwk = await exportEs256PrivateJwk(signingPair.privateKey);
    const encryptionKey = await generateAesGcmKey();
    const context = { agentId: "agent_01", kid: "sig-2026-01" };
    const envelope = await encryptEs256PrivateJwk(encryptionKey, privateJwk, context);
    const decrypted = await decryptEs256PrivateJwk(encryptionKey, envelope, {
      kid: "sig-2026-01",
      agentId: "agent_01",
    });

    expect(decrypted).toEqual(privateJwk);
    const importedPrivateKey = await importEs256PrivateJwk(decrypted);
    const message = new TextEncoder().encode("closed mandate");
    const signature = await signEs256(importedPrivateKey, message);
    expect(await verifyEs256(signingPair.publicKey, message, signature)).toBe(true);
  });

  it("binds encrypted key material to the complete associated context", async () => {
    const signingPair = await generateEs256KeyPair(true);
    const privateJwk = await exportEs256PrivateJwk(signingPair.privateKey);
    const encryptionKey = await generateAesGcmKey();
    const envelope = await encryptEs256PrivateJwk(encryptionKey, privateJwk, {
      agentId: "agent_01",
      kid: "sig-2026-01",
    });

    await expect(
      decryptEs256PrivateJwk(encryptionKey, envelope, { agentId: "agent_02", kid: "sig-2026-01" }),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
    await expect(
      decryptEs256PrivateJwk(encryptionKey, envelope, { agentId: "agent_01", kid: "sig-2026-02" }),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
  });
});
