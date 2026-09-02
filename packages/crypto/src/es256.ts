import { base64UrlToBytes, bytesToBase64Url } from "./bytes";
import { canonicalizeJson, canonicalizeJsonBytes } from "./canonical-json";
import { getSubtleCrypto } from "./web-crypto";

export const ES256_ALGORITHM = "ES256";
export const ES256_SIGNATURE_BYTE_LENGTH = 64;

const KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const ECDSA_KEY_ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDSA_SIGNATURE_ALGORITHM = { name: "ECDSA", hash: "SHA-256" } as const;

export type Es256KeyLifecycle = Readonly<{
  validFromEpochMs: number;
  validUntilEpochMs?: number;
  revokedAtEpochMs?: number;
}>;

export type Es256SigningKey = Es256KeyLifecycle &
  Readonly<{
    kid: string;
    privateKey: CryptoKey;
  }>;

export type Es256VerificationKey = Es256KeyLifecycle &
  Readonly<{
    kid: string;
    publicKey: CryptoKey;
  }>;

/** The signature is raw IEEE P1363 `r || s`, encoded as unpadded base64url. */
export type Es256CanonicalSignature = Readonly<{
  alg: typeof ES256_ALGORITHM;
  kid: string;
  signature: string;
}>;

export type Es256VerificationFailureReason =
  | "EXPIRED_KEY"
  | "INVALID_SIGNATURE"
  | "KEY_NOT_YET_VALID"
  | "REVOKED_KEY"
  | "UNKNOWN_KEY";

export type Es256VerificationResult =
  | Readonly<{ kid: string; valid: true }>
  | Readonly<{
      kid: string;
      reason: Exclude<Es256VerificationFailureReason, "INVALID_SIGNATURE">;
      valid: false;
    }>
  | Readonly<{ reason: "INVALID_SIGNATURE"; valid: false }>;

export class Es256KeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Es256KeyError";
  }
}

export class Es256KeyUnavailableError extends Es256KeyError {
  readonly reason: "EXPIRED_KEY" | "KEY_NOT_YET_VALID" | "REVOKED_KEY";

  constructor(reason: "EXPIRED_KEY" | "KEY_NOT_YET_VALID" | "REVOKED_KEY", kid: string) {
    super(`ES256 signing key ${kid} is unavailable: ${reason}`);
    this.name = "Es256KeyUnavailableError";
    this.reason = reason;
  }
}

/** Generates a P-256 key pair. Private material is non-extractable unless explicitly requested. */
export async function generateEs256KeyPair(extractable = false): Promise<CryptoKeyPair> {
  return getSubtleCrypto().generateKey(ECDSA_KEY_ALGORITHM, extractable, ["sign", "verify"]);
}

export async function exportEs256PublicJwk(publicKey: CryptoKey): Promise<Readonly<JsonWebKey>> {
  assertEs256CryptoKey(publicKey, "public", "verify");
  const exported = await getSubtleCrypto().exportKey("jwk", publicKey);
  return parseEs256PublicJwk(normalizeWebCryptoJwk(exported));
}

export async function exportEs256PrivateJwk(privateKey: CryptoKey): Promise<Readonly<JsonWebKey>> {
  assertEs256CryptoKey(privateKey, "private", "sign");
  const exported = await getSubtleCrypto().exportKey("jwk", privateKey);
  return parseEs256PrivateJwk(normalizeWebCryptoJwk(exported));
}

export async function importEs256PublicJwk(jwk: unknown): Promise<CryptoKey> {
  const normalized = parseEs256PublicJwk(jwk);
  return getSubtleCrypto().importKey("jwk", normalized, ECDSA_KEY_ALGORITHM, false, ["verify"]);
}

export async function importEs256PrivateJwk(jwk: unknown): Promise<CryptoKey> {
  const normalized = parseEs256PrivateJwk(jwk);
  return getSubtleCrypto().importKey("jwk", normalized, ECDSA_KEY_ALGORITHM, false, ["sign"]);
}

export function parseEs256PublicJwk(jwk: unknown): Readonly<JsonWebKey> {
  const normalized = snapshotJwk(jwk);
  const record = normalized as Record<string, unknown>;

  assertCommonEs256Jwk(record);
  if ("d" in record) {
    throw new Es256KeyError("An ES256 public JWK cannot contain private key material");
  }

  return freezeJwk(normalized);
}

export function parseEs256PrivateJwk(jwk: unknown): Readonly<JsonWebKey> {
  const normalized = snapshotJwk(jwk);
  const record = normalized as Record<string, unknown>;

  assertCommonEs256Jwk(record);
  assertCoordinate(record.d, "d");

  return freezeJwk(normalized);
}

export async function signEs256(
  privateKey: CryptoKey,
  message: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  assertEs256CryptoKey(privateKey, "private", "sign");
  const signature = new Uint8Array(
    await getSubtleCrypto().sign(ECDSA_SIGNATURE_ALGORITHM, privateKey, Uint8Array.from(message)),
  );

  if (signature.length !== ES256_SIGNATURE_BYTE_LENGTH) {
    throw new Error(
      `Web Crypto returned an unexpected ES256 signature length: ${signature.length}`,
    );
  }

  return signature;
}

export async function verifyEs256(
  publicKey: CryptoKey,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  assertEs256CryptoKey(publicKey, "public", "verify");
  if (signature.length !== ES256_SIGNATURE_BYTE_LENGTH) {
    return false;
  }

  return getSubtleCrypto().verify(
    ECDSA_SIGNATURE_ALGORITHM,
    publicKey,
    Uint8Array.from(signature),
    Uint8Array.from(message),
  );
}

export async function signCanonicalJsonEs256(
  payload: unknown,
  signingKey: Es256SigningKey,
  nowEpochMs = Date.now(),
): Promise<Es256CanonicalSignature> {
  assertKeyRecord(signingKey, "private");
  assertEpochMilliseconds(nowEpochMs, "nowEpochMs");

  const unavailableReason = getUnavailableReason(signingKey, nowEpochMs);
  if (unavailableReason !== undefined) {
    throw new Es256KeyUnavailableError(unavailableReason, signingKey.kid);
  }

  const signature = await signEs256(
    signingKey.privateKey,
    createCanonicalSignatureInput(payload, signingKey.kid),
  );

  return Object.freeze({
    alg: ES256_ALGORITHM,
    kid: signingKey.kid,
    signature: bytesToBase64Url(signature),
  });
}

export async function verifyCanonicalJsonEs256(
  payload: unknown,
  signatureValue: unknown,
  verificationKeys: readonly Es256VerificationKey[],
  nowEpochMs = Date.now(),
): Promise<Es256VerificationResult> {
  assertEpochMilliseconds(nowEpochMs, "nowEpochMs");
  const keyById = createVerificationKeyMap(verificationKeys);
  const parsedSignature = parseCanonicalSignature(signatureValue);

  if (parsedSignature === undefined) {
    return Object.freeze({ reason: "INVALID_SIGNATURE", valid: false });
  }

  const verificationKey = keyById.get(parsedSignature.envelope.kid);
  if (verificationKey === undefined) {
    return Object.freeze({
      kid: parsedSignature.envelope.kid,
      reason: "UNKNOWN_KEY",
      valid: false,
    });
  }

  const unavailableReason = getUnavailableReason(verificationKey, nowEpochMs);
  if (unavailableReason !== undefined) {
    return Object.freeze({
      kid: verificationKey.kid,
      reason: unavailableReason,
      valid: false,
    });
  }

  const valid = await verifyEs256(
    verificationKey.publicKey,
    createCanonicalSignatureInput(payload, verificationKey.kid),
    parsedSignature.signatureBytes,
  );

  return valid
    ? Object.freeze({ kid: verificationKey.kid, valid: true })
    : Object.freeze({ reason: "INVALID_SIGNATURE", valid: false });
}

function createCanonicalSignatureInput(payload: unknown, kid: string): Uint8Array<ArrayBuffer> {
  return canonicalizeJsonBytes({ alg: ES256_ALGORITHM, kid, payload });
}

function parseCanonicalSignature(
  value: unknown,
): { envelope: Es256CanonicalSignature; signatureBytes: Uint8Array<ArrayBuffer> } | undefined {
  try {
    const parsed: unknown = JSON.parse(canonicalizeJson(value));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length !== 3 ||
      !keys.includes("alg") ||
      !keys.includes("kid") ||
      !keys.includes("signature") ||
      record.alg !== ES256_ALGORITHM ||
      typeof record.kid !== "string" ||
      typeof record.signature !== "string"
    ) {
      return undefined;
    }

    assertKeyId(record.kid);
    const signatureBytes = base64UrlToBytes(record.signature);
    if (signatureBytes.length !== ES256_SIGNATURE_BYTE_LENGTH) {
      return undefined;
    }

    return {
      envelope: Object.freeze({
        alg: ES256_ALGORITHM,
        kid: record.kid,
        signature: record.signature,
      }),
      signatureBytes,
    };
  } catch {
    return undefined;
  }
}

function createVerificationKeyMap(
  verificationKeys: readonly Es256VerificationKey[],
): ReadonlyMap<string, Es256VerificationKey> {
  const keyById = new Map<string, Es256VerificationKey>();

  for (const verificationKey of verificationKeys) {
    assertKeyRecord(verificationKey, "public");
    if (keyById.has(verificationKey.kid)) {
      throw new Es256KeyError(`Duplicate ES256 verification key ID: ${verificationKey.kid}`);
    }
    keyById.set(verificationKey.kid, verificationKey);
  }

  return keyById;
}

function assertKeyRecord(
  key: Es256SigningKey | Es256VerificationKey,
  expectedType: "private" | "public",
): void {
  assertKeyId(key.kid);
  assertEpochMilliseconds(key.validFromEpochMs, "validFromEpochMs");

  if (key.validUntilEpochMs !== undefined) {
    assertEpochMilliseconds(key.validUntilEpochMs, "validUntilEpochMs");
    if (key.validUntilEpochMs <= key.validFromEpochMs) {
      throw new Es256KeyError("validUntilEpochMs must be later than validFromEpochMs");
    }
  }

  if (key.revokedAtEpochMs !== undefined) {
    assertEpochMilliseconds(key.revokedAtEpochMs, "revokedAtEpochMs");
  }

  if (expectedType === "private" && "privateKey" in key) {
    assertEs256CryptoKey(key.privateKey, "private", "sign");
    return;
  }

  if (expectedType === "public" && "publicKey" in key) {
    assertEs256CryptoKey(key.publicKey, "public", "verify");
    return;
  }

  throw new Es256KeyError(`Expected an ES256 ${expectedType} key record`);
}

function getUnavailableReason(
  lifecycle: Es256KeyLifecycle,
  nowEpochMs: number,
): "EXPIRED_KEY" | "KEY_NOT_YET_VALID" | "REVOKED_KEY" | undefined {
  if (lifecycle.revokedAtEpochMs !== undefined && lifecycle.revokedAtEpochMs <= nowEpochMs) {
    return "REVOKED_KEY";
  }
  if (nowEpochMs < lifecycle.validFromEpochMs) {
    return "KEY_NOT_YET_VALID";
  }
  if (lifecycle.validUntilEpochMs !== undefined && nowEpochMs >= lifecycle.validUntilEpochMs) {
    return "EXPIRED_KEY";
  }
  return undefined;
}

function assertKeyId(kid: string): void {
  if (!KEY_ID_PATTERN.test(kid)) {
    throw new Es256KeyError(
      "ES256 key IDs must contain 1-128 ASCII letters, digits, periods, underscores, colons, or hyphens",
    );
  }
}

function assertEpochMilliseconds(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Es256KeyError(`${field} must be a safe integer epoch-millisecond value`);
  }
}

function assertEs256CryptoKey(
  key: CryptoKey,
  expectedType: "private" | "public",
  requiredUsage: "sign" | "verify",
): void {
  if (
    key.type !== expectedType ||
    key.algorithm.name !== "ECDSA" ||
    !("namedCurve" in key.algorithm) ||
    key.algorithm.namedCurve !== "P-256" ||
    !key.usages.includes(requiredUsage)
  ) {
    throw new Es256KeyError(
      `Expected a P-256 ECDSA ${expectedType} key with ${requiredUsage} usage`,
    );
  }
}

function snapshotJwk(jwk: unknown): JsonWebKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalizeJson(jwk));
  } catch {
    throw new Es256KeyError("ES256 JWK must be plain JSON data");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Es256KeyError("ES256 JWK must be a JSON object");
  }

  return parsed as JsonWebKey;
}

/**
 * Web Crypto owns this value, but runtimes may return its Web IDL dictionary
 * from a different object realm. Convert that trusted dictionary to plain JSON
 * before applying the strict parser used for untrusted JWK inputs.
 */
function normalizeWebCryptoJwk(jwk: JsonWebKey): JsonWebKey {
  try {
    const serialized = JSON.stringify(jwk);
    if (serialized === undefined) {
      throw new TypeError("Web Crypto returned an unserializable JWK");
    }
    return JSON.parse(serialized) as JsonWebKey;
  } catch {
    throw new Es256KeyError("Web Crypto returned an invalid JWK");
  }
}

function assertCommonEs256Jwk(record: Record<string, unknown>): void {
  if (record.kty !== "EC" || record.crv !== "P-256") {
    throw new Es256KeyError("ES256 JWK must use an EC P-256 key");
  }
  if (record.alg !== undefined && record.alg !== ES256_ALGORITHM) {
    throw new Es256KeyError("ES256 JWK has an incompatible alg value");
  }
  if (record.use !== undefined && record.use !== "sig") {
    throw new Es256KeyError("ES256 JWK has an incompatible use value");
  }

  assertCoordinate(record.x, "x");
  assertCoordinate(record.y, "y");
}

function assertCoordinate(value: unknown, field: string): void {
  if (typeof value !== "string") {
    throw new Es256KeyError(`ES256 JWK ${field} must be base64url text`);
  }

  try {
    if (base64UrlToBytes(value).length !== 32) {
      throw new Es256KeyError(`ES256 JWK ${field} must encode exactly 32 bytes`);
    }
  } catch (error) {
    if (error instanceof Es256KeyError) {
      throw error;
    }
    throw new Es256KeyError(`ES256 JWK ${field} must be canonical base64url`);
  }
}

function freezeJwk(jwk: JsonWebKey): Readonly<JsonWebKey> {
  if (jwk.key_ops !== undefined) {
    Object.freeze(jwk.key_ops);
  }
  return Object.freeze(jwk);
}
