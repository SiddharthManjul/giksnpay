import {
  type MerchantSigningKey,
  merchantManifestSchema,
  type SignedMerchantManifest,
  signedMerchantManifestSchema,
} from "@mindpay/contracts";
import {
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  selectActiveSignalWorksSigningKey,
  signSignalWorksPayloadWithKey,
} from "./identity";
import { MINDPAY_API_AUDIENCE, SIGNALWORKS_CATALOG_URL, SIGNALWORKS_ORIGIN } from "./publication";

export const SIGNALWORKS_MANIFEST_TTL_MS = 24 * 60 * 60 * 1_000;

export interface CreateSignalWorksManifestInput {
  readonly database: D1Database;
  readonly keyEncryptionSecret: unknown;
  readonly nonce: unknown;
  readonly now: Date;
}

export async function createSignalWorksManifestPublication(
  input: CreateSignalWorksManifestInput,
): Promise<SignedMerchantManifest> {
  const nowEpochMs = assertDate(input.now).getTime();
  const identity = await readSignalWorksPublicIdentity(input.database);
  if (identity.status !== "ACTIVE") {
    throw new SignalWorksManifestError("SignalWorks is not active");
  }

  const signingKey = selectActiveSignalWorksSigningKey(
    identity.signingKeys,
    "manifest",
    nowEpochMs,
  );
  const expiresAtEpochMs = manifestExpiry(signingKey, nowEpochMs);
  const manifest = merchantManifestSchema.parse({
    acp_base_url: `${SIGNALWORKS_ORIGIN}/`,
    audience: MINDPAY_API_AUDIENCE,
    catalog_url: SIGNALWORKS_CATALOG_URL,
    domain: identity.merchant.domain,
    expires_at: new Date(expiresAtEpochMs).toISOString(),
    issued_at: input.now.toISOString(),
    issuer: `${SIGNALWORKS_ORIGIN}/`,
    kid: signingKey.kid,
    legal_name: identity.legalName,
    mcp_url: `${SIGNALWORKS_ORIGIN}/mcp`,
    merchant_id: identity.merchant.merchant_id,
    name: identity.merchant.name,
    nonce: input.nonce,
    payment_rails: ["razorpay:test"],
    schema_version: "1",
    signing_keys: identity.signingKeys,
  });
  const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(input.keyEncryptionSecret);
  const signature = await signSignalWorksPayloadWithKey(
    input.database,
    keyEncryptionKey,
    signingKey.kid,
    manifest,
    nowEpochMs,
  );

  return signedMerchantManifestSchema.parse({ manifest, signature });
}

export class SignalWorksManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksManifestError";
  }
}

function manifestExpiry(signingKey: MerchantSigningKey, nowEpochMs: number): number {
  const boundaries = [nowEpochMs + SIGNALWORKS_MANIFEST_TTL_MS];
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
    throw new SignalWorksManifestError("Manifest issuance time must be a valid date");
  }
  return value;
}
