import {
  type Es256VerificationKey,
  importEs256PublicJwk,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { z } from "zod";
import {
  type MerchantManifest,
  merchantHttpsUrlSchema,
  type SignedMerchantCatalog,
  signedMerchantCatalogSchema,
} from "./merchant";

const publicationInputSchema = z
  .object({
    body: z.unknown(),
    expectedAudience: merchantHttpsUrlSchema,
    expectedMerchantId: z.string().min(1),
    expectedUrl: merchantHttpsUrlSchema,
    location: z.string().nullable(),
    manifest: z.custom<MerchantManifest>(),
    responseUrl: merchantHttpsUrlSchema,
    status: z.number().int().min(100).max(599),
  })
  .strict();

export interface MerchantCatalogPublicationInput {
  readonly body: unknown;
  readonly expectedAudience: string;
  readonly expectedMerchantId: string;
  readonly expectedUrl: string;
  readonly location: string | null;
  readonly manifest: MerchantManifest;
  readonly responseUrl: string;
  readonly status: number;
}

export type MerchantCatalogVerificationFailureReason =
  | "AUDIENCE_MISMATCH"
  | "CATALOG_NOT_YET_VALID"
  | "DOMAIN_MISMATCH"
  | "EXPIRED_CATALOG"
  | "EXPIRED_KEY"
  | "INVALID_CATALOG"
  | "INVALID_DISCOVERY_URL"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_SIGNATURE"
  | "KEY_NOT_YET_VALID"
  | "MERCHANT_MISMATCH"
  | "REDIRECTED"
  | "REVOKED_KEY"
  | "UNEXPECTED_STATUS"
  | "UNKNOWN_KEY";

export type MerchantCatalogVerificationResult =
  | Readonly<{ catalog: SignedMerchantCatalog["catalog"]; valid: true }>
  | Readonly<{ reason: MerchantCatalogVerificationFailureReason; valid: false }>;

export async function verifyMerchantCatalogPublication(
  input: MerchantCatalogPublicationInput,
  nowEpochMs = Date.now(),
): Promise<MerchantCatalogVerificationResult> {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new RangeError("Catalog verification time must be safe epoch milliseconds");
  }

  const parsedInput = publicationInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return rejected("INVALID_DISCOVERY_URL");
  }
  const publication = parsedInput.data;
  if (publication.expectedUrl !== publication.manifest.catalog_url) {
    return rejected("INVALID_DISCOVERY_URL");
  }
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

  const parsedCatalog = signedMerchantCatalogSchema.safeParse(publication.body);
  if (!parsedCatalog.success) {
    return rejected("INVALID_CATALOG");
  }
  const signedCatalog = parsedCatalog.data;
  if (
    signedCatalog.catalog.seller.merchant_id !== publication.expectedMerchantId ||
    signedCatalog.catalog.seller.merchant_id !== publication.manifest.merchant_id
  ) {
    return rejected("MERCHANT_MISMATCH");
  }
  if (
    signedCatalog.catalog.seller.domain !== publication.manifest.domain ||
    new URL(publication.expectedUrl).hostname !== publication.manifest.domain
  ) {
    return rejected("DOMAIN_MISMATCH");
  }
  if (signedCatalog.catalog.audience !== publication.expectedAudience) {
    return rejected("AUDIENCE_MISMATCH");
  }

  const issuedAtEpochMs = Date.parse(signedCatalog.catalog.issued_at);
  if (issuedAtEpochMs > nowEpochMs) {
    return rejected("CATALOG_NOT_YET_VALID");
  }
  if (Date.parse(signedCatalog.catalog.expires_at) <= nowEpochMs) {
    return rejected("EXPIRED_CATALOG");
  }

  const catalogKey = publication.manifest.signing_keys.find(
    (key) => key.kid === signedCatalog.catalog.kid && key.purpose.includes("catalog"),
  );
  if (catalogKey === undefined) {
    return rejected("UNKNOWN_KEY");
  }

  let verificationKey: Es256VerificationKey;
  try {
    verificationKey = {
      kid: catalogKey.kid,
      publicKey: await importEs256PublicJwk(catalogKey.public_jwk),
      validFromEpochMs: Date.parse(catalogKey.valid_from),
      ...(catalogKey.valid_until === undefined
        ? {}
        : { validUntilEpochMs: Date.parse(catalogKey.valid_until) }),
      ...(catalogKey.revoked_at === undefined
        ? {}
        : { revokedAtEpochMs: Date.parse(catalogKey.revoked_at) }),
    };
  } catch {
    return rejected("INVALID_PUBLIC_KEY");
  }

  const verification = await verifyCanonicalJsonEs256(
    signedCatalog.catalog,
    signedCatalog.signature,
    [verificationKey],
    nowEpochMs,
  );
  if (!verification.valid) {
    return rejected(verification.reason);
  }

  return Object.freeze({ catalog: signedCatalog.catalog, valid: true });
}

function rejected(
  reason: MerchantCatalogVerificationFailureReason,
): MerchantCatalogVerificationResult {
  return Object.freeze({ reason, valid: false });
}
