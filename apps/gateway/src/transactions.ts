import { importAgentKeyEncryptionKey, loadAgentPrivateSigningKey } from "@mindpay/agent-runtime";
import {
  authenticatorTransportSchema,
  type MerchantPaymentAuthorization,
  type MerchantPaymentOrderResponse,
  mandateIdSchema,
  merchantCheckoutSchema,
  merchantPaymentOrderResponseSchema,
  offerIdSchema,
  paymentRailSchema,
  sha256HexSchema,
  transactionIdSchema,
} from "@mindpay/contracts";
import {
  base64UrlToBytes,
  hexToBytes,
  importEs256PublicJwk,
  sha256CanonicalJsonHex,
  sha256Hex,
  timingSafeEqual,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";
import { evaluatePolicy, type PolicyEvaluationInput } from "@mindpay/policy-engine";
import {
  closeCheckoutMandate,
  closePaymentMandate,
  verifyClosedMandateConstraints,
} from "@mindpay/protocol-mandates";
import { evaluateRisk, type RiskEvaluationInput } from "@mindpay/risk-engine";
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

export const TRANSACTION_APPROVAL_TTL_MS = 5 * 60 * 1_000;
export const SPEND_RESERVATION_TTL_MS = 15 * 60 * 1_000;
const TRANSACTION_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1_000;

export interface TransactionRouteDependencies {
  readonly createMerchantPaymentOrder?: (
    bindings: GatewayEnvironment["Bindings"],
    authorization: MerchantPaymentAuthorization,
    idempotencyKey: string,
  ) => Promise<MerchantPaymentOrderResponse>;
  readonly generateAuthenticationOptions?: typeof generateAuthenticationOptions;
  readonly now?: () => Date;
  readonly onOrderCreation?: (transactionId: string) => void | Promise<void>;
  readonly verifyAuthenticationResponse?: typeof verifyAuthenticationResponse;
}

const signatureSchema = z
  .object({ alg: z.literal("ES256"), kid: z.string(), signature: z.string() })
  .strict();
const createTransactionRequestSchema = z
  .object({
    checkout: merchantCheckoutSchema,
    checkoutMandateId: mandateIdSchema,
    checkoutSignature: signatureSchema,
    offerHash: sha256HexSchema,
    offerId: offerIdSchema,
    paymentMandateId: mandateIdSchema,
    paymentRail: paymentRailSchema,
  })
  .strict();
const transactionChallengeRequestSchema = z
  .object({ credentialId: z.string().regex(/^pkc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u) })
  .strict();
const transactionApprovalRequestSchema = z
  .object({
    challengeId: z.string().regex(/^apc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u),
    response: z.record(z.string(), z.unknown()),
  })
  .strict();
const transactionDecisionEvidenceSchema = z
  .object({
    checkoutHash: sha256HexSchema,
    closedPayment: z
      .object({
        mandate: z.object({ checkout_session_id: z.string() }).passthrough(),
        payloadHash: sha256HexSchema,
      })
      .passthrough()
      .nullable(),
    closedPaymentMandateHash: sha256HexSchema.nullable(),
  })
  .passthrough();

const openMandateRowSchema = z
  .object({
    agent_id: z.string(),
    agent_version_id: z.string(),
    approval_threshold_subunits: z.number().int().nonnegative().nullable(),
    budget_subunits: z.number().int().nonnegative().nullable(),
    completed_transactions: z.number().int().nonnegative(),
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
    status: z.enum(["ACTIVE", "DRAFT", "EXHAUSTED", "EXPIRED", "REVOKED", "SUSPENDED"]),
    user_id: z.string(),
  })
  .passthrough();
const commerceRowSchema = z
  .object({
    availability: z.enum(["available", "paused", "unavailable"]),
    category: z.string(),
    currency: z.string(),
    external_id: z.string(),
    merchant_domain: z.string(),
    merchant_id: z.string(),
    merchant_risk_tier: z.enum(["HIGH", "LOW", "MEDIUM"]),
    merchant_status: z.enum(["ACTIVE", "REVOKED", "SUSPENDED"]),
    merchant_verification_expires_at: z.number().int().nonnegative().nullable(),
    merchant_verification_status: z.string(),
    price_subunits: z.number().int().nonnegative(),
    service_version_id: z.string(),
    version: z.string(),
  })
  .strict();
const transactionRowSchema = z
  .object({
    agent_id: z.string(),
    agent_version_id: z.string(),
    amount_subunits: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
    currency: z.literal("INR"),
    id: z.string(),
    mandate_id: z.string(),
    organization_id: z.string(),
    policy_decision_json: z.string(),
    retention_expires_at: z.number().int().nonnegative(),
    service_version_id: z.string(),
    state: z.string(),
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

export function createTransactionRoutes(dependencies: TransactionRouteDependencies = {}) {
  const generateOptions =
    dependencies.generateAuthenticationOptions ?? generateAuthenticationOptions;
  const now = dependencies.now ?? (() => new Date());
  const createMerchantPaymentOrder =
    dependencies.createMerchantPaymentOrder ?? requestSignalWorksPaymentOrder;
  const verifyResponse = dependencies.verifyAuthenticationResponse ?? verifyAuthenticationResponse;
  const routes = new Hono<GatewayEnvironment>();

  routes.use("*", requireAuthentication);
  routes.use("*", requireOrganizationCapability("agent:read"));

  routes.post("/", requireOrganizationCapability("agent:write"), async (context) => {
    const body = await readJsonBody(context.req.raw);
    const request = createTransactionRequestSchema.safeParse(body);
    const evaluatedAt = now();
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The transaction proposal is invalid.");
    }
    const entityId = `${request.data.paymentMandateId}:${request.data.checkout.checkout_session_id}`;
    const claim = await beginIdempotentMutation(
      context,
      "transaction-evaluate",
      entityId,
      request.data,
      evaluatedAt.getTime(),
    );
    if (claim instanceof Response) return claim;
    const organizationId = context.get("organizationAuthorization").organization.id;
    const principal = context.get("principal");
    const [checkoutMandate, paymentMandate, commerce, consumedNonce] = await Promise.all([
      readMandate(context, request.data.checkoutMandateId),
      readMandate(context, request.data.paymentMandateId),
      readCommerce(context.env.DB, request.data.checkout),
      context.env.DB.prepare(
        "SELECT 1 AS found FROM consumed_nonces WHERE organization_id = ? AND scope = 'merchant-checkout' AND nonce = ?",
      )
        .bind(organizationId, request.data.checkout.nonce)
        .first<{ found: number }>(),
    ]);
    if (checkoutMandate === undefined || paymentMandate === undefined || commerce === undefined) {
      return failIdempotentMutation(
        context,
        claim,
        404,
        "RESOURCE_NOT_FOUND",
        "The mandate or service was not found.",
      );
    }
    const merchantSignatureValid = await verifyMerchantCheckoutSignature(
      context.env.DB,
      request.data.checkout,
      request.data.checkoutSignature,
      evaluatedAt.getTime(),
    );
    const openCheckout = openCheckoutFromRow(checkoutMandate);
    const openPayment = openPaymentFromRow(paymentMandate);
    const line = request.data.checkout.line_items[0];
    const exactService =
      request.data.checkout.line_items.length === 1 &&
      line !== undefined &&
      line.service_id === commerce.external_id &&
      line.service_version === commerce.version &&
      line.unit_price_subunits === commerce.price_subunits &&
      line.line_total_subunits === commerce.price_subunits &&
      line.quantity === 1;
    const mandatePairMatches =
      checkoutMandate.kind === "CHECKOUT" &&
      paymentMandate.kind === "PAYMENT" &&
      checkoutMandate.agent_id === paymentMandate.agent_id &&
      checkoutMandate.agent_version_id === paymentMandate.agent_version_id &&
      openCheckout.agent.agent_version === openPayment.agent.agent_version;
    const merchantApproved =
      commerce.merchant_status === "ACTIVE" &&
      commerce.merchant_verification_status === "APPROVED" &&
      (commerce.merchant_verification_expires_at ?? 0) > evaluatedAt.getTime();
    const amountMatches =
      exactService &&
      request.data.checkout.total_subunits === commerce.price_subunits &&
      request.data.checkout.currency === commerce.currency;
    const riskInput: RiskEvaluationInput = {
      amountAboveAutomaticThreshold:
        request.data.checkout.total_subunits > openPayment.approval_threshold_subunits,
      amountMatches,
      callbackWellFormed: true,
      catalogChangedRecently: false,
      checkoutHashMatches: true,
      currencyMatches: request.data.checkout.currency === openPayment.currency,
      duplicateLogicalTransaction: consumedNonce !== null,
      endpointUnchanged: request.data.checkout.merchant_domain === commerce.merchant_domain,
      entitlementUnused: true,
      firstPurchaseNewMerchant: false,
      fulfilmentDegraded: false,
      mandateWithinLimits:
        request.data.checkout.total_subunits <= openPayment.max_transaction_subunits,
      merchantApproved,
      merchantKeyKnown: merchantSignatureValid.keyKnown,
      merchantSignatureValid: merchantSignatureValid.valid,
      nonceUnused: consumedNonce === null,
      offerUnexpired: Date.parse(request.data.checkout.expires_at) > evaluatedAt.getTime(),
      payeeMatches: request.data.checkout.merchant_id === commerce.merchant_id,
      paymentFailures: 0,
      paymentRailAllowed: openPayment.allowed_rails.includes(request.data.paymentRail),
      serviceVersionUnchanged: exactService,
      toolApproved: true,
      unusualAmountIncrease: false,
      webhookSignatureValid: true,
    };
    const risk = evaluateRisk(riskInput);
    const policyInput: PolicyEvaluationInput = {
      agentMatches: mandatePairMatches,
      agentVersionMatches: mandatePairMatches,
      amountMatches,
      amountSubunits: request.data.checkout.total_subunits,
      approvalPresent: false,
      approvalThresholdSubunits: openPayment.approval_threshold_subunits,
      attemptCount: 0,
      categoryAllowed: openCheckout.allowed_categories.includes(commerce.category),
      currency: request.data.checkout.currency,
      expectedCurrency: openPayment.currency,
      idempotencyInputMatches: true,
      mandateExists: true,
      mandateExpiresAtEpochMs: paymentMandate.expires_at,
      mandateStatus: paymentMandate.status,
      maxAttempts: openPayment.max_attempts_per_transaction,
      maxTransactionSubunits: openPayment.max_transaction_subunits,
      merchantAllowed:
        openCheckout.allowed_merchants.includes(commerce.merchant_id) &&
        openPayment.allowed_payees.includes(commerce.merchant_id),
      merchantApproved,
      nonceUnused: consumedNonce === null,
      nowEpochMs: evaluatedAt.getTime(),
      offerExpiresAtEpochMs: Date.parse(request.data.checkout.expires_at),
      offerSignatureValid: merchantSignatureValid.valid,
      paymentRail: request.data.paymentRail,
      paymentRailAllowed: openPayment.allowed_rails.includes(request.data.paymentRail),
      reservedSubunits: paymentMandate.reserved_subunits,
      riskOutcome: risk.outcome,
      serviceAllowed: openCheckout.allowed_services.includes(commerce.external_id) && exactService,
      spentSubunits: paymentMandate.spent_subunits,
      totalBudgetSubunits: openPayment.total_budget_subunits,
    };
    const policy = evaluatePolicy(policyInput);
    const transactionId = `ctx_${createUlid(evaluatedAt.getTime())}`;
    const checkoutHash = await sha256CanonicalJsonHex(request.data.checkout);
    let closedMandates:
      | Readonly<{
          closedCheckout: Awaited<ReturnType<typeof closeCheckoutMandate>>;
          closedPayment: Awaited<ReturnType<typeof closePaymentMandate>>;
        }>
      | undefined;
    if (policy.decision !== "BLOCK") {
      try {
        const agentKey = await readAgentSigningKey(context, paymentMandate.agent_id);
        if (agentKey === undefined) throw new Error("No active agent signing key");
        const closedExpiry = new Date(
          Math.min(
            Date.parse(request.data.checkout.expires_at),
            checkoutMandate.expires_at,
            paymentMandate.expires_at,
          ),
        ).toISOString();
        const issuedAt = utcTimestampFromDate(evaluatedAt);
        const closedCheckout = await closeCheckoutMandate(
          {
            audience: openCheckout.audience,
            checkoutHash,
            checkoutSessionId: request.data.checkout.checkout_session_id,
            currency: request.data.checkout.currency,
            expiresAt: closedExpiry,
            issuedAt,
            issuer: openCheckout.audience,
            lineItems: request.data.checkout.line_items,
            mandateId: `mnd_${createUlid(evaluatedAt.getTime())}`,
            merchantId: request.data.checkout.merchant_id,
            nonce: `cmc_${createUlid(evaluatedAt.getTime())}`,
            offerHash: request.data.offerHash,
            offerId: request.data.offerId,
            openMandate: openCheckout,
            totalSubunits: request.data.checkout.total_subunits,
          },
          agentKey,
          evaluatedAt.getTime(),
        );
        const closedPayment = await closePaymentMandate(
          {
            amountSubunits: request.data.checkout.total_subunits,
            audience: openPayment.audience,
            checkoutHash,
            checkoutSessionId: request.data.checkout.checkout_session_id,
            closedCheckoutMandateHash: closedCheckout.payloadHash,
            expiresAt: closedExpiry,
            issuedAt,
            issuer: openPayment.audience,
            mandateId: `mnd_${createUlid(evaluatedAt.getTime())}`,
            nonce: `cmp_${createUlid(evaluatedAt.getTime())}`,
            openMandate: openPayment,
            payee: request.data.checkout.merchant_id,
            paymentAttempt: 1,
            paymentRail: request.data.paymentRail,
          },
          agentKey,
          evaluatedAt.getTime(),
        );
        const constraints = await verifyClosedMandateConstraints({
          closedCheckout: closedCheckout.mandate,
          closedPayment: closedPayment.mandate,
          expectedCheckoutHash: checkoutHash,
          openCheckout,
          openPayment,
        });
        if (!constraints.valid) throw new Error(constraints.reasons.join(","));
        closedMandates = Object.freeze({ closedCheckout, closedPayment });
      } catch {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "POLICY_BLOCKED",
          "The closed mandates could not be produced without expanding user constraints.",
        );
      }
    }

    const state =
      policy.decision === "BLOCK"
        ? "BLOCKED"
        : policy.decision === "APPROVAL_REQUIRED"
          ? "APPROVAL_REQUIRED"
          : "APPROVED";
    const decisionEvidence = {
      checkoutHash,
      closedCheckout: closedMandates?.closedCheckout ?? null,
      closedPayment: closedMandates?.closedPayment ?? null,
      closedPaymentMandateHash: closedMandates?.closedPayment.payloadHash ?? null,
      policy,
      risk,
    };
    const retentionExpiresAt = evaluatedAt.getTime() + TRANSACTION_RETENTION_MS;
    const statements = [
      context.env.DB.prepare(
        `INSERT INTO transactions
         (id, organization_id, user_id, agent_id, agent_version_id, merchant_id,
          service_version_id, mandate_id, state, risk_decision, risk_score, policy_decision_json,
          amount_subunits, currency, request_id, retention_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?)`,
      ).bind(
        transactionId,
        organizationId,
        principal.id,
        paymentMandate.agent_id,
        paymentMandate.agent_version_id,
        commerce.merchant_id,
        commerce.service_version_id,
        paymentMandate.id,
        state,
        risk.outcome,
        riskScore(commerce.merchant_risk_tier),
        JSON.stringify(decisionEvidence),
        request.data.checkout.total_subunits,
        claim.key,
        retentionExpiresAt,
        evaluatedAt.getTime(),
        evaluatedAt.getTime(),
      ),
      context.env.DB.prepare(
        `INSERT INTO consumed_nonces
         (id, organization_id, mandate_id, transaction_id, source, scope, nonce, payload_hash,
          consumed_at, retention_expires_at, created_at)
         VALUES (?, ?, ?, ?, 'CLOSED_MANDATE', 'merchant-checkout', ?, ?, ?, ?, ?)`,
      ).bind(
        `rpn_${createUlid(evaluatedAt.getTime())}`,
        organizationId,
        paymentMandate.id,
        transactionId,
        request.data.checkout.nonce,
        checkoutHash,
        evaluatedAt.getTime(),
        retentionExpiresAt,
        evaluatedAt.getTime(),
      ),
    ];
    let reservationId: string | null = null;
    if (policy.decision === "ALLOW") {
      reservationId = `rsv_${createUlid(evaluatedAt.getTime())}`;
      statements.push(
        reserveSpendStatement(context.env.DB, {
          amountSubunits: request.data.checkout.total_subunits,
          createdAtEpochMs: evaluatedAt.getTime(),
          expiresAtEpochMs: evaluatedAt.getTime() + SPEND_RESERVATION_TTL_MS,
          mandateId: paymentMandate.id,
          organizationId,
          reservationId,
          retentionExpiresAtEpochMs: retentionExpiresAt,
          transactionId,
        }),
        context.env.DB.prepare(
          "UPDATE transactions SET state = 'BUDGET_RESERVED', updated_at = ? WHERE id = ? AND state = 'APPROVED'",
        ).bind(evaluatedAt.getTime(), transactionId),
      );
    }
    try {
      await context.env.DB.batch(statements);
    } catch {
      return failIdempotentMutation(
        context,
        claim,
        409,
        "BUDGET_UNAVAILABLE",
        "The proposal raced with replay or budget enforcement and was not reserved.",
      );
    }
    const responseState = policy.decision === "ALLOW" ? "BUDGET_RESERVED" : state;
    return completeIdempotentMutation(context, claim, 201, {
      decision: policy,
      orderCreationInvoked: false,
      reservationId,
      risk,
      state: responseState,
      transactionId,
    });
  });

  routes.post(
    "/:transactionId/checkout",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const createdAt = now();
      const transactionId = context.req.param("transactionId") ?? "";
      const claim = await beginIdempotentMutation(
        context,
        "transaction-payment-order",
        transactionId,
        {},
        createdAt.getTime(),
      );
      if (claim instanceof Response) return claim;
      const transaction = await readTransaction(context, transactionId);
      if (transaction === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          404,
          "RESOURCE_NOT_FOUND",
          "The transaction was not found.",
        );
      }
      const [reservation, attemptCount, service] = await Promise.all([
        context.env.DB.prepare(
          "SELECT id FROM spend_reservations WHERE transaction_id = ? AND status = 'RESERVED' AND expires_at > ? LIMIT 1",
        )
          .bind(transaction.id, createdAt.getTime())
          .first<{ id: string }>(),
        context.env.DB.prepare(
          "SELECT count(*) AS count FROM payment_attempts WHERE transaction_id = ?",
        )
          .bind(transaction.id)
          .first<{ count: number }>(),
        context.env.DB.prepare(
          "SELECT s.external_id FROM service_versions sv JOIN services s ON s.id = sv.service_id WHERE sv.id = ? LIMIT 1",
        )
          .bind(transaction.service_version_id)
          .first<{ external_id: string }>(),
      ]);
      const evidence = parseDecisionEvidence(transaction.policy_decision_json);
      if (
        transaction.state !== "BUDGET_RESERVED" ||
        reservation === null ||
        service === null ||
        evidence === undefined ||
        evidence.closedPayment === null ||
        evidence.closedPaymentMandateHash === null
      ) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "TRANSACTION_STATE_CONFLICT",
          "A live budget reservation and closed payment authority are required.",
        );
      }
      const attemptNumber = (attemptCount?.count ?? 0) + 1;
      if (attemptNumber > 10) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "PAYMENT_ATTEMPTS_EXHAUSTED",
          "The transaction has no payment attempts remaining.",
        );
      }
      const authorization: MerchantPaymentAuthorization = {
        agent_id: transaction.agent_id,
        amount_subunits: transaction.amount_subunits,
        attempt_number: attemptNumber,
        checkout_hash: evidence.checkoutHash,
        checkout_session_id: evidence.closedPayment.mandate.checkout_session_id,
        closed_payment_mandate_hash: evidence.closedPaymentMandateHash,
        currency: "INR",
        mandate_id: transaction.mandate_id,
        payment_rail: "razorpay:test",
        service_id: service.external_id,
        transaction_id: transaction.id,
      };
      let providerResponse: MerchantPaymentOrderResponse;
      try {
        providerResponse = await createMerchantPaymentOrder(context.env, authorization, claim.key);
        await dependencies.onOrderCreation?.(transaction.id);
      } catch {
        return failIdempotentMutation(
          context,
          claim,
          502,
          "PAYMENT_PROVIDER_UNAVAILABLE",
          "The merchant payment order could not be created.",
        );
      }
      const results = await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT INTO payment_attempts
           (id, organization_id, transaction_id, mandate_id, attempt_number, amount_subunits,
            currency, status, checkout_hash, provider, provider_order_id, provider_payment_id,
            receipt, callback_verified_at, order_status, payment_status, fulfilment_eligible,
            provider_snapshot_json, failure_code, completed_at, retention_expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'INR', 'PENDING', ?, 'RAZORPAY', ?, NULL, ?, NULL,
             'created', NULL, 0, ?, NULL, NULL, ?, ?, ?)`,
        ).bind(
          `pat_${createUlid(createdAt.getTime())}`,
          transaction.organization_id,
          transaction.id,
          transaction.mandate_id,
          attemptNumber,
          transaction.amount_subunits,
          evidence.checkoutHash,
          providerResponse.provider_order_id,
          providerResponse.receipt,
          JSON.stringify(providerResponse),
          transaction.retention_expires_at,
          createdAt.getTime(),
          createdAt.getTime(),
        ),
        context.env.DB.prepare(
          "UPDATE transactions SET state = 'CHECKOUT_CREATED', updated_at = ? WHERE id = ? AND state = 'BUDGET_RESERVED'",
        ).bind(createdAt.getTime(), transaction.id),
        context.env.DB.prepare(
          "UPDATE transactions SET state = 'ORDER_CREATED', updated_at = ? WHERE id = ? AND state = 'CHECKOUT_CREATED'",
        ).bind(createdAt.getTime(), transaction.id),
        context.env.DB.prepare(
          "UPDATE transactions SET state = 'PAYMENT_PENDING', updated_at = ? WHERE id = ? AND state = 'ORDER_CREATED'",
        ).bind(createdAt.getTime(), transaction.id),
      ]);
      if ((results[3]?.meta.changes ?? 0) !== 1) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "TRANSACTION_STATE_CONFLICT",
          "The transaction changed while its payment order was being recorded.",
        );
      }
      return completeIdempotentMutation(context, claim, 201, providerResponse);
    },
  );

  routes.post(
    "/:transactionId/retry",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const retriedAt = now();
      const transactionId = context.req.param("transactionId") ?? "";
      const claim = await beginIdempotentMutation(
        context,
        "transaction-payment-retry",
        transactionId,
        {},
        retriedAt.getTime(),
      );
      if (claim instanceof Response) return claim;
      const transaction = await readTransaction(context, transactionId);
      if (transaction === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          404,
          "RESOURCE_NOT_FOUND",
          "The transaction was not found.",
        );
      }
      const [mandate, attempts] = await Promise.all([
        readMandate(context, transaction.mandate_id),
        context.env.DB.prepare(
          "SELECT count(*) AS count FROM payment_attempts WHERE transaction_id = ?",
        )
          .bind(transaction.id)
          .first<{ count: number }>(),
      ]);
      if (
        transaction.state !== "PAYMENT_FAILED" ||
        mandate === undefined ||
        mandate.status !== "ACTIVE" ||
        (attempts?.count ?? 0) >= (mandate.max_attempts ?? 1)
      ) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "PAYMENT_ATTEMPTS_EXHAUSTED",
          "The failed payment cannot be retried under the mandate.",
        );
      }
      const reservationId = `rsv_${createUlid(retriedAt.getTime())}`;
      try {
        const results = await context.env.DB.batch([
          reserveSpendStatement(context.env.DB, {
            amountSubunits: transaction.amount_subunits,
            createdAtEpochMs: retriedAt.getTime(),
            expiresAtEpochMs: retriedAt.getTime() + SPEND_RESERVATION_TTL_MS,
            mandateId: transaction.mandate_id,
            organizationId: transaction.organization_id,
            reservationId,
            retentionExpiresAtEpochMs: transaction.retention_expires_at,
            transactionId: transaction.id,
          }),
          context.env.DB.prepare(
            "UPDATE transactions SET state = 'BUDGET_RESERVED', updated_at = ? WHERE id = ? AND state = 'PAYMENT_FAILED'",
          ).bind(retriedAt.getTime(), transaction.id),
        ]);
        if ((results[1]?.meta.changes ?? 0) !== 1) throw new Error("retry raced");
      } catch {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "BUDGET_UNAVAILABLE",
          "Budget could not be reserved for another payment attempt.",
        );
      }
      return completeIdempotentMutation(context, claim, 200, {
        reservationId,
        state: "BUDGET_RESERVED",
        transactionId: transaction.id,
      });
    },
  );

  routes.get("/:transactionId", async (context) => {
    const transaction = await readTransaction(context, context.req.param("transactionId") ?? "");
    if (transaction === undefined) return resourceNotFound(context);
    return context.json(serializeTransaction(transaction));
  });

  routes.post(
    "/:transactionId/challenges",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const body = await readJsonBody(context.req.raw);
      const request = transactionChallengeRequestSchema.safeParse(body);
      const createdAt = now();
      if (!request.success) {
        return apiError(
          context,
          400,
          "INVALID_REQUEST",
          "The transaction approval request is invalid.",
        );
      }
      const transactionId = context.req.param("transactionId") ?? "";
      const claim = await beginIdempotentMutation(
        context,
        "transaction-challenge",
        transactionId,
        request.data,
        createdAt.getTime(),
      );
      if (claim instanceof Response) return claim;
      const [transaction, passkey] = await Promise.all([
        readTransaction(context, transactionId),
        readPasskey(context, request.data.credentialId),
      ]);
      if (transaction === undefined || passkey === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          404,
          "RESOURCE_NOT_FOUND",
          "The transaction or passkey was not found.",
        );
      }
      const payloadHash = closedPaymentHash(transaction);
      if (transaction.state !== "APPROVAL_REQUIRED" || payloadHash === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "TRANSACTION_STATE_CONFLICT",
          "The transaction does not require approval.",
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
            transports: parseTransports(parseTransportsJson(passkey.transports)),
          },
        ],
        challenge: hexToBytes(payloadHash),
        rpID: environment.PASSKEY_RP_ID,
        timeout: TRANSACTION_APPROVAL_TTL_MS,
        userVerification: "required",
      });
      const challengeId = `apc_${createUlid(createdAt.getTime())}`;
      await context.env.DB.prepare(
        `UPDATE approval_challenges SET state = 'EXPIRED'
         WHERE organization_id = ? AND user_id = ? AND transaction_id = ?
           AND purpose = 'TRANSACTION_STEP_UP' AND state = 'PENDING' AND expires_at <= ?`,
      )
        .bind(transaction.organization_id, transaction.user_id, transaction.id, createdAt.getTime())
        .run();
      await context.env.DB.prepare(
        `INSERT INTO approval_challenges
         (id, organization_id, user_id, session_id, mandate_id, credential_id, transaction_id,
          rp_id, origin, purpose, challenge_hash, payload_hash, state, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRANSACTION_STEP_UP', ?, ?, 'PENDING', ?, NULL, ?)`,
      )
        .bind(
          challengeId,
          transaction.organization_id,
          transaction.user_id,
          context.get("principal").sessionId,
          transaction.mandate_id,
          passkey.id,
          transaction.id,
          environment.PASSKEY_RP_ID,
          origin,
          await sha256Hex(options.challenge),
          payloadHash,
          createdAt.getTime() + TRANSACTION_APPROVAL_TTL_MS,
          createdAt.getTime(),
        )
        .run();
      return completeIdempotentMutation(context, claim, 201, { challengeId, options, payloadHash });
    },
  );

  routes.post(
    "/:transactionId/approve",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const body = await readJsonBody(context.req.raw);
      const request = transactionApprovalRequestSchema.safeParse(body);
      const approvedAt = now();
      if (!request.success) {
        return apiError(
          context,
          400,
          "INVALID_REQUEST",
          "The transaction approval proof is invalid.",
        );
      }
      const transactionId = context.req.param("transactionId") ?? "";
      const claim = await beginIdempotentMutation(
        context,
        "transaction-approve",
        transactionId,
        request.data,
        approvedAt.getTime(),
      );
      if (claim instanceof Response) return claim;
      const environment = passkeyEnvironment(context.env);
      const origin = trustedRequestOrigin(context.req.raw, environment.TRUSTED_ORIGINS);
      if (origin === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "APPROVAL_CHALLENGE_INVALID",
          "The approval proof is invalid.",
        );
      }
      const transaction = await readTransaction(context, transactionId);
      if (transaction === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          404,
          "RESOURCE_NOT_FOUND",
          "The transaction was not found.",
        );
      }
      const expectedPayloadHash = closedPaymentHash(transaction);
      if (transaction.state !== "APPROVAL_REQUIRED" || expectedPayloadHash === undefined) {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "TRANSACTION_STATE_CONFLICT",
          "The transaction no longer requires approval.",
        );
      }
      const challenge = await context.env.DB.prepare(
        `UPDATE approval_challenges SET state = 'CONSUMED', consumed_at = ?
         WHERE id = ? AND organization_id = ? AND user_id = ? AND session_id = ?
           AND mandate_id = ? AND transaction_id = ? AND rp_id = ? AND origin = ?
           AND purpose = 'TRANSACTION_STEP_UP' AND payload_hash = ?
           AND state = 'PENDING' AND expires_at > ?
         RETURNING challenge_hash, credential_id, payload_hash`,
      )
        .bind(
          approvedAt.getTime(),
          request.data.challengeId,
          transaction.organization_id,
          transaction.user_id,
          context.get("principal").sessionId,
          transaction.mandate_id,
          transaction.id,
          environment.PASSKEY_RP_ID,
          origin,
          expectedPayloadHash,
          approvedAt.getTime(),
        )
        .first<{ challenge_hash: string; credential_id: string; payload_hash: string }>();
      if (challenge === null) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "APPROVAL_CHALLENGE_INVALID",
          "The approval challenge is invalid, expired, or already used.",
        );
      }
      const [passkey, mandate] = await Promise.all([
        readPasskey(context, challenge.credential_id),
        readMandate(context, transaction.mandate_id),
      ]);
      if (
        passkey === undefined ||
        mandate === undefined ||
        mandate.status !== "ACTIVE" ||
        mandate.expires_at <= approvedAt.getTime() ||
        challenge.payload_hash !== expectedPayloadHash
      ) {
        return failIdempotentMutation(
          context,
          claim,
          400,
          "APPROVAL_CHALLENGE_INVALID",
          "The approval context changed.",
        );
      }
      let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
      try {
        verification = await verifyResponse({
          credential: {
            counter: passkey.counter,
            id: passkey.credential_id,
            publicKey: base64UrlToBytes(passkey.public_key),
            transports: parseTransports(parseTransportsJson(passkey.transports)),
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
          "APPROVAL_CHALLENGE_INVALID",
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
          "APPROVAL_CHALLENGE_INVALID",
          "The authenticator assertion failed verification.",
        );
      }
      const reservationId = `rsv_${createUlid(approvedAt.getTime())}`;
      const proofHash = await sha256CanonicalJsonHex(request.data.response);
      const retentionExpiresAt = approvedAt.getTime() + TRANSACTION_RETENTION_MS;
      try {
        const results = await context.env.DB.batch([
          context.env.DB.prepare(
            "UPDATE transactions SET state = 'APPROVED', updated_at = ? WHERE id = ? AND state = 'APPROVAL_REQUIRED'",
          ).bind(approvedAt.getTime(), transaction.id),
          context.env.DB.prepare(
            `INSERT INTO transaction_approvals
             (id, organization_id, transaction_id, mandate_id, user_id, challenge_id,
              credential_id, payload_hash, proof_hash, proof_json, status, approved_at, expires_at,
              consumed_at, retention_expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, NULL, ?, ?)`,
          ).bind(
            `tap_${createUlid(approvedAt.getTime())}`,
            transaction.organization_id,
            transaction.id,
            transaction.mandate_id,
            transaction.user_id,
            request.data.challengeId,
            passkey.id,
            expectedPayloadHash,
            proofHash,
            JSON.stringify(request.data.response),
            approvedAt.getTime(),
            approvedAt.getTime() + TRANSACTION_APPROVAL_TTL_MS,
            retentionExpiresAt,
            approvedAt.getTime(),
          ),
          context.env.DB.prepare(
            "UPDATE passkey_credentials SET counter = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          ).bind(
            verification.authenticationInfo.newCounter,
            approvedAt.getTime(),
            passkey.id,
            transaction.user_id,
          ),
          reserveSpendStatement(context.env.DB, {
            amountSubunits: transaction.amount_subunits,
            createdAtEpochMs: approvedAt.getTime(),
            expiresAtEpochMs: approvedAt.getTime() + SPEND_RESERVATION_TTL_MS,
            mandateId: transaction.mandate_id,
            organizationId: transaction.organization_id,
            reservationId,
            retentionExpiresAtEpochMs: retentionExpiresAt,
            transactionId: transaction.id,
          }),
          context.env.DB.prepare(
            "UPDATE transactions SET state = 'BUDGET_RESERVED', updated_at = ? WHERE id = ? AND state = 'APPROVED'",
          ).bind(approvedAt.getTime(), transaction.id),
        ]);
        if ((results[0]?.meta.changes ?? 0) !== 1 || (results[4]?.meta.changes ?? 0) !== 1) {
          throw new Error("Transaction state raced");
        }
      } catch {
        return failIdempotentMutation(
          context,
          claim,
          409,
          "BUDGET_UNAVAILABLE",
          "Approval succeeded but budget is no longer available; no reservation was created.",
        );
      }
      return completeIdempotentMutation(context, claim, 200, {
        orderCreationInvoked: false,
        reservationId,
        state: "BUDGET_RESERVED",
        transactionId: transaction.id,
      });
    },
  );

  return routes;
}

export interface ReserveSpendInput {
  readonly amountSubunits: number;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly reservationId: string;
  readonly retentionExpiresAtEpochMs: number;
  readonly transactionId: string;
}

export async function reserveSpend(database: D1Database, input: ReserveSpendInput): Promise<void> {
  await reserveSpendStatement(database, input).run();
}

export async function commitSpendReservation(
  database: D1Database,
  reservationId: string,
  closedAtEpochMs: number,
): Promise<boolean> {
  return closeReservation(database, reservationId, "COMMITTED", closedAtEpochMs);
}

export async function releaseSpendReservation(
  database: D1Database,
  reservationId: string,
  closedAtEpochMs: number,
): Promise<boolean> {
  return closeReservation(database, reservationId, "RELEASED", closedAtEpochMs);
}

export async function expireSpendReservations(
  database: D1Database,
  nowEpochMs: number,
): Promise<number> {
  const result = await database
    .prepare(
      `UPDATE spend_reservations SET status = 'EXPIRED', closed_at = ?, updated_at = ?
       WHERE status = 'RESERVED' AND expires_at <= ?`,
    )
    .bind(nowEpochMs, nowEpochMs, nowEpochMs)
    .run();
  return result.meta.changes ?? 0;
}

function reserveSpendStatement(database: D1Database, input: ReserveSpendInput) {
  return database
    .prepare(
      `INSERT INTO spend_reservations
       (id, organization_id, mandate_id, transaction_id, amount_subunits, status, expires_at,
        closed_at, retention_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'RESERVED', ?, NULL, ?, ?, ?)`,
    )
    .bind(
      input.reservationId,
      input.organizationId,
      input.mandateId,
      input.transactionId,
      input.amountSubunits,
      input.expiresAtEpochMs,
      input.retentionExpiresAtEpochMs,
      input.createdAtEpochMs,
      input.createdAtEpochMs,
    );
}

async function closeReservation(
  database: D1Database,
  reservationId: string,
  status: "COMMITTED" | "RELEASED",
  closedAtEpochMs: number,
): Promise<boolean> {
  const result = await database
    .prepare(
      `UPDATE spend_reservations SET status = ?, closed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'RESERVED'`,
    )
    .bind(status, closedAtEpochMs, closedAtEpochMs, reservationId)
    .run();
  return (result.meta.changes ?? 0) === 1;
}

async function readMandate(context: Context<GatewayEnvironment>, id: string) {
  const parsed = mandateIdSchema.safeParse(id);
  if (!parsed.success) return undefined;
  const row = await context.env.DB.prepare(
    "SELECT * FROM mandates WHERE id = ? AND organization_id = ? AND user_id = ?",
  )
    .bind(
      parsed.data,
      context.get("organizationAuthorization").organization.id,
      context.get("principal").id,
    )
    .first();
  return row === null ? undefined : openMandateRowSchema.parse(row);
}

async function readTransaction(context: Context<GatewayEnvironment>, id: string) {
  const parsed = transactionIdSchema.safeParse(id);
  if (!parsed.success) return undefined;
  const row = await context.env.DB.prepare(
    "SELECT * FROM transactions WHERE id = ? AND organization_id = ? AND user_id = ?",
  )
    .bind(
      parsed.data,
      context.get("organizationAuthorization").organization.id,
      context.get("principal").id,
    )
    .first();
  return row === null ? undefined : transactionRowSchema.parse(row);
}

async function readPasskey(context: Context<GatewayEnvironment>, id: string) {
  const row = await context.env.DB.prepare(
    "SELECT id, credential_id, public_key, counter, transports FROM passkey_credentials WHERE id = ? AND user_id = ?",
  )
    .bind(id, context.get("principal").id)
    .first();
  return row === null ? undefined : passkeyRowSchema.parse(row);
}

async function readCommerce(
  database: D1Database,
  checkout: z.infer<typeof merchantCheckoutSchema>,
) {
  const line = checkout.line_items[0];
  if (line === undefined) return undefined;
  const row = await database
    .prepare(
      `SELECT sv.id AS service_version_id, sv.version, sv.price_subunits, sv.currency, sv.availability,
       s.external_id, s.category, m.id AS merchant_id, m.domain AS merchant_domain,
       m.status AS merchant_status, m.verification_status AS merchant_verification_status,
       m.verification_expires_at AS merchant_verification_expires_at,
       m.risk_tier AS merchant_risk_tier
       FROM service_versions sv JOIN services s ON s.id = sv.service_id
       JOIN merchants m ON m.id = s.merchant_id
       WHERE m.id = ? AND s.external_id = ? AND sv.version = ? LIMIT 1`,
    )
    .bind(checkout.merchant_id, line.service_id, line.service_version)
    .first();
  return row === null ? undefined : commerceRowSchema.parse(row);
}

async function verifyMerchantCheckoutSignature(
  database: D1Database,
  checkout: z.infer<typeof merchantCheckoutSchema>,
  signature: z.infer<typeof signatureSchema>,
  nowEpochMs: number,
): Promise<Readonly<{ keyKnown: boolean; valid: boolean }>> {
  const row = await database
    .prepare(
      `SELECT public_jwk, valid_from, valid_until, revoked_at FROM merchant_keys
       WHERE merchant_id = ? AND kid = ? AND purpose = 'checkout' LIMIT 1`,
    )
    .bind(checkout.merchant_id, signature.kid)
    .first<{
      public_jwk: string;
      revoked_at: number | null;
      valid_from: number;
      valid_until: number | null;
    }>();
  if (row === null) return Object.freeze({ keyKnown: false, valid: false });
  try {
    const publicKey = await importEs256PublicJwk(JSON.parse(row.public_jwk) as unknown);
    const result = await verifyCanonicalJsonEs256(
      checkout,
      signature,
      [
        {
          kid: signature.kid,
          publicKey,
          validFromEpochMs: row.valid_from,
          ...(row.revoked_at === null ? {} : { revokedAtEpochMs: row.revoked_at }),
          ...(row.valid_until === null ? {} : { validUntilEpochMs: row.valid_until }),
        },
      ],
      nowEpochMs,
    );
    return Object.freeze({ keyKnown: true, valid: result.valid });
  } catch {
    return Object.freeze({ keyKnown: true, valid: false });
  }
}

async function readAgentSigningKey(context: Context<GatewayEnvironment>, agentId: string) {
  const row = await context.env.DB.prepare(
    `SELECT kid, encrypted_private_jwk, valid_from, revoked_at FROM agent_keys
     WHERE agent_id = ? AND revoked_at IS NULL ORDER BY valid_from DESC LIMIT 1`,
  )
    .bind(agentId)
    .first<{
      encrypted_private_jwk: string;
      kid: string;
      revoked_at: number | null;
      valid_from: number;
    }>();
  if (row === null) return undefined;
  const encryptionKey = await importAgentKeyEncryptionKey(context.env.AGENT_KEY_ENCRYPTION_KEY);
  const privateKey = await loadAgentPrivateSigningKey({
    agentId,
    encryptedPrivateJwk: JSON.parse(row.encrypted_private_jwk) as unknown,
    encryptionKey,
    kid: row.kid,
  });
  return Object.freeze({
    kid: row.kid,
    privateKey,
    validFromEpochMs: row.valid_from,
    ...(row.revoked_at === null ? {} : { revokedAtEpochMs: row.revoked_at }),
  });
}

function openCheckoutFromRow(row: z.infer<typeof openMandateRowSchema>) {
  return z
    .object({ schema_version: z.literal("mindpay.mandate.checkout.open.1") })
    .passthrough()
    .parse(JSON.parse(row.payload_json) as unknown) as unknown as Parameters<
    typeof closeCheckoutMandate
  >[0]["openMandate"];
}

function openPaymentFromRow(row: z.infer<typeof openMandateRowSchema>) {
  return z
    .object({ schema_version: z.literal("mindpay.mandate.payment.open.1") })
    .passthrough()
    .parse(JSON.parse(row.payload_json) as unknown) as unknown as Parameters<
    typeof closePaymentMandate
  >[0]["openMandate"];
}

function riskScore(tier: "HIGH" | "LOW" | "MEDIUM"): number {
  return tier === "LOW" ? 20 : tier === "MEDIUM" ? 50 : 80;
}

function serializeTransaction(transaction: z.infer<typeof transactionRowSchema>) {
  return Object.freeze({
    amountSubunits: transaction.amount_subunits,
    currency: transaction.currency,
    decisionEvidence: JSON.parse(transaction.policy_decision_json) as unknown,
    id: transaction.id,
    state: transaction.state,
  });
}

function closedPaymentHash(transaction: z.infer<typeof transactionRowSchema>): string | undefined {
  const evidence = z
    .object({ closedPaymentMandateHash: sha256HexSchema.nullable() })
    .passthrough()
    .safeParse(JSON.parse(transaction.policy_decision_json) as unknown);
  return evidence.success ? (evidence.data.closedPaymentMandateHash ?? undefined) : undefined;
}

function parseDecisionEvidence(serialized: string) {
  try {
    const parsed = transactionDecisionEvidenceSchema.safeParse(JSON.parse(serialized) as unknown);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function requestSignalWorksPaymentOrder(
  bindings: GatewayEnvironment["Bindings"],
  authorization: MerchantPaymentAuthorization,
  idempotencyKey: string,
): Promise<MerchantPaymentOrderResponse> {
  if (bindings.SIGNALWORKS === undefined || bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN === undefined) {
    throw new Error("SignalWorks payment service is not configured");
  }
  const response = await bindings.SIGNALWORKS.fetch(
    new Request("https://merchant-demo.example.com/payments/orders", {
      body: JSON.stringify(authorization),
      headers: {
        Authorization: `Bearer ${bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "Request-Id": idempotencyKey,
      },
      method: "POST",
    }),
  );
  if (!response.ok) throw new Error(`SignalWorks payment order failed with ${response.status}`);
  return merchantPaymentOrderResponseSchema.parse(await response.json());
}

function parseTransportsJson(value: string): string[] {
  return z.array(authenticatorTransportSchema).parse(JSON.parse(value) as unknown);
}

export const transactionRoutes = createTransactionRoutes();
