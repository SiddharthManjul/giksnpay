import { canonicalizeJsonBytes } from "./canonical-json";
import { BinaryEncodingError, type ByteSource, bytesToHex, hexToBytes, toBytes } from "./bytes";
import { getSubtleCrypto } from "./web-crypto";

export const SHA_256_BYTE_LENGTH = 32;
export const SHA_256_HEX_LENGTH = SHA_256_BYTE_LENGTH * 2;

export async function sha256(value: ByteSource): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await getSubtleCrypto().digest("SHA-256", toBytes(value));
  return new Uint8Array(digest);
}

export async function sha256Hex(value: ByteSource): Promise<string> {
  return bytesToHex(await sha256(value));
}

export async function sha256CanonicalJson(value: unknown): Promise<Uint8Array<ArrayBuffer>> {
  return sha256(canonicalizeJsonBytes(value));
}

export async function sha256CanonicalJsonHex(value: unknown): Promise<string> {
  return bytesToHex(await sha256CanonicalJson(value));
}

/** Computes HMAC-SHA256. String keys and messages are encoded as UTF-8. */
export async function hmacSha256(
  key: ByteSource,
  message: ByteSource,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await importHmacKey(key, ["sign"]);
  const signature = await getSubtleCrypto().sign("HMAC", cryptoKey, toBytes(message));
  return new Uint8Array(signature);
}

export async function hmacSha256Hex(key: ByteSource, message: ByteSource): Promise<string> {
  return bytesToHex(await hmacSha256(key, message));
}

/** Uses Web Crypto's native HMAC verifier instead of comparing signature strings. */
export async function verifyHmacSha256(
  key: ByteSource,
  message: ByteSource,
  signature: Uint8Array,
): Promise<boolean> {
  const cryptoKey = await importHmacKey(key, ["verify"]);
  return getSubtleCrypto().verify("HMAC", cryptoKey, Uint8Array.from(signature), toBytes(message));
}

/** Malformed hexadecimal is an invalid signature, not an exceptional verification failure. */
export async function verifyHmacSha256Hex(
  key: ByteSource,
  message: ByteSource,
  signatureHex: string,
): Promise<boolean> {
  try {
    return await verifyHmacSha256(key, message, hexToBytes(signatureHex));
  } catch (error) {
    if (error instanceof BinaryEncodingError) {
      return false;
    }

    throw error;
  }
}

async function importHmacKey(key: ByteSource, usages: KeyUsage[]): Promise<CryptoKey> {
  return getSubtleCrypto().importKey(
    "raw",
    toBytes(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}
