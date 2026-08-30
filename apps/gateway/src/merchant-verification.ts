import {
  type MerchantCatalog,
  type MerchantManifest,
  type SignedMerchantCatalog,
  type SignedMerchantManifest,
  signedMerchantCatalogSchema,
  signedMerchantManifestSchema,
  verifyMerchantCatalogPublication,
  verifyMerchantManifestPublication,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { z } from "zod";

export const MERCHANT_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_MINDPAY_API_AUDIENCE = "https://api.mindpay.example/";
const PUBLICATION_FETCH_TIMEOUT_MS = 5_000;
const PUBLICATION_MAX_BYTES = 1_000_000;

const dnsJsonSchema = z
  .object({
    Answer: z
      .array(z.object({ data: z.string(), type: z.number().int() }).passthrough())
      .optional(),
    Status: z.number().int(),
  })
  .passthrough();

export type MerchantVerificationFailureReason =
  | "CATALOG_VERSION_REPLAY"
  | "DNS_RESOLUTION_FAILED"
  | "DOMAIN_MISMATCH"
  | "ENDPOINT_UNREACHABLE"
  | "NETWORK_ERROR"
  | "PRIVATE_NETWORK"
  | `CATALOG_${string}`
  | `MANIFEST_${string}`;

export type MerchantVerificationCheckType =
  | "DOMAIN"
  | "MANIFEST"
  | "KEY"
  | "ENDPOINTS"
  | "CATALOG"
  | "PAYMENT_CONFIGURATION";

export interface MerchantVerificationCheck {
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly reason: string | null;
  readonly status: "PASS" | "FAIL";
  readonly type: MerchantVerificationCheckType;
}

export interface PublicationResponse {
  readonly body: unknown;
  readonly location: string | null;
  readonly status: number;
  readonly url: string;
}

export interface MerchantVerificationDependencies {
  readonly fetchPublication?: (url: string) => Promise<PublicationResponse>;
  readonly now?: () => Date;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
}

export interface VerifyMerchantInput {
  readonly domain: string;
  readonly expectedAudience?: string;
  readonly merchantId: string;
}

export type MerchantVerificationRun =
  | Readonly<{
      catalogHash: string;
      catalogPublication: SignedMerchantCatalog;
      checks: readonly MerchantVerificationCheck[];
      manifestHash: string;
      manifestPublication: SignedMerchantManifest;
      valid: true;
    }>
  | Readonly<{
      checks: readonly MerchantVerificationCheck[];
      reason: MerchantVerificationFailureReason;
      valid: false;
    }>;

export async function verifyMerchant(
  input: VerifyMerchantInput,
  dependencies: MerchantVerificationDependencies = {},
): Promise<MerchantVerificationRun> {
  const now = dependencies.now?.() ?? new Date();
  const nowEpochMs = now.getTime();
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new RangeError("Merchant verification time must be safe epoch milliseconds");
  }
  const fetchPublication = dependencies.fetchPublication ?? fetchJsonPublication;
  const resolveHostname = dependencies.resolveHostname ?? resolvePublicAddresses;
  const expectedAudience = input.expectedAudience ?? DEFAULT_MINDPAY_API_AUDIENCE;
  const checks: MerchantVerificationCheck[] = [];

  let addresses: readonly string[];
  try {
    addresses = await resolveHostname(input.domain);
  } catch {
    return failed(checks, "DNS_RESOLUTION_FAILED", "DOMAIN", { domain: input.domain });
  }
  if (addresses.length === 0) {
    return failed(checks, "DNS_RESOLUTION_FAILED", "DOMAIN", { domain: input.domain });
  }
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    return failed(checks, "PRIVATE_NETWORK", "DOMAIN", { domain: input.domain });
  }
  checks.push(passed("DOMAIN", { addressCount: addresses.length, domain: input.domain }));

  const manifestUrl = `https://${input.domain}/.well-known/mindpay.json`;
  let manifestResponse: PublicationResponse;
  try {
    manifestResponse = await fetchPublication(manifestUrl);
  } catch {
    return failed(checks, "NETWORK_ERROR", "MANIFEST", { url: manifestUrl });
  }
  const manifestVerification = await verifyMerchantManifestPublication(
    {
      body: manifestResponse.body,
      expectedAudience,
      expectedUrl: manifestUrl,
      location: manifestResponse.location,
      responseUrl: manifestResponse.url,
      status: manifestResponse.status,
    },
    nowEpochMs,
  );
  if (!manifestVerification.valid) {
    return failed(checks, `MANIFEST_${manifestVerification.reason}`, "MANIFEST", {
      url: manifestUrl,
    });
  }
  const manifestPublication = signedMerchantManifestSchema.parse(manifestResponse.body);
  const manifestHash = await sha256CanonicalJsonHex(manifestPublication);
  if (manifestVerification.manifest.merchant_id !== input.merchantId) {
    return failed(checks, "DOMAIN_MISMATCH", "MANIFEST", { url: manifestUrl });
  }
  checks.push(
    passed("MANIFEST", {
      manifestHash,
      schemaVersion: manifestVerification.manifest.schema_version,
    }),
  );
  checks.push(passed("KEY", { kid: manifestVerification.manifest.kid }));
  checks.push(
    passed("ENDPOINTS", {
      acpOrigin: new URL(manifestVerification.manifest.acp_base_url).origin,
      catalogOrigin: new URL(manifestVerification.manifest.catalog_url).origin,
      mcpOrigin: new URL(manifestVerification.manifest.mcp_url).origin,
    }),
  );
  checks.push(
    passed("PAYMENT_CONFIGURATION", {
      rails: [...manifestVerification.manifest.payment_rails],
    }),
  );

  let catalogResponse: PublicationResponse;
  try {
    catalogResponse = await fetchPublication(manifestVerification.manifest.catalog_url);
  } catch {
    return failed(checks, "NETWORK_ERROR", "CATALOG", {
      url: manifestVerification.manifest.catalog_url,
    });
  }
  const catalogVerification = await verifyMerchantCatalogPublication(
    {
      body: catalogResponse.body,
      expectedAudience,
      expectedMerchantId: input.merchantId,
      expectedUrl: manifestVerification.manifest.catalog_url,
      location: catalogResponse.location,
      manifest: manifestVerification.manifest,
      responseUrl: catalogResponse.url,
      status: catalogResponse.status,
    },
    nowEpochMs,
  );
  if (!catalogVerification.valid) {
    return failed(checks, `CATALOG_${catalogVerification.reason}`, "CATALOG", {
      url: manifestVerification.manifest.catalog_url,
    });
  }
  const catalogPublication = signedMerchantCatalogSchema.parse(catalogResponse.body);
  const catalogHash = await sha256CanonicalJsonHex({
    catalogId: catalogPublication.catalog.catalog_id,
    seller: catalogPublication.catalog.seller,
    services: catalogPublication.catalog.services,
    version: catalogPublication.catalog.version,
  });
  checks.push(
    passed("CATALOG", {
      catalogHash,
      serviceCount: catalogVerification.catalog.services.length,
      version: catalogVerification.catalog.version,
    }),
  );

  return Object.freeze({
    catalogHash,
    catalogPublication,
    checks: Object.freeze(checks),
    manifestHash,
    manifestPublication,
    valid: true,
  });
}

export async function materialManifestFingerprint(manifest: MerchantManifest): Promise<string> {
  return sha256CanonicalJsonHex({
    acpBaseUrl: manifest.acp_base_url,
    catalogUrl: manifest.catalog_url,
    domain: manifest.domain,
    keys: manifest.signing_keys.map((key) => ({
      kid: key.kid,
      publicJwk: key.public_jwk,
      purpose: key.purpose,
      revokedAt: key.revoked_at ?? null,
      validFrom: key.valid_from,
      validUntil: key.valid_until ?? null,
    })),
    mcpUrl: manifest.mcp_url,
    paymentRails: manifest.payment_rails,
  });
}

export function compareSemanticVersions(left: string, right: string): -1 | 0 | 1 {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference < 0) return -1;
    if (difference > 0) return 1;
  }
  return 0;
}

export function catalogServiceFingerprint(service: MerchantCatalog["services"][number]): string {
  return JSON.stringify(service);
}

async function fetchJsonPublication(url: string): Promise<PublicationResponse> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(PUBLICATION_FETCH_TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await readBoundedJson(response);
  } catch {
    throw new Error("Merchant publication was not bounded JSON");
  }
  return {
    body,
    location: response.headers.get("location"),
    status: response.status,
    url: response.url,
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > PUBLICATION_MAX_BYTES
    ) {
      throw new Error("Merchant publication exceeded the size limit");
    }
  }
  if (response.body === null) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > PUBLICATION_MAX_BYTES) {
      await reader.cancel();
      throw new Error("Merchant publication exceeded the size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

async function resolvePublicAddresses(hostname: string): Promise<readonly string[]> {
  const addresses = new Set<string>();
  for (const type of ["A", "AAAA"] as const) {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      {
        headers: { accept: "application/dns-json" },
        redirect: "error",
        signal: AbortSignal.timeout(PUBLICATION_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error("DNS resolution failed");
    }
    const dns = dnsJsonSchema.parse(await response.json());
    if (dns.Status !== 0) continue;
    for (const answer of dns.Answer ?? []) {
      if (answer.type === 1 || answer.type === 28) addresses.add(answer.data);
    }
  }
  return [...addresses];
}

export function isPublicIpAddress(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (!isCanonicalIpv6Text(normalized) || !/^[23]/u.test(normalized)) return false;
    const [first = "", second = "0"] = normalized.split(":");
    const secondValue = Number.parseInt(second === "" ? "0" : second, 16);
    return !(
      (first === "2001" && secondValue <= 0x01ff) ||
      (first === "2001" && secondValue === 0x0db8)
    );
  }
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second, third] = parts as [number, number, number, number];
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third <= 2) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function isCanonicalIpv6Text(address: string): boolean {
  if (!/^[0-9a-f:]+$/u.test(address)) return false;
  const compressed = address.split("::");
  if (compressed.length > 2) return false;
  const groups = compressed.flatMap((part) => (part === "" ? [] : part.split(":")));
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return false;
  return compressed.length === 2 ? groups.length < 8 : groups.length === 8;
}

function passed(
  type: MerchantVerificationCheckType,
  evidence: Readonly<Record<string, unknown>>,
): MerchantVerificationCheck {
  return Object.freeze({ evidence, reason: null, status: "PASS", type });
}

function failed(
  checks: MerchantVerificationCheck[],
  reason: MerchantVerificationFailureReason,
  type: MerchantVerificationCheckType,
  evidence: Readonly<Record<string, unknown>>,
): MerchantVerificationRun {
  checks.push(Object.freeze({ evidence, reason, status: "FAIL", type }));
  return Object.freeze({ checks: Object.freeze(checks), reason, valid: false });
}
