import {
  type EntitlementJwtClaims,
  entitlementJwtClaimsSchema,
  entitlementJwtHeaderSchema,
  entitlementJwtSchema,
} from "@mindpay/contracts";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  signEs256,
  toBytes,
  verifyEs256,
} from "@mindpay/crypto";
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  McpServer,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";

export { McpServer };
export type { AuthInfo, McpRequestContext } from "@modelcontextprotocol/server";

export interface EntitlementJwtSigningKey {
  readonly kid: string;
  readonly privateKey: CryptoKey;
}

export interface EntitlementJwtVerificationKey {
  readonly kid: string;
  readonly publicKey: CryptoKey;
  readonly revokedAtEpochMs?: number;
  readonly validFromEpochMs: number;
  readonly validUntilEpochMs?: number;
}

export interface EntitlementVerificationRequirements {
  readonly agentId?: string;
  readonly audience: string;
  readonly issuer: string;
  readonly merchantId: string;
  readonly nowEpochMs?: number;
  readonly serviceId: string;
  readonly transactionId?: string;
}

export type EntitlementJwtVerificationResult =
  | Readonly<{ claims: EntitlementJwtClaims; tokenHashInput: string; valid: true }>
  | Readonly<{
      reason:
        | "EXPIRED"
        | "INVALID_BINDING"
        | "INVALID_CLAIMS"
        | "INVALID_SIGNATURE"
        | "KEY_UNAVAILABLE"
        | "UNKNOWN_KEY";
      valid: false;
    }>;

const jsonRecordSchema = z.record(z.string(), z.unknown());

export async function signEntitlementJwt(
  untrustedClaims: unknown,
  key: EntitlementJwtSigningKey,
): Promise<string> {
  const claims = entitlementJwtClaimsSchema.parse(untrustedClaims);
  const header = entitlementJwtHeaderSchema.parse({ alg: "ES256", kid: key.kid, typ: "JWT" });
  const encodedHeader = encodeJson(header);
  const encodedClaims = encodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = await signEs256(key.privateKey, toBytes(signingInput));
  return entitlementJwtSchema.parse(`${signingInput}.${bytesToBase64Url(signature)}`);
}

export async function verifyEntitlementJwt(
  untrustedToken: unknown,
  keys: readonly EntitlementJwtVerificationKey[],
  requirements: EntitlementVerificationRequirements,
): Promise<EntitlementJwtVerificationResult> {
  const token = entitlementJwtSchema.safeParse(untrustedToken);
  if (!token.success) return invalid("INVALID_CLAIMS");
  const segments = token.data.split(".");
  const encodedHeader = segments[0];
  const encodedClaims = segments[1];
  const encodedSignature = segments[2];
  if (
    encodedHeader === undefined ||
    encodedClaims === undefined ||
    encodedSignature === undefined
  ) {
    return invalid("INVALID_CLAIMS");
  }

  let header: z.infer<typeof entitlementJwtHeaderSchema>;
  let claims: EntitlementJwtClaims;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = entitlementJwtHeaderSchema.parse(decodeJson(encodedHeader));
    claims = entitlementJwtClaimsSchema.parse(decodeJson(encodedClaims));
    signature = base64UrlToBytes(encodedSignature);
  } catch {
    return invalid("INVALID_CLAIMS");
  }

  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (key === undefined) return invalid("UNKNOWN_KEY");
  const nowEpochMs = requirements.nowEpochMs ?? Date.now();
  if (
    nowEpochMs < key.validFromEpochMs ||
    (key.validUntilEpochMs !== undefined && nowEpochMs >= key.validUntilEpochMs) ||
    (key.revokedAtEpochMs !== undefined && nowEpochMs >= key.revokedAtEpochMs)
  ) {
    return invalid("KEY_UNAVAILABLE");
  }
  if (
    !(await verifyEs256(key.publicKey, toBytes(`${encodedHeader}.${encodedClaims}`), signature))
  ) {
    return invalid("INVALID_SIGNATURE");
  }

  const nowEpochSeconds = Math.floor(nowEpochMs / 1_000);
  if (claims.iat > nowEpochSeconds + 60 || claims.exp <= nowEpochSeconds) {
    return invalid("EXPIRED");
  }
  if (
    claims.iss !== requirements.issuer ||
    claims.aud !== requirements.audience ||
    claims.merchant_id !== requirements.merchantId ||
    claims.service_id !== requirements.serviceId ||
    (requirements.agentId !== undefined && claims.agent_id !== requirements.agentId) ||
    (requirements.transactionId !== undefined &&
      claims.transaction_id !== requirements.transactionId)
  ) {
    return invalid("INVALID_BINDING");
  }

  return Object.freeze({ claims, tokenHashInput: token.data, valid: true });
}

export function createRemoteMcpHandler(
  factory: (context: McpRequestContext) => McpServer | Promise<McpServer>,
) {
  return createMcpHandler(factory, {
    legacy: "stateless",
  });
}

export function validateMcpHost(
  request: Request,
  allowedHostnames: readonly string[],
): Response | undefined {
  return hostHeaderValidationResponse(request, [...allowedHostnames]);
}

export function mcpStructuredResult<T extends Readonly<Record<string, unknown>>>(output: T) {
  return {
    content: [{ text: JSON.stringify(output), type: "text" as const }],
    structuredContent: output,
  };
}

export function mcpToolError(code: string) {
  const safeCode = /^[A-Z][A-Z0-9_]{2,63}$/u.test(code) ? code : "TOOL_EXECUTION_FAILED";
  return {
    content: [{ text: JSON.stringify({ error: safeCode }), type: "text" as const }],
    isError: true,
  };
}

function invalid(reason: Exclude<EntitlementJwtVerificationResult, { valid: true }>["reason"]) {
  return Object.freeze({ reason, valid: false as const });
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(toBytes(JSON.stringify(value)));
}

function decodeJson(value: string): Readonly<Record<string, unknown>> {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(value));
  return Object.freeze(jsonRecordSchema.parse(JSON.parse(decoded) as unknown));
}
