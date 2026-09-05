import {
  createTransactionRequestSchema,
  merchantCheckoutSchema,
  purchasePreparationRequestSchema,
  purchasePreparationResponseSchema,
  es256CanonicalSignatureSchema,
  purchaseProposalSchema,
} from "@mindpay/contracts";
import { base64UrlToBytes } from "@mindpay/crypto";
import { createUlid, idempotencyKeySchema } from "@mindpay/domain";
import { ACP_VERSION } from "@mindpay/protocol-acp";
import { Hono } from "hono";
import { z } from "zod";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
  resourceNotFound,
} from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";

const runRowSchema = z
  .object({
    agent_id: z.string(),
    agent_version_id: z.string(),
    proposal_json: z.string(),
    user_id: z.string(),
  })
  .strict();
const mandatePairSchema = z.object({ checkout_id: z.string(), payment_id: z.string() }).strict();

export function createPurchasePreparationRoutes() {
  const routes = new Hono<GatewayEnvironment>();
  routes.use("*", requireAuthentication);
  routes.use("*", requireOrganizationCapability("agent:write"));
  routes.post("/", async (context) => {
    const request = purchasePreparationRequestSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    const key = idempotencyKeySchema.safeParse(context.req.header(IDEMPOTENCY_KEY_HEADER));
    if (!request.success || !key.success)
      return apiError(
        context,
        400,
        "INVALID_REQUEST",
        "A valid proposal and idempotency key are required.",
      );
    const organizationId = context.get("organizationAuthorization").organization.id;
    const principal = context.get("principal");
    const row = await context.env.DB.prepare(
      `SELECT agent_id, agent_version_id, proposal_json, user_id FROM agent_runs
       WHERE id = ? AND organization_id = ? AND user_id = ? AND status = 'SUCCEEDED'
         AND proposal_json IS NOT NULL LIMIT 1`,
    )
      .bind(request.data.agentRunId, organizationId, principal.id)
      .first();
    if (row === null) return resourceNotFound(context);
    const run = runRowSchema.parse(row);
    const proposal = purchaseProposalSchema.parse(JSON.parse(run.proposal_json) as unknown);
    if (
      proposal.merchant.id !== "merchant_signalworks" ||
      context.env.SIGNALWORKS === undefined ||
      context.env.SIGNALWORKS_MACHINE_AUTH_TOKEN === undefined
    ) {
      return apiError(
        context,
        409,
        "TRANSACTION_STATE_CONFLICT",
        "This merchant does not have an active server-side checkout connector.",
      );
    }
    const pair = await context.env.DB.prepare(
      `SELECT c.id AS checkout_id, p.id AS payment_id FROM mandates c JOIN mandates p
       ON p.organization_id = c.organization_id AND p.user_id = c.user_id AND p.agent_id = c.agent_id
         AND p.agent_version_id = c.agent_version_id
       WHERE c.organization_id = ? AND c.user_id = ? AND c.agent_id = ? AND c.agent_version_id = ?
         AND c.kind = 'CHECKOUT' AND p.kind = 'PAYMENT' AND c.status = 'ACTIVE' AND p.status = 'ACTIVE'
         AND c.expires_at > ? AND p.expires_at > ? ORDER BY c.created_at DESC LIMIT 1`,
    )
      .bind(
        organizationId,
        principal.id,
        run.agent_id,
        run.agent_version_id,
        Date.now(),
        Date.now(),
      )
      .first();
    if (pair === null)
      return apiError(
        context,
        409,
        "TRANSACTION_STATE_CONFLICT",
        "Activate a compatible checkout and payment mandate pair before buying.",
      );
    const mandates = mandatePairSchema.parse(pair);
    const merchantResponse = await context.env.SIGNALWORKS.fetch(
      new Request("https://merchant-demo.example.com/checkout_sessions", {
        body: JSON.stringify({
          capabilities: {},
          currency: "inr",
          line_items: [{ id: proposal.service.externalId, unit_amount: 1 }],
        }),
        headers: {
          "API-Version": ACP_VERSION,
          Authorization: `Bearer ${context.env.SIGNALWORKS_MACHINE_AUTH_TOKEN}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key.data,
          "Request-Id": `request_${createUlid()}`,
        },
        method: "POST",
      }),
    );
    if (!merchantResponse.ok)
      return apiError(
        context,
        500,
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "The merchant checkout could not be prepared.",
      );
    try {
      const checkout = merchantCheckoutSchema.parse(
        decodeHeader(merchantResponse, "x-mindpay-checkout"),
      );
      const checkoutSignature = es256CanonicalSignatureSchema.parse(
        decodeHeader(merchantResponse, "x-mindpay-checkout-signature"),
      );
      const transactionRequest = createTransactionRequestSchema.parse({
        checkout,
        checkoutMandateId: mandates.checkout_id,
        checkoutSignature,
        offerHash: proposal.catalogHash,
        offerId: `offer_${proposal.id.slice(4)}`,
        paymentMandateId: mandates.payment_id,
        paymentRail: proposal.paymentRail,
      });
      return context.json(purchasePreparationResponseSchema.parse({ transactionRequest }), 201);
    } catch {
      return apiError(
        context,
        500,
        "TRANSACTION_STATE_CONFLICT",
        "The merchant returned an invalid signed checkout.",
      );
    }
  });
  return routes;
}

function decodeHeader(response: Response, name: string): unknown {
  const value = response.headers.get(name);
  if (value === null) throw new Error(`Missing ${name}`);
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as unknown;
}
