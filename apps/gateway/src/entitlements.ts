import { importAgentKeyEncryptionKey } from "@mindpay/agent-runtime";
import { entitlementIssueResponseSchema, entitlementJwtClaimsSchema } from "@mindpay/contracts";
import { canonicalizeJsonBytes, decryptAesGcm, encryptAesGcm, sha256Hex } from "@mindpay/crypto";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";
import { signEntitlementJwt } from "@mindpay/mcp-tools";
import { z } from "zod";
import type { GatewayAuthBindings } from "./auth";
import { loadOrCreateEntitlementSigningKey } from "./platform-signing";

const ENTITLEMENT_TTL_MS = 15 * 60 * 1_000;

const serviceBindingRowSchema = z.object({ domain: z.string(), external_id: z.string() }).strict();

export interface PaidEntitlementInput {
  readonly agentId: string;
  readonly amountSubunits: number;
  readonly checkoutHash: string;
  readonly merchantId: string;
  readonly organizationId: string;
  readonly retentionExpiresAt: number;
  readonly serviceVersionId: string;
  readonly transactionId: string;
  readonly userId: string;
}

export async function preparePaidEntitlement(
  bindings: GatewayAuthBindings,
  input: PaidEntitlementInput,
  issuedAt: Date,
): Promise<
  Readonly<{
    response: ReturnType<typeof entitlementIssueResponseSchema.parse>;
    statements: readonly D1PreparedStatement[];
  }>
> {
  const issuedAtEpochMs = Math.floor(issuedAt.getTime() / 1_000) * 1_000;
  const expiresAtEpochMs = issuedAtEpochMs + ENTITLEMENT_TTL_MS;
  const serviceRow = await bindings.DB.prepare(
    `SELECT s.external_id, m.domain FROM service_versions sv
     JOIN services s ON s.id = sv.service_id
     JOIN merchants m ON m.id = s.merchant_id
     WHERE sv.id = ? AND m.id = ? AND s.status = 'ACTIVE' AND m.status = 'ACTIVE'
       AND m.verification_status = 'APPROVED' LIMIT 1`,
  )
    .bind(input.serviceVersionId, input.merchantId)
    .first();
  if (serviceRow === null) throw new Error("Paid service binding is unavailable");
  const service = serviceBindingRowSchema.parse(serviceRow);
  const entitlementId = `ent_${createUlid(issuedAtEpochMs)}`;
  const signingKey = await loadOrCreateEntitlementSigningKey(bindings, issuedAtEpochMs);
  const issuer = new URL(bindings.MINDPAY_API_AUDIENCE ?? "https://api.mindpay.example/").href;
  const audience = new URL(`https://${service.domain}/`).href;
  const claims = entitlementJwtClaimsSchema.parse({
    agent_id: input.agentId,
    amount_subunits: input.amountSubunits,
    aud: audience,
    checkout_hash: input.checkoutHash,
    currency: "INR",
    exp: Math.floor(expiresAtEpochMs / 1_000),
    iat: Math.floor(issuedAtEpochMs / 1_000),
    iss: issuer,
    jti: entitlementId,
    merchant_id: input.merchantId,
    schema_version: "mindpay.entitlement.jwt.1",
    scopes: ["service:redeem"],
    service_id: service.external_id,
    sub: input.agentId,
    transaction_id: input.transactionId,
  });
  const token = await signEntitlementJwt(claims, signingKey);
  const tokenHash = await sha256Hex(token);
  const encryptionKey = await importAgentKeyEncryptionKey(bindings.AGENT_KEY_ENCRYPTION_KEY);
  const encryptedToken = await encryptAesGcm(
    encryptionKey,
    token,
    entitlementDeliveryContext(entitlementId),
  );
  const statements = Object.freeze([
    bindings.DB.prepare(
      `INSERT INTO entitlements
       (id, organization_id, user_id, transaction_id, agent_id, merchant_id, service_version_id,
        signing_kid, token_hash, scopes_json, status, issued_at, expires_at, redeemed_at,
        retention_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, NULL, ?, ?)`,
    ).bind(
      entitlementId,
      input.organizationId,
      input.userId,
      input.transactionId,
      input.agentId,
      input.merchantId,
      input.serviceVersionId,
      signingKey.kid,
      tokenHash,
      JSON.stringify(claims.scopes),
      issuedAtEpochMs,
      expiresAtEpochMs,
      input.retentionExpiresAt,
      issuedAtEpochMs,
    ),
    bindings.DB.prepare(
      `INSERT INTO entitlement_deliveries (entitlement_id, encrypted_token, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(entitlementId, JSON.stringify(encryptedToken), expiresAtEpochMs, issuedAtEpochMs),
    bindings.DB.prepare(
      `UPDATE transactions SET state = 'ENTITLEMENT_ISSUED', updated_at = ?
       WHERE id = ? AND state = 'PAYMENT_CAPTURED'`,
    ).bind(issuedAt.getTime(), input.transactionId),
  ]);
  return Object.freeze({
    response: entitlementIssueResponseSchema.parse({
      entitlementId,
      expiresAt: utcTimestampFromDate(new Date(expiresAtEpochMs)),
      scopes: claims.scopes,
      serviceId: claims.service_id,
      state: "ENTITLEMENT_ISSUED",
      transactionId: input.transactionId,
    }),
    statements,
  });
}

export async function readEntitlementToken(
  bindings: GatewayAuthBindings,
  entitlementId: string,
  nowEpochMs = Date.now(),
): Promise<string | null> {
  const row = await bindings.DB.prepare(
    `SELECT d.encrypted_token FROM entitlement_deliveries d
     JOIN entitlements e ON e.id = d.entitlement_id
     WHERE d.entitlement_id = ? AND d.expires_at > ? AND e.status = 'ISSUED' LIMIT 1`,
  )
    .bind(entitlementId, nowEpochMs)
    .first<{ encrypted_token: string }>();
  if (row === null) return null;
  const key = await importAgentKeyEncryptionKey(bindings.AGENT_KEY_ENCRYPTION_KEY);
  const plaintext = await decryptAesGcm(
    key,
    JSON.parse(row.encrypted_token) as unknown,
    entitlementDeliveryContext(entitlementId),
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

function entitlementDeliveryContext(entitlementId: string) {
  return canonicalizeJsonBytes({
    entitlementId,
    purpose: "mindpay:entitlement-delivery",
    version: 1,
  });
}
