import {
  type SignedDeliveryPublication,
  signedDeliveryPublicationSchema,
} from "@mindpay/contracts";
import {
  importEs256PublicJwk,
  sha256CanonicalJsonHex,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";
import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnvironment } from "./authorization";
import { broadcastAuditEvents, prepareAuditStatements } from "./audit";
import { validMachineToken } from "./merchant-payment-events";

const receiptBindingRowSchema = z
  .object({
    agent_id: z.string(),
    domain: z.string(),
    entitlement_expires_at: z.number().int().nonnegative(),
    entitlement_id: z.string(),
    entitlement_issued_at: z.number().int().nonnegative(),
    entitlement_status: z.string(),
    external_id: z.string(),
    merchant_id: z.string(),
    public_jwk: z.string(),
    revoked_at: z.number().int().nonnegative().nullable(),
    transaction_id: z.string(),
    transaction_retention_expires_at: z.number().int().nonnegative(),
    transaction_state: z.string(),
    valid_from: z.number().int().nonnegative(),
    valid_until: z.number().int().nonnegative().nullable(),
  })
  .strict();

export function createFulfilmentReceiptRoutes(dependencies: { readonly now?: () => Date } = {}) {
  const now = dependencies.now ?? (() => new Date());
  const routes = new Hono<GatewayEnvironment>();
  routes.post("/merchant-delivery-receipts", async (context) => {
    const receivedAt = now();
    if (!(await validMachineToken(context.req.header("Authorization"), context.env))) {
      return context.json({ code: "UNAUTHORIZED" }, 401);
    }
    let publication: SignedDeliveryPublication;
    try {
      publication = signedDeliveryPublicationSchema.parse(await context.req.json());
    } catch {
      return context.json({ code: "INVALID_DELIVERY_RECEIPT" }, 400);
    }
    const outputHash = await sha256CanonicalJsonHex(publication.result);
    if (outputHash !== publication.receipt.output_hash) {
      return context.json({ code: "DELIVERY_OUTPUT_HASH_MISMATCH" }, 409);
    }
    const duplicate = await context.env.DB.prepare(
      "SELECT output_hash, receipt_json, receipt_signature_json FROM fulfilment_results WHERE entitlement_id = ? LIMIT 1",
    )
      .bind(publication.receipt.entitlement_id)
      .first<{ output_hash: string; receipt_json: string; receipt_signature_json: string }>();
    if (duplicate !== null) {
      return duplicate.output_hash === outputHash &&
        (await sha256CanonicalJsonHex(JSON.parse(duplicate.receipt_json) as unknown)) ===
          (await sha256CanonicalJsonHex(publication.receipt)) &&
        (await sha256CanonicalJsonHex(JSON.parse(duplicate.receipt_signature_json) as unknown)) ===
          (await sha256CanonicalJsonHex(publication.signature))
        ? new Response(null, { status: 204 })
        : context.json({ code: "DELIVERY_RECEIPT_CONFLICT" }, 409);
    }

    const row = await context.env.DB.prepare(
      `SELECT e.id AS entitlement_id, e.status AS entitlement_status, e.transaction_id,
        e.issued_at AS entitlement_issued_at, e.expires_at AS entitlement_expires_at,
        e.agent_id, e.merchant_id, t.state AS transaction_state,
        t.retention_expires_at AS transaction_retention_expires_at, s.external_id, m.domain,
        k.public_jwk, k.valid_from, k.valid_until, k.revoked_at
       FROM entitlements e
       JOIN transactions t ON t.id = e.transaction_id
       JOIN service_versions sv ON sv.id = e.service_version_id
       JOIN services s ON s.id = sv.service_id
       JOIN merchants m ON m.id = e.merchant_id
       JOIN merchant_keys k ON k.merchant_id = m.id
       WHERE e.id = ? AND k.kid = ? AND k.purpose = 'event' LIMIT 1`,
    )
      .bind(publication.receipt.entitlement_id, publication.signature.kid)
      .first();
    if (row === null) return context.json({ code: "DELIVERY_RECEIPT_NOT_FOUND" }, 404);
    const binding = receiptBindingRowSchema.parse(row);
    if (!receiptBindingsMatch(publication, binding, context.env, receivedAt)) {
      return context.json({ code: "DELIVERY_RECEIPT_BINDING_MISMATCH" }, 409);
    }
    try {
      const verification = await verifyCanonicalJsonEs256(
        publication.receipt,
        publication.signature,
        [
          {
            kid: publication.signature.kid,
            publicKey: await importEs256PublicJwk(JSON.parse(binding.public_jwk) as unknown),
            validFromEpochMs: binding.valid_from,
            ...(binding.valid_until === null ? {} : { validUntilEpochMs: binding.valid_until }),
            ...(binding.revoked_at === null ? {} : { revokedAtEpochMs: binding.revoked_at }),
          },
        ],
        receivedAt.getTime(),
      );
      if (!verification.valid) return context.json({ code: "INVALID_DELIVERY_SIGNATURE" }, 401);
    } catch {
      return context.json({ code: "INVALID_DELIVERY_SIGNATURE" }, 401);
    }
    const completedAt = Date.parse(publication.receipt.completed_at);
    const receiptHash = await sha256CanonicalJsonHex(publication.receipt);
    const audit = await prepareAuditStatements(
      context.env,
      publication.receipt.transaction_id,
      [
        {
          actor: { id: publication.receipt.merchant_id, type: "MERCHANT" },
          eventType: "ENTITLEMENT_REDEEMED",
          payload: { entitlement_id: publication.receipt.entitlement_id },
        },
        {
          actor: { id: publication.receipt.merchant_id, type: "MERCHANT" },
          eventType: "FULFILMENT_COMPLETED",
          payload: {
            delivery_receipt_hash: receiptHash,
            output_hash: outputHash,
            service_id: publication.receipt.service_id,
          },
        },
      ],
      receivedAt,
      binding.transaction_retention_expires_at,
    );
    try {
      const results = await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT INTO fulfilment_results
           (id, entitlement_id, transaction_id, delivery_receipt_id, service_id, result_json,
            output_hash, receipt_json, receipt_signature_json, completed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `gfr_${createUlid(receivedAt.getTime())}`,
          publication.receipt.entitlement_id,
          publication.receipt.transaction_id,
          publication.receipt.delivery_receipt_id,
          publication.receipt.service_id,
          JSON.stringify(publication.result),
          outputHash,
          JSON.stringify(publication.receipt),
          JSON.stringify(publication.signature),
          completedAt,
          completedAt,
        ),
        context.env.DB.prepare(
          "UPDATE entitlements SET status = 'REDEEMED', redeemed_at = ? WHERE id = ? AND status = 'ISSUED'",
        ).bind(completedAt, publication.receipt.entitlement_id),
        context.env.DB.prepare(
          "UPDATE transactions SET state = 'FULFILLED', updated_at = ? WHERE id = ? AND state = 'ENTITLEMENT_ISSUED'",
        ).bind(receivedAt.getTime(), publication.receipt.transaction_id),
        context.env.DB.prepare("DELETE FROM entitlement_deliveries WHERE entitlement_id = ?").bind(
          publication.receipt.entitlement_id,
        ),
        ...audit.statements,
      ]);
      if ((results[1]?.meta.changes ?? 0) !== 1 || (results[2]?.meta.changes ?? 0) !== 1) {
        throw new Error("receipt raced");
      }
    } catch {
      return context.json({ code: "DELIVERY_RECEIPT_STATE_CONFLICT" }, 409);
    }
    await broadcastAuditEvents(context.env, publication.receipt.transaction_id, audit.publications);
    await context.env.EVIDENCE_QUEUE?.send({
      transactionId: publication.receipt.transaction_id,
    }).catch(() => undefined);
    return new Response(null, { status: 204 });
  });
  return routes;
}

function receiptBindingsMatch(
  publication: SignedDeliveryPublication,
  binding: z.infer<typeof receiptBindingRowSchema>,
  bindings: GatewayEnvironment["Bindings"],
  now: Date,
): boolean {
  const receipt = publication.receipt;
  return (
    binding.entitlement_status === "ISSUED" &&
    binding.transaction_state === "ENTITLEMENT_ISSUED" &&
    receipt.entitlement_id === binding.entitlement_id &&
    receipt.transaction_id === binding.transaction_id &&
    receipt.agent_id === binding.agent_id &&
    receipt.merchant_id === binding.merchant_id &&
    receipt.service_id === binding.external_id &&
    receipt.issuer === `https://${binding.domain}/` &&
    receipt.audience ===
      new URL(bindings.MINDPAY_API_AUDIENCE ?? "https://api.mindpay.example/").href &&
    Date.parse(receipt.completed_at) >= binding.entitlement_issued_at &&
    Date.parse(receipt.completed_at) < binding.entitlement_expires_at &&
    Date.parse(receipt.issued_at) <= now.getTime() + 60_000 &&
    Date.parse(receipt.expires_at) > now.getTime()
  );
}
