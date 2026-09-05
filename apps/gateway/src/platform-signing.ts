import { importAgentKeyEncryptionKey } from "@mindpay/agent-runtime";
import { platformJwksSchema } from "@mindpay/contracts";
import {
  decryptEs256PrivateJwk,
  encryptEs256PrivateJwk,
  exportEs256PrivateJwk,
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importEs256PrivateJwk,
} from "@mindpay/crypto";
import { z } from "zod";
import type { GatewayAuthBindings } from "./auth";

const PLATFORM_KEY_ID = "psk_mindpay_entitlement_2026_09";
const PLATFORM_KEY_KID = "mindpay.entitlement.2026-09";

const platformKeyRowSchema = z
  .object({
    encrypted_private_jwk: z.string().min(1),
    kid: z.string(),
    public_jwk: z.string().min(1),
    revoked_at: z.number().int().nonnegative().nullable(),
    valid_from: z.number().int().nonnegative(),
    valid_until: z.number().int().nonnegative().nullable(),
  })
  .strict();

export async function loadOrCreateEntitlementSigningKey(
  bindings: GatewayAuthBindings,
  nowEpochMs: number,
) {
  let row = await readActiveKey(bindings.DB, nowEpochMs);
  if (row === null) {
    const encryptionKey = await importAgentKeyEncryptionKey(bindings.AGENT_KEY_ENCRYPTION_KEY);
    const pair = await generateEs256KeyPair(true);
    const [privateJwk, publicJwk] = await Promise.all([
      exportEs256PrivateJwk(pair.privateKey),
      exportEs256PublicJwk(pair.publicKey),
    ]);
    const encrypted = await encryptEs256PrivateJwk(
      encryptionKey,
      privateJwk,
      platformKeyContext(PLATFORM_KEY_KID),
    );
    await bindings.DB.prepare(
      `INSERT OR IGNORE INTO platform_signing_keys
       (id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at, created_at)
       VALUES (?, ?, 'entitlement', ?, ?, ?, NULL, NULL, ?)`,
    )
      .bind(
        PLATFORM_KEY_ID,
        PLATFORM_KEY_KID,
        JSON.stringify(publicJwk),
        JSON.stringify(encrypted),
        nowEpochMs,
        nowEpochMs,
      )
      .run();
    row = await readActiveKey(bindings.DB, nowEpochMs);
  }
  if (row === null) throw new Error("No entitlement signing key is available");
  const encryptionKey = await importAgentKeyEncryptionKey(bindings.AGENT_KEY_ENCRYPTION_KEY);
  const privateJwk = await decryptEs256PrivateJwk(
    encryptionKey,
    parseJson(row.encrypted_private_jwk),
    platformKeyContext(row.kid),
  );
  return Object.freeze({
    kid: row.kid,
    privateKey: await importEs256PrivateJwk(privateJwk),
    publicJwk: parseJson(row.public_jwk),
    validFromEpochMs: row.valid_from,
  });
}

/**
 * The platform key signs domain-separated canonical payloads for entitlements,
 * audit events, and evidence bundles. The persisted purpose remains stable for
 * compatibility with the Phase 8 migration and published JWKS.
 */
export const loadOrCreatePlatformSigningKey = loadOrCreateEntitlementSigningKey;

export async function readPlatformJwks(database: D1Database, nowEpochMs = Date.now()) {
  const result = await database
    .prepare(
      `SELECT kid, public_jwk FROM platform_signing_keys
       WHERE purpose = 'entitlement' AND valid_from <= ?
         AND (valid_until IS NULL OR valid_until > ?)
         AND (revoked_at IS NULL OR revoked_at > ?)
       ORDER BY valid_from DESC LIMIT 8`,
    )
    .bind(nowEpochMs, nowEpochMs, nowEpochMs)
    .all();
  return platformJwksSchema.parse({
    keys: result.results.map((untrusted) => {
      const row = z.object({ kid: z.string(), public_jwk: z.string() }).strict().parse(untrusted);
      const jwk = parseJson(row.public_jwk);
      return { ...jwk, alg: "ES256", kid: row.kid, use: "sig" };
    }),
  });
}

async function readActiveKey(database: D1Database, nowEpochMs: number) {
  const row = await database
    .prepare(
      `SELECT kid, public_jwk, encrypted_private_jwk, valid_from, valid_until, revoked_at
       FROM platform_signing_keys WHERE purpose = 'entitlement' AND valid_from <= ?
         AND (valid_until IS NULL OR valid_until > ?) AND (revoked_at IS NULL OR revoked_at > ?)
       ORDER BY valid_from DESC LIMIT 1`,
    )
    .bind(nowEpochMs, nowEpochMs, nowEpochMs)
    .first();
  return row === null ? null : platformKeyRowSchema.parse(row);
}

function platformKeyContext(kid: string) {
  return Object.freeze({ kid, owner: "mindpay-platform", purpose: "entitlement" });
}

function parseJson(serialized: string): Readonly<Record<string, unknown>> {
  return z
    .record(z.string(), z.unknown())
    .readonly()
    .parse(JSON.parse(serialized) as unknown);
}
