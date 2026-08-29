import {
  type Es256VerificationKey,
  importEs256PublicJwk,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { z } from "zod";
import {
  merchantHttpsUrlSchema,
  type SignedMerchantManifest,
  signedMerchantManifestSchema,
} from "./merchant";

const WELL_KNOWN_MANIFEST_PATH = "/.well-known/mindpay.json";

const publicationInputSchema = z
  .object({
    body: z.unknown(),
    expectedAudience: merchantHttpsUrlSchema,
    expectedUrl: merchantHttpsUrlSchema,
    location: z.string().nullable(),
    responseUrl: merchantHttpsUrlSchema,
    status: z.number().int().min(100).max(599),
  })
  .strict();

export interface MerchantManifestPublicationInput {
  readonly body: unknown;
  readonly expectedAudience: string;
  readonly expectedUrl: string;
  readonly location: string | null;
  readonly responseUrl: string;
  readonly status: number;
}

export type MerchantManifestVerificationFailureReason =
  | "AUDIENCE_MISMATCH"
  | "DOMAIN_MISMATCH"
  | "EXPIRED_KEY"
  | "EXPIRED_MANIFEST"
  | "INVALID_DISCOVERY_URL"
  | "INVALID_MANIFEST"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_SIGNATURE"
  | "KEY_NOT_YET_VALID"
  | "MANIFEST_NOT_YET_VALID"
  | "REDIRECTED"
  | "REVOKED_KEY"
  | "UNEXPECTED_STATUS"
  | "UNKNOWN_KEY";

export type MerchantManifestVerificationResult =
  | Readonly<{
      manifest: SignedMerchantManifest["manifest"];
      valid: true;
    }>
  | Readonly<{
      reason: MerchantManifestVerificationFailureReason;
      valid: false;
    }>;

export async function verifyMerchantManifestPublication(
  input: MerchantManifestPublicationInput,
  nowEpochMs = Date.now(),
): Promise<MerchantManifestVerificationResult> {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new RangeError("Manifest verification time must be safe epoch milliseconds");
  }

  const parsedInput = publicationInputSchema.safeParse(input);
  if (!parsedInput.success || !isExactWellKnownUrl(parsedInput.data.expectedUrl)) {
    return rejected("INVALID_DISCOVERY_URL");
  }

  const publication = parsedInput.data;
  if (
    publication.location !== null ||
    (publication.status >= 300 && publication.status < 400) ||
    publication.responseUrl !== publication.expectedUrl
  ) {
    return rejected("REDIRECTED");
  }
  if (publication.status !== 200) {
    return rejected("UNEXPECTED_STATUS");
  }

  const parsedPublication = signedMerchantManifestSchema.safeParse(publication.body);
  if (!parsedPublication.success) {
    return rejected("INVALID_MANIFEST");
  }

  const signedManifest = parsedPublication.data;
  const expectedUrl = new URL(publication.expectedUrl);
  if (signedManifest.manifest.domain !== expectedUrl.hostname) {
    return rejected("DOMAIN_MISMATCH");
  }
  if (signedManifest.manifest.audience !== publication.expectedAudience) {
    return rejected("AUDIENCE_MISMATCH");
  }

  const issuedAtEpochMs = Date.parse(signedManifest.manifest.issued_at);
  const expiresAtEpochMs = Date.parse(signedManifest.manifest.expires_at);
  if (issuedAtEpochMs > nowEpochMs) {
    return rejected("MANIFEST_NOT_YET_VALID");
  }
  if (expiresAtEpochMs <= nowEpochMs) {
    return rejected("EXPIRED_MANIFEST");
  }

  const manifestKey = signedManifest.manifest.signing_keys.find(
    (key) => key.kid === signedManifest.manifest.kid && key.purpose.includes("manifest"),
  );
  if (manifestKey === undefined) {
    return rejected("UNKNOWN_KEY");
  }

  let verificationKey: Es256VerificationKey;
  try {
    verificationKey = {
      kid: manifestKey.kid,
      publicKey: await importEs256PublicJwk(manifestKey.public_jwk),
      validFromEpochMs: Date.parse(manifestKey.valid_from),
      ...(manifestKey.valid_until === undefined
        ? {}
        : { validUntilEpochMs: Date.parse(manifestKey.valid_until) }),
      ...(manifestKey.revoked_at === undefined
        ? {}
        : { revokedAtEpochMs: Date.parse(manifestKey.revoked_at) }),
    };
  } catch {
    return rejected("INVALID_PUBLIC_KEY");
  }

  const verification = await verifyCanonicalJsonEs256(
    signedManifest.manifest,
    signedManifest.signature,
    [verificationKey],
    nowEpochMs,
  );
  if (!verification.valid) {
    return rejected(verification.reason);
  }

  return Object.freeze({ manifest: signedManifest.manifest, valid: true });
}

function isExactWellKnownUrl(value: string): boolean {
  const url = new URL(value);
  return url.pathname === WELL_KNOWN_MANIFEST_PATH && url.origin === `https://${url.hostname}`;
}

function rejected(
  reason: MerchantManifestVerificationFailureReason,
): MerchantManifestVerificationResult {
  return Object.freeze({ reason, valid: false });
}
