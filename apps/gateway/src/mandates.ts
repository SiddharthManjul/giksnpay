import {
  agentIdSchema,
  authenticatorTransportSchema,
  mandateIdSchema,
  merchantHttpsUrlSchema,
  openCheckoutMandateSchema,
  openPaymentMandateSchema,
  passkeyCredentialIdSchema,
} from "@mindpay/contracts";
import {
  base64UrlToBytes,
  hexToBytes,
  sha256CanonicalJsonHex,
  sha256Hex,
  timingSafeEqual,
} from "@mindpay/crypto";
import { createUlid, utcTimestampFromDate, utcTimestampSchema } from "@mindpay/domain";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
  resourceNotFound,
} from "./authorization";
import {
  beginIdempotentMutation,
  completeIdempotentMutation,
  failIdempotentMutation,
} from "./mutation-idempotency";
import {
  parseTransports,
  passkeyEnvironment,
  readJsonBody,
  trustedRequestOrigin,
} from "./passkeys";

export const MANDATE_APPROVAL_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const MANDATE_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1_000;

export interface MandateRouteDependencies {
  readonly generateAuthenticationOptions?: typeof generateAuthenticationOptions;
  readonly now?: () => Date;
  readonly verifyAuthenticationResponse?: typeof verifyAuthenticationResponse;
}

const createMandateRequestSchema = z
  .object({
    agentId: agentIdSchema,
    allowedCategories: z.array(z.string().min(3).max(96)).min(1).max(100),
    allowedMerchants: z.array(z.string().min(12).max(96)).min(1).max(100),
    allowedRails: z.array(z.literal("razorpay:test")).min(1).max(1),
    allowedServices: z.array(z.string().min(3).max(96)).min(1).max(500),
    approvalThresholdSubunits: z.number().int().nonnegative(),
    currency: z.literal("INR"),
    expiresAt: utcTimestampSchema,
    maxAttemptsPerTransaction: z.number().int().min(1).max(10),
    maxLineItems: z.number().int().min(1).max(20),
    maxQuantityPerItem: z.number().int().min(1).max(100),
    maxTransactionSubunits: z.number().int().nonnegative(),
    maxTransactions: z.number().int().min(1).max(1_000),
    maxUnitPriceSubunits: z.number().int().nonnegative(),
    passkeyId: passkeyCredentialIdSchema,
    totalBudgetSubunits: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.approvalThresholdSubunits > value.maxTransactionSubunits) {
      context.addIssue({
        code: "custom",
        message: "Approval threshold cannot exceed the per-transaction maximum",
        path: ["approvalThresholdSubunits"],
      });
    }
    if (value.maxTransactionSubunits > value.totalBudgetSubunits) {
      context.addIssue({
        code: "custom",
        message: "Per-transaction maximum cannot exceed the total budget",
        path: ["maxTransactionSubunits"],
      });
    }
  });

const mandateChallengeRequestSchema = z
  .object({ credentialId: passkeyCredentialIdSchema })
  .strict();
const mandateActivationRequestSchema = z
  .object({
    challengeId: z.string().regex(/^apc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    response: z.record(z.string(), z.unknown()),
  })
  .strict();

const mandateRowSchema = z
  .object({
    activated_at: z.number().int().nonnegative().nullable(),
    agent_id: z.string(),
    agent_version_id: z.string(),
    approval_threshold_subunits: z.number().int().nonnegative().nullable(),
    budget_subunits: z.number().int().nonnegative().nullable(),
    completed_transactions: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
    expires_at: z.number().int().nonnegative(),
    id: z.string(),
    kind: z.enum(["CHECKOUT", "PAYMENT"]),
    max_attempts: z.number().int().nonnegative().nullable(),
    max_transaction_subunits: z.number().int().nonnegative().nullable(),
    max_transactions: z.number().int().nonnegative().nullable(),
    organization_id: z.string(),
    payload_hash: z.string(),
    payload_json: z.string(),
    reserved_subunits: z.number().int().nonnegative(),
    retention_expires_at: z.number().int().nonnegative(),
    spent_subunits: z.number().int().nonnegative(),
    starts_at: z.number().int().nonnegative(),
    status: z.enum(["ACTIVE", "DRAFT", "EXHAUSTED", "EXPIRED", "REVOKED", "SUSPENDED"]),
    terminal_at: z.number().int().nonnegative().nullable(),
    updated_at: z.number().int().nonnegative(),
    user_id: z.string(),
  })
  .passthrough();

const passkeyRowSchema = z
  .object({
    counter: z.number().int().nonnegative(),
    credential_id: z.string(),
    id: z.string(),
    public_key: z.string(),
    transports: z.string(),
  })
  .strict();

export function createMandateRoutes(dependencies: MandateRouteDependencies = {}) {
  const generateOptions =
    dependencies.generateAuthenticationOptions ?? generateAuthenticationOptions;
  const now = dependencies.now ?? (() => new Date());
  const verifyResponse = dependencies.verifyAuthenticationResponse ?? verifyAuthenticationResponse;
  const routes = new Hono<GatewayEnvironment>();

  routes.use("*", requireAuthentication);
  routes.use("*", requireOrganizationCapability("agent:read"));

  routes.post("/", requireOrganizationCapability("agent:write"), async (context) => {
    const body = await readJsonBody(context.req.raw);
    const request = createMandateRequestSchema.safeParse(body);
    const createdAt = now();
    if (!request.success || Date.parse(request.data?.expiresAt ?? "") <= createdAt.getTime()) {
      return apiError(context, 400, "INVALID_REQUEST", "The mandate request is invalid.");
    }
    const claim = await beginIdempotentMutation(
      context,
      "create-mandate-pair",
      request.data.agentId,
      request.data,
      createdAt.getTime(),
    );
    if (claim instanceof Response) return claim;

    const organizationId = context.get("organizationAuthorization").organization.id;
    const principal = context.get("principal");
    const [agent, passkey] = await Promise.all([
      context.env.DB.prepare(
        `SELECT a.id, a.current_version_id, v.version, k.id AS key_id, k.kid, k.public_jwk
         FROM agents a
         JOIN agent_versions v ON v.id = a.current_version_id AND v.agent_id = a.id
         JOIN agent_keys k ON k.agent_id = a.id AND k.revoked_at IS NULL
         WHERE a.id = ? AND a.organization_id = ? AND a.status = 'ACTIVE' AND v.published_at IS NOT NULL
         ORDER BY k.valid_from DESC LIMIT 1`,
      )
        .bind(request.data.agentId, organizationId)
        .first<{
          current_version_id: string;
          id: string;
          key_id: string;
          kid: string;
          public_jwk: string;
          version: string;
        }>(),
      context.env.DB.prepare("SELECT id FROM passkey_credentials WHERE id = ? AND user_id = ?")
        .bind(request.data.passkeyId, principal.id)
        .first<{ id: string }>(),
    ]);
    if (agent === null || passkey === null) {
      return failIdempotentMutation(
        context,
        claim,
        404,
        "RESOURCE_NOT_FOUND",
        "The bound agent or passkey was not found.",
      );
    }

    const apiAudience = configuredApiAudience(context);
    if (apiAudience === undefined) {
      return failIdempotentMutation(
        context,
        claim,
        500,
        "MANDATE_STATE_CONFLICT",
        "The canonical MindPay API audience is not configured.",
      );
    }
    const issuedAt = utcTimestampFromDate(createdAt);
    const checkoutId = `mnd_${createUlid(createdAt.getTime())}`;
    const paymentId = `mnd_${createUlid(createdAt.getTime())}`;
    const agentBinding = {
      agent_id: agent.id,
      agent_version: agent.version,
      key_id: agent.kid,
      public_jwk: JSON.parse(agent.public_jwk) as unknown,
    };
    const common = {
      agent: agentBinding,
      audience: apiAudience,
      expires_at: request.data.expiresAt,
      issued_at: issuedAt,
      issuer: apiAudience,
      kid: request.data.passkeyId,
      organization_id: organizationId,
      user_id: principal.id,
    };
    const checkoutMandate = openCheckoutMandateSchema.parse({
      ...common,
      allowed_categories: request.data.allowedCategories,
      allowed_merchants: request.data.allowedMerchants,
      allowed_services: request.data.allowedServices,
      line_item_constraints: {
        currency: request.data.currency,
        max_line_items: request.data.maxLineItems,
        max_quantity_per_item: request.data.maxQuantityPerItem,
        max_unit_price_subunits: request.data.maxUnitPriceSubunits,
      },
      mandate_id: checkoutId,
      nonce: `omc_${createUlid(createdAt.getTime())}`,
      schema_version: "mindpay.mandate.checkout.open.1",
    });
    const paymentMandate = openPaymentMandateSchema.parse({
      ...common,
      allowed_payees: request.data.allowedMerchants,
      allowed_rails: request.data.allowedRails,
      approval_threshold_subunits: request.data.approvalThresholdSubunits,
      currency: request.data.currency,
      mandate_id: paymentId,
      max_attempts_per_transaction: request.data.maxAttemptsPerTransaction,
      max_transaction_subunits: request.data.maxTransactionSubunits,
      max_transactions: request.data.maxTransactions,
      nonce: `omp_${createUlid(createdAt.getTime())}`,
      schema_version: "mindpay.mandate.payment.open.1",
      total_budget_subunits: request.data.totalBudgetSubunits,
    });
    const expiresAt = new Date(request.data.expiresAt).getTime();
    const retentionExpiresAt = expiresAt + MANDATE_RETENTION_MS;
    const [checkoutHash, paymentHash] = await Promise.all([
      sha256CanonicalJsonHex(checkoutMandate),
      sha256CanonicalJsonHex(paymentMandate),
    ]);

    try {
      await context.env.DB.batch([
        insertMandateStatement(context, {
          agentVersionId: agent.current_version_id,
          expiresAt,
          hash: checkoutHash,
          id: checkoutId,
          kind: "CHECKOUT",
          mandate: checkoutMandate,
          organizationId,
          retentionExpiresAt,
          userId: principal.id,
        }),
        insertMandateStatement(context, {
          agentVersionId: agent.current_version_id,
          expiresAt,
          hash: paymentHash,
          id: paymentId,
          kind: "PAYMENT",
          mandate: paymentMandate,
          organizationId,
          retentionExpiresAt,
          userId: principal.id,
        }),
      ]);
    } catch {
      return failIdempotentMutation(
        context,
        claim,
        409,
        "MANDATE_STATE_CONFLICT",
        "The mandate pair could not be created.",
      );
    }

    return completeIdempotentMutation(context, claim, 201, {
      mandates: [
        mandateResponse(checkoutMandate, checkoutHash, "DRAFT"),
        mandateResponse(paymentMandate, paymentHash, "DRAFT"),
      ],
    });
  });

  routes.get("/", async (context) => {
    const rows = await context.env.DB.prepare(
      `SELECT * FROM mandates WHERE organization_id = ? AND user_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
      .bind(context.get("organizationAuthorization").organization.id, context.get("principal").id)
      .all();
    return context.json({ mandates: rows.results.map(parseMandateResponse) });
  });

  routes.get("/:mandateId", async (context) => {
    const row = await ownedMandate(context, context.req.param("mandateId"));
    if (row === undefined) return resourceNotFound(context);
    return context.json(parseMandateResponse(row));
  });

  routes.post(
    "/:mandateId/challenges",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const body = await readJsonBody(context.req.raw);
      const request = mandateChallengeRequestSchema.safeParse(body);
      const createdAt = now();
      if (!request.success) {
        return apiError(context, 400, "INVALID_REQUEST", "The approval request is invalid.");
      }
      const mandateId = context.req.param("mandateId");
      const claim = await beginIdempotentMutation(
        context,
        "mandate-challenge",
        mandateId,
        request.data,
        createdAt.getTime(),
      );
      if (claim instanceof Response) return claim;
      const mandate = await ownedMandate(context, mandateId);
      if (mandate === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          404,
          "RESOURCE_NOT_FOUND",
          "The mandate was not found.",
        );
      }
      if (mandate.status !== "DRAFT" || mandate.expires_at <= createdAt.getTime()) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "MANDATE_STATE_CONFLICT",
          "Only an unexpired draft mandate can be activated.",
        );
      }
      const passkey = await ownedPasskey(context, request.data.credentialId);
      if (passkey === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          404,
          "RESOURCE_NOT_FOUND",
          "The passkey was not found.",
        );
      }
      const environment = passkeyEnvironment(context.env);
      const origin = trustedRequestOrigin(context.req.raw, environment.TRUSTED_ORIGINS);
      if (origin === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "APPROVAL_CHALLENGE_INVALID",
          "The request origin is not trusted.",
        );
      }
      const options = await generateOptions({
        allowCredentials: [
          {
            id: passkey.credential_id,
            transports: parseTransports(parseJsonArray(passkey.transports)),
          },
        ],
        challenge: hexToBytes(mandate.payload_hash),
        rpID: environment.PASSKEY_RP_ID,
        timeout: MANDATE_APPROVAL_CHALLENGE_TTL_MS,
        userVerification: "required",
      });
      const challengeId = `apc_${createUlid(createdAt.getTime())}`;
      await context.env.DB.prepare(
        `UPDATE approval_challenges SET state = 'EXPIRED'
         WHERE organization_id = ? AND user_id = ? AND mandate_id = ?
           AND purpose = 'MANDATE_ACTIVATION' AND state = 'PENDING' AND expires_at <= ?`,
      )
        .bind(
          context.get("organizationAuthorization").organization.id,
          context.get("principal").id,
          mandate.id,
          createdAt.getTime(),
        )
        .run();
      await context.env.DB.prepare(
        `INSERT INTO approval_challenges
         (id, organization_id, user_id, session_id, mandate_id, credential_id, transaction_id,
          rp_id, origin, purpose, challenge_hash, payload_hash, state, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'MANDATE_ACTIVATION', ?, ?, 'PENDING', ?, NULL, ?)`,
      )
        .bind(
          challengeId,
          context.get("organizationAuthorization").organization.id,
          context.get("principal").id,
          context.get("principal").sessionId,
          mandate.id,
          passkey.id,
          environment.PASSKEY_RP_ID,
          origin,
          await sha256Hex(options.challenge),
          mandate.payload_hash,
          createdAt.getTime() + MANDATE_APPROVAL_CHALLENGE_TTL_MS,
          createdAt.getTime(),
        )
        .run();
      return completeIdempotentMutation(context, claim, 201, { challengeId, options });
    },
  );

  routes.post(
    "/:mandateId/activate",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const body = await readJsonBody(context.req.raw);
      const request = mandateActivationRequestSchema.safeParse(body);
      const verifiedAt = now();
      if (!request.success) {
        return apiError(context, 400, "INVALID_REQUEST", "The activation proof is invalid.");
      }
      const mandateId = context.req.param("mandateId");
      const claim = await beginIdempotentMutation(
        context,
        "mandate-activate",
        mandateId,
        request.data,
        verifiedAt.getTime(),
      );
      if (claim instanceof Response) return claim;
      const environment = passkeyEnvironment(context.env);
      const origin = trustedRequestOrigin(context.req.raw, environment.TRUSTED_ORIGINS);
      if (origin === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "MANDATE_PROOF_INVALID",
          "The activation proof is invalid.",
        );
      }
      const organizationId = context.get("organizationAuthorization").organization.id;
      const principal = context.get("principal");
      const challenge = await context.env.DB.prepare(
        `UPDATE approval_challenges SET state = 'CONSUMED', consumed_at = ?
         WHERE id = ? AND organization_id = ? AND user_id = ? AND session_id = ? AND mandate_id = ?
           AND rp_id = ? AND origin = ? AND purpose = 'MANDATE_ACTIVATION'
           AND state = 'PENDING' AND expires_at > ?
         RETURNING challenge_hash, credential_id, payload_hash`,
      )
        .bind(
          verifiedAt.getTime(),
          request.data.challengeId,
          organizationId,
          principal.id,
          principal.sessionId,
          mandateId,
          environment.PASSKEY_RP_ID,
          origin,
          verifiedAt.getTime(),
        )
        .first<{ challenge_hash: string; credential_id: string; payload_hash: string }>();
      if (challenge === null) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "MANDATE_PROOF_INVALID",
          "The activation proof is invalid or expired.",
        );
      }
      const [mandate, passkey] = await Promise.all([
        ownedMandate(context, mandateId),
        ownedPasskey(context, challenge.credential_id),
      ]);
      if (
        mandate === undefined ||
        passkey === undefined ||
        mandate.status !== "DRAFT" ||
        mandate.expires_at <= verifiedAt.getTime() ||
        mandate.payload_hash !== challenge.payload_hash
      ) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "MANDATE_PROOF_INVALID",
          "The activation proof is invalid.",
        );
      }

      let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
      try {
        verification = await verifyResponse({
          credential: {
            counter: passkey.counter,
            id: passkey.credential_id,
            publicKey: base64UrlToBytes(passkey.public_key),
            transports: parseTransports(parseJsonArray(passkey.transports)),
          },
          expectedChallenge: async (receivedChallenge) =>
            timingSafeEqual(
              hexToBytes(await sha256Hex(receivedChallenge)),
              hexToBytes(challenge.challenge_hash),
            ),
          expectedOrigin: origin,
          expectedRPID: environment.PASSKEY_RP_ID,
          requireUserVerification: true,
          response: request.data.response as unknown as AuthenticationResponseJSON,
        });
      } catch {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "MANDATE_PROOF_INVALID",
          "The authenticator assertion failed verification.",
        );
      }
      if (
        !verification.verified ||
        !verification.authenticationInfo.userVerified ||
        verification.authenticationInfo.origin !== origin ||
        verification.authenticationInfo.rpID !== environment.PASSKEY_RP_ID
      ) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "MANDATE_PROOF_INVALID",
          "The authenticator assertion failed verification.",
        );
      }
      const proofHash = await sha256CanonicalJsonHex(request.data.response);
      const proofId = `mpr_${createUlid(verifiedAt.getTime())}`;
      try {
        const results = await context.env.DB.batch([
          context.env.DB.prepare(
            `UPDATE mandates SET status = 'ACTIVE', activated_at = ?, updated_at = ?
             WHERE id = ? AND organization_id = ? AND user_id = ? AND status = 'DRAFT'
               AND payload_hash = ? AND expires_at > ?`,
          ).bind(
            verifiedAt.getTime(),
            verifiedAt.getTime(),
            mandate.id,
            organizationId,
            principal.id,
            challenge.payload_hash,
            verifiedAt.getTime(),
          ),
          context.env.DB.prepare(
            "UPDATE passkey_credentials SET counter = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          ).bind(
            verification.authenticationInfo.newCounter,
            verifiedAt.getTime(),
            passkey.id,
            principal.id,
          ),
          context.env.DB.prepare(
            `INSERT INTO mandate_proofs
             (id, organization_id, mandate_id, proof_type, payload_hash, proof_hash, proof_json,
              key_id, verified_at, retention_expires_at, created_at)
             VALUES (?, ?, ?, 'WEBAUTHN_ASSERTION', ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            proofId,
            organizationId,
            mandate.id,
            challenge.payload_hash,
            proofHash,
            JSON.stringify(request.data.response),
            passkey.id,
            verifiedAt.getTime(),
            mandate.retention_expires_at,
            verifiedAt.getTime(),
          ),
        ]);
        if ((results[0]?.meta.changes ?? 0) !== 1) throw new Error("Mandate activation raced");
      } catch {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "MANDATE_STATE_CONFLICT",
          "The mandate is no longer activatable.",
        );
      }
      const updated = await ownedMandate(context, mandate.id);
      if (updated === undefined) throw new Error("Activated mandate disappeared");
      return completeIdempotentMutation(context, claim, 200, parseMandateResponse(updated));
    },
  );

  for (const [operation, targetStatus] of [
    ["suspend", "SUSPENDED"],
    ["revoke", "REVOKED"],
    ["expire", "EXPIRED"],
    ["exhaust", "EXHAUSTED"],
  ] as const) {
    routes.post(
      `/:mandateId/${operation}`,
      requireOrganizationCapability("agent:write"),
      async (context) => mutateMandateLifecycle(context, operation, targetStatus, now()),
    );
  }

  return routes;
}

async function mutateMandateLifecycle(
  context: Context<GatewayEnvironment>,
  operation: "exhaust" | "expire" | "revoke" | "suspend",
  targetStatus: "EXHAUSTED" | "EXPIRED" | "REVOKED" | "SUSPENDED",
  changedAt: Date,
): Promise<Response> {
  const mandateId = context.req.param("mandateId") ?? "";
  const body = (await readJsonBody(context.req.raw)) ?? {};
  if (!z.object({}).strict().safeParse(body).success) {
    return apiError(context, 400, "INVALID_REQUEST", "The lifecycle request is invalid.");
  }
  const claim = await beginIdempotentMutation(
    context,
    `mandate-${operation}`,
    mandateId,
    body,
    changedAt.getTime(),
  );
  if (claim instanceof Response) return claim;
  const mandate = await ownedMandate(context, mandateId);
  if (mandate === undefined) {
    return failIdempotentMutation(
      context,
      claim,
      404,
      "RESOURCE_NOT_FOUND",
      "The mandate was not found.",
    );
  }
  const legal =
    (operation === "suspend" && mandate.status === "ACTIVE") ||
    (operation === "revoke" && ["ACTIVE", "SUSPENDED"].includes(mandate.status)) ||
    (operation === "expire" &&
      ["ACTIVE", "SUSPENDED"].includes(mandate.status) &&
      mandate.expires_at <= changedAt.getTime()) ||
    (operation === "exhaust" &&
      mandate.kind === "PAYMENT" &&
      ["ACTIVE", "SUSPENDED"].includes(mandate.status) &&
      ((mandate.budget_subunits !== null && mandate.spent_subunits >= mandate.budget_subunits) ||
        (mandate.max_transactions !== null &&
          mandate.completed_transactions >= mandate.max_transactions)));
  if (!legal) {
    return failIdempotentMutation(
      context,
      claim,
      409,
      "MANDATE_STATE_CONFLICT",
      `The mandate cannot transition from ${mandate.status} to ${targetStatus}.`,
    );
  }
  const terminal = targetStatus === "SUSPENDED" ? null : changedAt.getTime();
  const result = await context.env.DB.prepare(
    `UPDATE mandates SET status = ?, terminal_at = ?, updated_at = ?
     WHERE id = ? AND organization_id = ? AND user_id = ? AND status = ?`,
  )
    .bind(
      targetStatus,
      terminal,
      changedAt.getTime(),
      mandate.id,
      mandate.organization_id,
      mandate.user_id,
      mandate.status,
    )
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    return failIdempotentMutation(
      context,
      claim,
      409,
      "MANDATE_STATE_CONFLICT",
      "The mandate lifecycle changed concurrently.",
    );
  }
  const updated = await ownedMandate(context, mandate.id);
  if (updated === undefined) throw new Error("Updated mandate disappeared");
  return completeIdempotentMutation(context, claim, 200, parseMandateResponse(updated));
}

function insertMandateStatement(
  context: Context<GatewayEnvironment>,
  input: {
    readonly agentVersionId: string;
    readonly expiresAt: number;
    readonly hash: string;
    readonly id: string;
    readonly kind: "CHECKOUT" | "PAYMENT";
    readonly mandate:
      | ReturnType<typeof openCheckoutMandateSchema.parse>
      | ReturnType<typeof openPaymentMandateSchema.parse>;
    readonly organizationId: string;
    readonly retentionExpiresAt: number;
    readonly userId: string;
  },
) {
  const payment =
    input.kind === "PAYMENT" ? openPaymentMandateSchema.parse(input.mandate) : undefined;
  const checkout =
    input.kind === "CHECKOUT" ? openCheckoutMandateSchema.parse(input.mandate) : undefined;
  const createdAt = Date.parse(input.mandate.issued_at);
  return context.env.DB.prepare(
    `INSERT INTO mandates
     (id, organization_id, user_id, agent_id, agent_version_id, kind, status, schema_version,
      payload_json, payload_hash, nonce, currency, max_transaction_subunits, budget_subunits,
      approval_threshold_subunits, spent_subunits, reserved_subunits, max_transactions,
      completed_transactions, max_attempts, allowed_rails_json, allowed_merchants_json,
      allowed_categories_json, allowed_services_json, line_item_constraints_json, starts_at,
      expires_at, activated_at, terminal_at, retention_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
  ).bind(
    input.id,
    input.organizationId,
    input.userId,
    input.mandate.agent.agent_id,
    input.agentVersionId,
    input.kind,
    input.mandate.schema_version,
    JSON.stringify(input.mandate),
    input.hash,
    input.mandate.nonce,
    payment?.currency ?? null,
    payment?.max_transaction_subunits ?? null,
    payment?.total_budget_subunits ?? null,
    payment?.approval_threshold_subunits ?? null,
    payment?.max_transactions ?? null,
    payment?.max_attempts_per_transaction ?? null,
    JSON.stringify(payment?.allowed_rails ?? []),
    JSON.stringify(payment?.allowed_payees ?? checkout?.allowed_merchants ?? []),
    JSON.stringify(checkout?.allowed_categories ?? []),
    JSON.stringify(checkout?.allowed_services ?? []),
    checkout === undefined ? null : JSON.stringify(checkout.line_item_constraints),
    createdAt,
    input.expiresAt,
    input.retentionExpiresAt,
    createdAt,
    createdAt,
  );
}

async function ownedMandate(
  context: Context<GatewayEnvironment>,
  untrustedId: string,
): Promise<z.infer<typeof mandateRowSchema> | undefined> {
  const id = mandateIdSchema.safeParse(untrustedId);
  if (!id.success) return undefined;
  const row = await context.env.DB.prepare(
    "SELECT * FROM mandates WHERE id = ? AND organization_id = ? AND user_id = ?",
  )
    .bind(
      id.data,
      context.get("organizationAuthorization").organization.id,
      context.get("principal").id,
    )
    .first();
  return row === null ? undefined : mandateRowSchema.parse(row);
}

async function ownedPasskey(
  context: Context<GatewayEnvironment>,
  untrustedId: string,
): Promise<z.infer<typeof passkeyRowSchema> | undefined> {
  const id = passkeyCredentialIdSchema.safeParse(untrustedId);
  if (!id.success) return undefined;
  const row = await context.env.DB.prepare(
    "SELECT id, credential_id, public_key, counter, transports FROM passkey_credentials WHERE id = ? AND user_id = ?",
  )
    .bind(id.data, context.get("principal").id)
    .first();
  return row === null ? undefined : passkeyRowSchema.parse(row);
}

function mandateResponse(mandate: unknown, payloadHash: string, status: string) {
  return Object.freeze({ mandate, payloadHash, status });
}

function parseMandateResponse(untrusted: unknown) {
  const row = mandateRowSchema.parse(untrusted);
  return mandateResponse(JSON.parse(row.payload_json) as unknown, row.payload_hash, row.status);
}

function parseJsonArray(value: string): string[] {
  return z.array(authenticatorTransportSchema).parse(JSON.parse(value) as unknown);
}

function configuredApiAudience(context: Context<GatewayEnvironment>): string | undefined {
  const candidate = context.env.MINDPAY_API_AUDIENCE;
  if (candidate === undefined) return undefined;
  const parsed = merchantHttpsUrlSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export const mandateRoutes = createMandateRoutes();
