export type ByteSource = string | Uint8Array;

/** Raised when a textual binary encoding is malformed or ambiguous. */
export class BinaryEncodingError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "BinaryEncodingError";
  }
}

/** Converts strings to UTF-8 and defensively copies byte inputs. */
export function toBytes(value: ByteSource): Uint8Array<ArrayBuffer> {
  return typeof value === "string" ? new TextEncoder().encode(value) : Uint8Array.from(value);
}

export function bytesToHex(value: Uint8Array): string {
  let result = "";

  for (const byte of value) {
    result += byte.toString(16).padStart(2, "0");
  }

  return result;
}

/** Decodes even-length ASCII hexadecimal. Uppercase input is accepted. */
export function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (value.length % 2 !== 0) {
    throw new BinaryEncodingError("Hexadecimal input must contain an even number of characters");
  }

  if (!/^[0-9a-f]*$/iu.test(value)) {
    throw new BinaryEncodingError("Hexadecimal input contains a non-hexadecimal character");
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

/** Encodes unpadded URL-safe Base64 without relying on Node.js Buffer. */
export function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/** Decodes canonical, unpadded URL-safe Base64. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-z0-9_-]*$/iu.test(value) || value.length % 4 === 1) {
    throw new BinaryEncodingError("Base64url input is malformed");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new BinaryEncodingError("Base64url input is malformed");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (bytesToBase64Url(bytes) !== value) {
    throw new BinaryEncodingError("Base64url input is not canonically encoded");
  }

  return bytes;
}

/**
 * Compares every byte without returning early, including when lengths differ.
 *
 * JavaScript engines cannot promise hard constant-time execution. Keyed MACs
 * should use `verifyHmacSha256`, which delegates verification to Web Crypto.
 */
export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const comparisonLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < comparisonLength; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return mismatch === 0;
}
