import {
  type MerchantSigningKey,
  type SignedMerchantCatalog,
  merchantCatalogSchema,
  signedMerchantCatalogSchema,
} from "@mindpay/contracts";
import {
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  selectActiveSignalWorksSigningKey,
  signSignalWorksPayloadWithKey,
} from "./identity";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_ORIGIN } from "./publication";
import {
  SIGNALWORKS_CATALOG_ID,
  SIGNALWORKS_CATALOG_VERSION,
  readSignalWorksServiceVersions,
} from "./services";

export const SIGNALWORKS_CATALOG_TTL_MS = 24 * 60 * 60 * 1_000;

export interface CreateSignalWorksCatalogInput {
  readonly database: D1Database;
  readonly keyEncryptionSecret: unknown;
  readonly nonce: unknown;
  readonly now: Date;
}

export async function createSignalWorksCatalogPublication(
  input: CreateSignalWorksCatalogInput,
): Promise<SignedMerchantCatalog> {
  const nowEpochMs = assertDate(input.now).getTime();
  const [identity, services] = await Promise.all([
    readSignalWorksPublicIdentity(input.database),
    readSignalWorksServiceVersions(input.database),
  ]);
  if (identity.status !== "ACTIVE") {
    throw new SignalWorksCatalogError("SignalWorks is not active");
  }

  const signingKey = selectActiveSignalWorksSigningKey(identity.signingKeys, "catalog", nowEpochMs);
  const issuedAt = input.now.toISOString();
  const catalog = merchantCatalogSchema.parse({
    audience: MINDPAY_API_AUDIENCE,
    catalog_id: SIGNALWORKS_CATALOG_ID,
    expires_at: new Date(catalogExpiry(signingKey, nowEpochMs)).toISOString(),
    generated_at: issuedAt,
    issued_at: issuedAt,
    issuer: `${SIGNALWORKS_ORIGIN}/`,
    kid: signingKey.kid,
    nonce: input.nonce,
    schema_version: "1",
    seller: identity.merchant,
    services,
    version: SIGNALWORKS_CATALOG_VERSION,
  });
  const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(input.keyEncryptionSecret);
  const signature = await signSignalWorksPayloadWithKey(
    input.database,
    keyEncryptionKey,
    signingKey.kid,
    catalog,
    nowEpochMs,
  );
  return signedMerchantCatalogSchema.parse({ catalog, signature });
}

export class SignalWorksCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksCatalogError";
  }
}

function catalogExpiry(signingKey: MerchantSigningKey, nowEpochMs: number): number {
  const boundaries = [nowEpochMs + SIGNALWORKS_CATALOG_TTL_MS];
  if (signingKey.valid_until !== undefined) {
    boundaries.push(Date.parse(signingKey.valid_until));
  }
  if (signingKey.revoked_at !== undefined) {
    boundaries.push(Date.parse(signingKey.revoked_at));
  }
  return Math.min(...boundaries);
}

function assertDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime()) || value.getTime() < 0) {
    throw new SignalWorksCatalogError("Catalog issuance time must be a valid date");
  }
  return value;
}
