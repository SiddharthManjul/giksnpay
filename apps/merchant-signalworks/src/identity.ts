import {
  type MerchantSigningKey,
  type MerchantSigningPurpose,
  es256PublicJwkSchema,
  merchantIdentitySchema,
  merchantSigningKeySchema,
} from "@mindpay/contracts";
import {
  type Es256CanonicalSignature,
  type Es256SigningKey,
  base64UrlToBytes,
  decryptEs256PrivateJwk,
  encryptEs256PrivateJwk,
  exportEs256PrivateJwk,
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importAesGcmKey,
  importEs256PrivateJwk,
  signCanonicalJsonEs256,
} from "@mindpay/crypto";
import { signalWorksKeyEncryptionSecretSchema } from "@mindpay/config";
import { z } from "zod";

export const SIGNALWORKS_MERCHANT = Object.freeze({
  domain: "merchant-demo.example.com",
  legalName: "SignalWorks Research Private Limited",
  merchantId: "merchant_signalworks",
  name: "SignalWorks",
  status: "ACTIVE" as const,
});

export const SIGNALWORKS_SIGNING_PURPOSES = Object.freeze([
  "manifest",
  "catalog",
  "checkout",
  "event",
] as const satisfies readonly MerchantSigningPurpose[]);

const initialKeyDefinitions = Object.freeze([
  {
    id: "mkey_signalworks_manifest_2026_01",
    kid: "signalworks.manifest.2026-01",
    purpose: "manifest",
  },
  {
    id: "mkey_signalworks_catalog_2026_01",
    kid: "signalworks.catalog.2026-01",
    purpose: "catalog",
  },
  {
    id: "mkey_signalworks_checkout_2026_01",
    kid: "signalworks.checkout.2026-01",
    purpose: "checkout",
  },
  {
    id: "mkey_signalworks_event_2026_01",
    kid: "signalworks.event.2026-01",
    purpose: "event",
  },
] as const);

const epochMillisecondsSchema = z.number().int().safe().nonnegative();

const identityRowSchema = z
  .object({
    created_at: epochMillisecondsSchema,
    domain: z.string(),
    id: z.string(),
    legal_name: z.string(),
    name: z.string(),
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  })
  .strict();

const signingKeyRowSchema = z
  .object({
    created_at: epochMillisecondsSchema,
    encrypted_private_jwk: z.string().min(1),
    id: z.string().min(1),
    kid: z.string().min(1),
    merchant_id: z.string(),
    public_jwk: z.string().min(1),
    purpose: z.enum(["catalog", "checkout", "event", "manifest"]),
    revoked_at: epochMillisecondsSchema.nullable(),
    valid_from: epochMillisecondsSchema,
    valid_until: epochMillisecondsSchema.nullable(),
  })
  .strict();

type SigningKeyRow = z.infer<typeof signingKeyRowSchema>;

interface SigningKeyDefinition {
  readonly id: string;
  readonly kid: string;
  readonly purpose: MerchantSigningPurpose;
}

export interface RotateSignalWorksSigningKeyInput {
  readonly currentKid: string;
  readonly newKid: string;
  readonly oldValidUntil: Date;
  readonly purpose: MerchantSigningPurpose;
  readonly validFrom: Date;
}

export interface SignalWorksPublicIdentity {
  readonly createdAt: string;
  readonly legalName: string;
  readonly merchant: Readonly<{
    domain: string;
    merchant_id: string;
    name: string;
  }>;
  readonly signingKeys: readonly MerchantSigningKey[];
  readonly status: "ACTIVE" | "SUSPENDED";
}

export class SignalWorksIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksIdentityError";
  }
}

export async function importSignalWorksKeyEncryptionKey(secret: unknown): Promise<CryptoKey> {
  const canonicalSecret = signalWorksKeyEncryptionSecretSchema.parse(secret);
  return importAesGcmKey(base64UrlToBytes(canonicalSecret));
}

export async function seedSignalWorksIdentity(
  database: D1Database,
  keyEncryptionKey: CryptoKey,
  now = new Date(),
): Promise<SignalWorksPublicIdentity> {
  const createdAt = assertDate(now).getTime();
  const existingKeys = await readSigningKeyRows(database);
  const existingKeyIds = new Set(existingKeys.map((key) => key.id));
  const missingKeyDefinitions = initialKeyDefinitions.filter(
    (definition) => !existingKeyIds.has(definition.id),
  );
  const generatedKeys = await Promise.all(
    missingKeyDefinitions.map((definition) =>
      generateStoredSigningKey(definition, keyEncryptionKey, createdAt),
    ),
  );

  await database.batch([
    database
      .prepare(
        "INSERT INTO merchant_identity (id, name, legal_name, domain, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(
        SIGNALWORKS_MERCHANT.merchantId,
        SIGNALWORKS_MERCHANT.name,
        SIGNALWORKS_MERCHANT.legalName,
        SIGNALWORKS_MERCHANT.domain,
        SIGNALWORKS_MERCHANT.status,
        createdAt,
      ),
    ...generatedKeys.map((key) =>
      database
        .prepare(
          "INSERT INTO merchant_signing_keys (id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          key.id,
          SIGNALWORKS_MERCHANT.merchantId,
          key.kid,
          key.purpose,
          JSON.stringify(key.publicJwk),
          JSON.stringify(key.encryptedPrivateJwk),
          createdAt,
          createdAt,
        ),
    ),
  ]);

  await assertStoredPrivateKeysDecryptable(await readSigningKeyRows(database), keyEncryptionKey);
  return readSignalWorksPublicIdentity(database);
}

export async function readSignalWorksPublicIdentity(
  database: D1Database,
): Promise<SignalWorksPublicIdentity> {
  const identityResult = await database
    .prepare(
      "SELECT id, name, legal_name, domain, status, created_at FROM merchant_identity WHERE id = ?",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId)
    .first();
  const identity = identityRowSchema.parse(identityResult);

  if (
    identity.id !== SIGNALWORKS_MERCHANT.merchantId ||
    identity.name !== SIGNALWORKS_MERCHANT.name ||
    identity.legal_name !== SIGNALWORKS_MERCHANT.legalName ||
    identity.domain !== SIGNALWORKS_MERCHANT.domain
  ) {
    throw new SignalWorksIdentityError("The stored SignalWorks identity conflicts with the seed");
  }

  const keys = await readSigningKeyRows(database);
  const signingKeys = keys.map(toPublicSigningKey);
  for (const definition of initialKeyDefinitions) {
    const key = keys.find((candidate) => candidate.id === definition.id);
    if (key === undefined || key.kid !== definition.kid || key.purpose !== definition.purpose) {
      throw new SignalWorksIdentityError(
        `The stored SignalWorks ${definition.purpose} key conflicts with the seed`,
      );
    }
  }

  return Object.freeze({
    createdAt: new Date(identity.created_at).toISOString(),
    legalName: identity.legal_name,
    merchant: merchantIdentitySchema.parse({
      domain: identity.domain,
      merchant_id: identity.id,
      name: identity.name,
    }),
    signingKeys: Object.freeze(signingKeys),
    status: identity.status,
  });
}

export async function signSignalWorksPayload(
  database: D1Database,
  keyEncryptionKey: CryptoKey,
  purpose: MerchantSigningPurpose,
  payload: unknown,
  nowEpochMs = Date.now(),
): Promise<Es256CanonicalSignature> {
  assertEpochMilliseconds(nowEpochMs);
  const row = await database
    .prepare(
      "SELECT id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at FROM merchant_signing_keys WHERE merchant_id = ? AND purpose = ? AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?) AND (revoked_at IS NULL OR revoked_at > ?) ORDER BY valid_from DESC, created_at DESC LIMIT 1",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId, purpose, nowEpochMs, nowEpochMs, nowEpochMs)
    .first();
  if (row === null) {
    throw new SignalWorksIdentityError(`No active SignalWorks ${purpose} signing key is available`);
  }
  return signWithStoredKey(signingKeyRowSchema.parse(row), keyEncryptionKey, payload, nowEpochMs);
}

export function selectActiveSignalWorksSigningKey(
  signingKeys: readonly MerchantSigningKey[],
  purpose: MerchantSigningPurpose,
  nowEpochMs: number,
): MerchantSigningKey {
  assertEpochMilliseconds(nowEpochMs);
  const activeKeys = signingKeys
    .filter(
      (key) =>
        key.purpose.includes(purpose) &&
        Date.parse(key.valid_from) <= nowEpochMs &&
        (key.valid_until === undefined || Date.parse(key.valid_until) > nowEpochMs) &&
        (key.revoked_at === undefined || Date.parse(key.revoked_at) > nowEpochMs),
    )
    .toSorted(
      (left, right) =>
        Date.parse(right.valid_from) - Date.parse(left.valid_from) ||
        right.kid.localeCompare(left.kid),
    );
  const signingKey = activeKeys[0];
  if (signingKey === undefined) {
    throw new SignalWorksIdentityError(`No active SignalWorks ${purpose} signing key is available`);
  }
  return signingKey;
}

export async function signSignalWorksPayloadWithKey(
  database: D1Database,
  keyEncryptionKey: CryptoKey,
  kid: string,
  payload: unknown,
  nowEpochMs = Date.now(),
): Promise<Es256CanonicalSignature> {
  assertEpochMilliseconds(nowEpochMs);
  const row = await database
    .prepare(
      "SELECT id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at FROM merchant_signing_keys WHERE merchant_id = ? AND kid = ?",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId, kid)
    .first();
  if (row === null) {
    throw new SignalWorksIdentityError(`Unknown SignalWorks signing key: ${kid}`);
  }
  return signWithStoredKey(signingKeyRowSchema.parse(row), keyEncryptionKey, payload, nowEpochMs);
}

export async function revokeSignalWorksSigningKey(
  database: D1Database,
  kid: string,
  revokedAt: Date,
): Promise<MerchantSigningKey> {
  const revokedAtEpochMs = assertDate(revokedAt).getTime();
  const existing = await database
    .prepare(
      "SELECT id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at FROM merchant_signing_keys WHERE merchant_id = ? AND kid = ?",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId, kid)
    .first();
  if (existing === null) {
    throw new SignalWorksIdentityError(`Unknown SignalWorks signing key: ${kid}`);
  }
  const row = signingKeyRowSchema.parse(existing);
  if (revokedAtEpochMs < row.valid_from) {
    throw new SignalWorksIdentityError("A signing key cannot be revoked before it becomes valid");
  }
  if (row.revoked_at !== null && row.revoked_at !== revokedAtEpochMs) {
    throw new SignalWorksIdentityError("A signing key's revocation timestamp is immutable");
  }

  await database
    .prepare(
      "UPDATE merchant_signing_keys SET revoked_at = ? WHERE merchant_id = ? AND kid = ? AND revoked_at IS NULL",
    )
    .bind(revokedAtEpochMs, SIGNALWORKS_MERCHANT.merchantId, kid)
    .run();

  const persisted = await database
    .prepare(
      "SELECT id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at FROM merchant_signing_keys WHERE merchant_id = ? AND kid = ?",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId, kid)
    .first();
  const persistedRow = signingKeyRowSchema.parse(persisted);
  if (persistedRow.revoked_at !== revokedAtEpochMs) {
    throw new SignalWorksIdentityError("A signing key's revocation timestamp is immutable");
  }
  return toPublicSigningKey(persistedRow);
}

export async function rotateSignalWorksSigningKey(
  database: D1Database,
  keyEncryptionKey: CryptoKey,
  input: RotateSignalWorksSigningKeyInput,
  createdAt = new Date(),
): Promise<SignalWorksPublicIdentity> {
  const createdAtEpochMs = assertDate(createdAt).getTime();
  const validFromEpochMs = assertDate(input.validFrom).getTime();
  const oldValidUntilEpochMs = assertDate(input.oldValidUntil).getTime();
  if (validFromEpochMs < createdAtEpochMs) {
    throw new SignalWorksIdentityError("A rotated key cannot become valid before it is created");
  }
  if (oldValidUntilEpochMs <= validFromEpochMs) {
    throw new SignalWorksIdentityError(
      "The previous key must remain valid beyond the new key's activation for explicit overlap",
    );
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(input.newKid)) {
    throw new SignalWorksIdentityError("The rotated signing key ID is not canonical");
  }

  const existing = await database
    .prepare(
      "SELECT id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at FROM merchant_signing_keys WHERE merchant_id = ? AND kid = ?",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId, input.currentKid)
    .first();
  if (existing === null) {
    throw new SignalWorksIdentityError(`Unknown SignalWorks signing key: ${input.currentKid}`);
  }
  const currentRow = signingKeyRowSchema.parse(existing);
  if (currentRow.purpose !== input.purpose) {
    throw new SignalWorksIdentityError("A signing-key rotation cannot change its purpose");
  }
  if (currentRow.revoked_at !== null || currentRow.valid_until !== null) {
    throw new SignalWorksIdentityError("Only a current, unretired signing key can be rotated");
  }

  const definition: SigningKeyDefinition = {
    id: `mkey_${input.newKid}`,
    kid: input.newKid,
    purpose: input.purpose,
  };
  const generated = await generateStoredSigningKey(definition, keyEncryptionKey, validFromEpochMs);
  await database.batch([
    database
      .prepare(
        "UPDATE merchant_signing_keys SET valid_until = ? WHERE merchant_id = ? AND kid = ? AND valid_until IS NULL AND revoked_at IS NULL",
      )
      .bind(oldValidUntilEpochMs, SIGNALWORKS_MERCHANT.merchantId, input.currentKid),
    database
      .prepare(
        "INSERT INTO merchant_signing_keys (id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
      )
      .bind(
        generated.id,
        SIGNALWORKS_MERCHANT.merchantId,
        generated.kid,
        generated.purpose,
        JSON.stringify(generated.publicJwk),
        JSON.stringify(generated.encryptedPrivateJwk),
        validFromEpochMs,
        createdAtEpochMs,
      ),
  ]);

  return readSignalWorksPublicIdentity(database);
}

async function generateStoredSigningKey(
  definition: SigningKeyDefinition,
  keyEncryptionKey: CryptoKey,
  validFromEpochMs: number,
) {
  const keyPair = await generateEs256KeyPair(true);
  const [publicJwkValue, privateJwk] = await Promise.all([
    exportEs256PublicJwk(keyPair.publicKey),
    exportEs256PrivateJwk(keyPair.privateKey),
  ]);
  const publicJwk = es256PublicJwkSchema.parse(publicJwkValue);
  const encryptedPrivateJwk = await encryptEs256PrivateJwk(
    keyEncryptionKey,
    privateJwk,
    signingKeyEncryptionContext(definition.kid, definition.purpose),
  );
  return { ...definition, encryptedPrivateJwk, publicJwk, validFromEpochMs };
}

async function readSigningKeyRows(database: D1Database): Promise<readonly SigningKeyRow[]> {
  const result = await database
    .prepare(
      "SELECT id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at FROM merchant_signing_keys WHERE merchant_id = ? ORDER BY purpose, valid_from, kid",
    )
    .bind(SIGNALWORKS_MERCHANT.merchantId)
    .all();
  return z.array(signingKeyRowSchema).parse(result.results);
}

async function assertStoredPrivateKeysDecryptable(
  rows: readonly SigningKeyRow[],
  keyEncryptionKey: CryptoKey,
): Promise<void> {
  await Promise.all(
    rows.map(async (row) => {
      const privateJwk = await decryptEs256PrivateJwk(
        keyEncryptionKey,
        parseJson(row.encrypted_private_jwk, z.unknown()),
        signingKeyEncryptionContext(row.kid, row.purpose),
      );
      await importEs256PrivateJwk(privateJwk);
    }),
  );
}

function toPublicSigningKey(row: SigningKeyRow): MerchantSigningKey {
  return merchantSigningKeySchema.parse({
    kid: row.kid,
    public_jwk: parseJson(row.public_jwk, es256PublicJwkSchema),
    purpose: [row.purpose],
    ...(row.revoked_at === null ? {} : { revoked_at: new Date(row.revoked_at).toISOString() }),
    valid_from: new Date(row.valid_from).toISOString(),
    ...(row.valid_until === null ? {} : { valid_until: new Date(row.valid_until).toISOString() }),
  });
}

async function signWithStoredKey(
  row: SigningKeyRow,
  keyEncryptionKey: CryptoKey,
  payload: unknown,
  nowEpochMs: number,
): Promise<Es256CanonicalSignature> {
  const privateJwk = await decryptEs256PrivateJwk(
    keyEncryptionKey,
    parseJson(row.encrypted_private_jwk, z.unknown()),
    signingKeyEncryptionContext(row.kid, row.purpose),
  );
  const privateKey = await importEs256PrivateJwk(privateJwk);
  const signingKey: Es256SigningKey = {
    kid: row.kid,
    privateKey,
    validFromEpochMs: row.valid_from,
    ...(row.valid_until === null ? {} : { validUntilEpochMs: row.valid_until }),
    ...(row.revoked_at === null ? {} : { revokedAtEpochMs: row.revoked_at }),
  };
  return signCanonicalJsonEs256(payload, signingKey, nowEpochMs);
}

function signingKeyEncryptionContext(kid: string, purpose: MerchantSigningPurpose) {
  return {
    kid,
    merchantId: SIGNALWORKS_MERCHANT.merchantId,
    purpose,
  };
}

function parseJson<T>(serialized: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new SignalWorksIdentityError("SignalWorks D1 contains malformed JSON");
  }
  return schema.parse(parsed);
}

function assertDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new SignalWorksIdentityError("SignalWorks lifecycle timestamps must be valid dates");
  }
  return value;
}

function assertEpochMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SignalWorksIdentityError(
      "SignalWorks lifecycle time must be safe epoch milliseconds",
    );
  }
}
