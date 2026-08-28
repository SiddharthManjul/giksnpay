import { type ByteSource, base64UrlToBytes, bytesToBase64Url, toBytes } from "./bytes";
import { canonicalizeJson, canonicalizeJsonBytes } from "./canonical-json";
import { parseEs256PrivateJwk } from "./es256";
import { getSubtleCrypto, getWebCrypto } from "./web-crypto";

export const A256GCM_ALGORITHM = "A256GCM";
export const AES_GCM_IV_BYTE_LENGTH = 12;
export const AES_GCM_KEY_BYTE_LENGTH = 32;
export const AES_GCM_TAG_BIT_LENGTH = 128;

const PRIVATE_JWK_ENCRYPTION_PURPOSE = "mindpay:es256-private-jwk";

export type AesGcmEnvelope = Readonly<{
  algorithm: typeof A256GCM_ALGORITHM;
  ciphertext: string;
  iv: string;
  version: 1;
}>;

export class AesGcmKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AesGcmKeyError";
  }
}

export class AesGcmDecryptionError extends Error {
  constructor(message = "AES-GCM authentication or envelope validation failed") {
    super(message);
    this.name = "AesGcmDecryptionError";
  }
}

/** Generates a 256-bit AES-GCM key that is non-extractable unless explicitly requested. */
export async function generateAesGcmKey(extractable = false): Promise<CryptoKey> {
  return getSubtleCrypto().generateKey({ name: "AES-GCM", length: 256 }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

export async function importAesGcmKey(rawKey: Uint8Array, extractable = false): Promise<CryptoKey> {
  if (rawKey.length !== AES_GCM_KEY_BYTE_LENGTH) {
    throw new AesGcmKeyError("A256GCM keys must contain exactly 32 bytes");
  }

  return getSubtleCrypto().importKey("raw", Uint8Array.from(rawKey), "AES-GCM", extractable, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportAesGcmKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  assertAesGcmKey(key);
  return new Uint8Array(await getSubtleCrypto().exportKey("raw", key));
}

/** Encrypts bytes with a fresh, runtime-generated 96-bit IV. */
export async function encryptAesGcm(
  key: CryptoKey,
  plaintext: ByteSource,
  additionalData: ByteSource,
): Promise<AesGcmEnvelope> {
  assertAesGcmKey(key, "encrypt");
  const iv = randomIv();

  const ciphertext = await getSubtleCrypto().encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: toBytes(additionalData),
      tagLength: AES_GCM_TAG_BIT_LENGTH,
    },
    key,
    toBytes(plaintext),
  );

  return Object.freeze({
    algorithm: A256GCM_ALGORITHM,
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
    version: 1,
  });
}

export async function decryptAesGcm(
  key: CryptoKey,
  envelopeValue: unknown,
  additionalData: ByteSource,
): Promise<Uint8Array<ArrayBuffer>> {
  assertAesGcmKey(key, "decrypt");
  const parsed = parseAesGcmEnvelope(envelopeValue);

  try {
    const plaintext = await getSubtleCrypto().decrypt(
      {
        name: "AES-GCM",
        iv: parsed.iv,
        additionalData: toBytes(additionalData),
        tagLength: AES_GCM_TAG_BIT_LENGTH,
      },
      key,
      parsed.ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new AesGcmDecryptionError();
  }
}

/**
 * Encrypts an exportable ES256 private JWK. The context should contain stable
 * ownership fields such as agent ID and `kid`; it is authenticated, not stored.
 */
export async function encryptEs256PrivateJwk(
  encryptionKey: CryptoKey,
  privateJwk: unknown,
  context: unknown,
): Promise<AesGcmEnvelope> {
  const normalizedJwk = parseEs256PrivateJwk(privateJwk);
  return encryptAesGcm(
    encryptionKey,
    canonicalizeJsonBytes(normalizedJwk),
    privateJwkAdditionalData(context),
  );
}

export async function decryptEs256PrivateJwk(
  encryptionKey: CryptoKey,
  envelope: unknown,
  context: unknown,
): Promise<Readonly<JsonWebKey>> {
  const plaintext = await decryptAesGcm(encryptionKey, envelope, privateJwkAdditionalData(context));

  try {
    const serialized = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    const parsed: unknown = JSON.parse(serialized);
    return parseEs256PrivateJwk(parsed);
  } catch {
    throw new AesGcmDecryptionError();
  }
}

function privateJwkAdditionalData(context: unknown): Uint8Array<ArrayBuffer> {
  return canonicalizeJsonBytes({
    context,
    purpose: PRIVATE_JWK_ENCRYPTION_PURPOSE,
    version: 1,
  });
}

function parseAesGcmEnvelope(value: unknown): {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
} {
  try {
    const parsed: unknown = JSON.parse(canonicalizeJson(value));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new AesGcmDecryptionError();
    }

    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length !== 4 ||
      !keys.includes("algorithm") ||
      !keys.includes("ciphertext") ||
      !keys.includes("iv") ||
      !keys.includes("version") ||
      record.algorithm !== A256GCM_ALGORITHM ||
      record.version !== 1 ||
      typeof record.ciphertext !== "string" ||
      typeof record.iv !== "string"
    ) {
      throw new AesGcmDecryptionError();
    }

    const iv = base64UrlToBytes(record.iv);
    const ciphertext = base64UrlToBytes(record.ciphertext);
    assertIv(iv);
    if (ciphertext.length < AES_GCM_TAG_BIT_LENGTH / 8) {
      throw new AesGcmDecryptionError();
    }

    return { ciphertext, iv };
  } catch (error) {
    if (error instanceof AesGcmDecryptionError) {
      throw error;
    }
    throw new AesGcmDecryptionError();
  }
}

function randomIv(): Uint8Array<ArrayBuffer> {
  return getWebCrypto().getRandomValues(new Uint8Array(AES_GCM_IV_BYTE_LENGTH));
}

function assertIv(iv: Uint8Array): void {
  if (iv.length !== AES_GCM_IV_BYTE_LENGTH) {
    throw new AesGcmKeyError("AES-GCM IVs must contain exactly 12 bytes");
  }
}

function assertAesGcmKey(key: CryptoKey, requiredUsage?: "decrypt" | "encrypt"): void {
  if (
    key.type !== "secret" ||
    key.algorithm.name !== "AES-GCM" ||
    !("length" in key.algorithm) ||
    key.algorithm.length !== 256 ||
    (requiredUsage !== undefined && !key.usages.includes(requiredUsage))
  ) {
    throw new AesGcmKeyError(
      `Expected a 256-bit AES-GCM key${requiredUsage === undefined ? "" : ` with ${requiredUsage} usage`}`,
    );
  }
}
