import {
  competitorDossierResultSchema,
  deliveryReceiptSchema,
  type EntitlementJwtClaims,
  fulfilmentStatusSchema,
  marketSnapshotResultSchema,
  type SignalWorksServiceResult,
  signedDeliveryPublicationSchema,
} from "@mindpay/contracts";
import { importEs256PublicJwk, sha256CanonicalJsonHex, sha256Hex } from "@mindpay/crypto";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";
import { type EntitlementJwtVerificationKey, verifyEntitlementJwt } from "@mindpay/mcp-tools";
import { z } from "zod";
import type { MerchantBindings } from "./index";
import {
  importSignalWorksKeyEncryptionKey,
  SIGNALWORKS_MERCHANT,
  signSignalWorksPayload,
} from "./identity";

const MINDPAY_ISSUER = "https://api.mindpay.example/";
const SIGNALWORKS_AUDIENCE = "https://merchant-demo.example.com/";
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;

type SupportedServiceId = "detailed_competitor_dossier" | "market_snapshot";
type RedemptionInput =
  | Readonly<{ company: string; entitlementJwt: string; market: string }>
  | Readonly<{
      company: string;
      competitors: readonly string[];
      entitlementJwt: string;
      market: string;
    }>;

const paymentOrderRowSchema = z
  .object({
    agent_id: z.string(),
    id: z.string(),
    service_id: z.string(),
    transaction_id: z.string(),
  })
  .strict();

const fulfilmentRowSchema = z
  .object({
    completed_at: z.number().int().nonnegative().nullable(),
    delivery_receipt_id: z.string().nullable(),
    entitlement_id: z.string(),
    failure_code: z.string().nullable(),
    id: z.string(),
    receipt_json: z.string().nullable(),
    receipt_signature_json: z.string().nullable(),
    result_json: z.string().nullable(),
    service_id: z.enum(["market_snapshot", "detailed_competitor_dossier"]),
    state: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
    transaction_id: z.string(),
  })
  .strict();

export interface SignalWorksFulfilmentDependencies {
  readonly deliverPublication?: (
    bindings: MerchantBindings,
    publication: ReturnType<typeof signedDeliveryPublicationSchema.parse>,
  ) => Promise<void>;
  readonly generateResult?: (
    serviceId: SupportedServiceId,
    input: RedemptionInput,
    attempt: 1 | 2,
  ) => Promise<unknown>;
  readonly now?: () => Date;
  readonly readVerificationKeys?: (
    bindings: MerchantBindings,
  ) => Promise<readonly EntitlementJwtVerificationKey[]>;
}

export class SignalWorksFulfilmentError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "SignalWorksFulfilmentError";
  }
}

export async function redeemSignalWorksService(
  bindings: MerchantBindings,
  serviceId: SupportedServiceId,
  input: RedemptionInput,
  dependencies: SignalWorksFulfilmentDependencies = {},
) {
  const now = dependencies.now?.() ?? new Date();
  const verification = await verifyForService(
    bindings,
    serviceId,
    input.entitlementJwt,
    now,
    dependencies,
  );
  if (!verification.valid) throw new SignalWorksFulfilmentError("ENTITLEMENT_INVALID");
  const claims = verification.claims;
  const payment = await readPaidOrder(bindings.DB, claims);
  if (payment === null) throw new SignalWorksFulfilmentError("ENTITLEMENT_UNAVAILABLE");

  const inputHash = await sha256CanonicalJsonHex(input);
  const tokenHash = await sha256Hex(input.entitlementJwt);
  const fulfilmentId = `ful_${createUlid(now.getTime())}`;
  try {
    await bindings.DB.batch([
      bindings.DB.prepare(
        `INSERT INTO merchant_entitlement_redemptions
         (entitlement_id, payment_order_id, transaction_id, agent_id, service_id, issuer,
          audience, token_hash, issued_at, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        claims.jti,
        payment.id,
        claims.transaction_id,
        claims.agent_id,
        claims.service_id,
        claims.iss,
        claims.aud,
        tokenHash,
        claims.iat * 1_000,
        claims.exp * 1_000,
        now.getTime(),
        now.getTime(),
      ),
      bindings.DB.prepare(
        `INSERT INTO merchant_fulfilments
         (id, entitlement_id, transaction_id, service_id, state, generation_attempts, input_hash,
          result_json, output_hash, delivery_receipt_id, receipt_json, receipt_signature_json,
          failure_code, started_at, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'RUNNING', 0, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      ).bind(
        fulfilmentId,
        claims.jti,
        claims.transaction_id,
        claims.service_id,
        inputHash,
        now.getTime(),
        now.getTime(),
        now.getTime(),
      ),
    ]);
  } catch {
    throw new SignalWorksFulfilmentError("ENTITLEMENT_ALREADY_CONSUMED");
  }

  const generated = await generateValidResult(serviceId, input, now, dependencies.generateResult);
  if (generated === null) {
    const failedAt = dependencies.now?.() ?? new Date();
    await bindings.DB.prepare(
      `UPDATE merchant_fulfilments SET state = 'FAILED', generation_attempts = 2,
       failure_code = 'INVALID_SERVICE_OUTPUT', completed_at = ?, updated_at = ?
       WHERE id = ? AND state = 'RUNNING'`,
    )
      .bind(failedAt.getTime(), failedAt.getTime(), fulfilmentId)
      .run();
    throw new SignalWorksFulfilmentError("INVALID_SERVICE_OUTPUT");
  }

  const completedAt = dependencies.now?.() ?? now;
  const outputHash = await sha256CanonicalJsonHex(generated.result);
  const deliveryReceiptId = `dlr_${createUlid(completedAt.getTime())}`;
  const receipt = deliveryReceiptSchema.parse({
    agent_id: claims.agent_id,
    audience: claims.iss,
    completed_at: utcTimestampFromDate(completedAt),
    delivery_receipt_id: deliveryReceiptId,
    entitlement_id: claims.jti,
    expires_at: utcTimestampFromDate(new Date(completedAt.getTime() + RECEIPT_TTL_MS)),
    fulfilment_id: fulfilmentId,
    issued_at: utcTimestampFromDate(completedAt),
    issuer: SIGNALWORKS_AUDIENCE,
    jti: deliveryReceiptId,
    merchant_id: SIGNALWORKS_MERCHANT.merchantId,
    output_hash: outputHash,
    schema_version: "mindpay.delivery_receipt.1",
    service_id: claims.service_id,
    status: "COMPLETED",
    transaction_id: claims.transaction_id,
  });
  const encryptionKey = await importSignalWorksKeyEncryptionKey(
    bindings.SIGNALWORKS_KEY_ENCRYPTION_KEY,
  );
  const signature = await signSignalWorksPayload(
    bindings.DB,
    encryptionKey,
    "event",
    receipt,
    completedAt.getTime(),
  );
  const publication = signedDeliveryPublicationSchema.parse({
    receipt,
    result: generated.result,
    signature,
  });
  const updated = await bindings.DB.prepare(
    `UPDATE merchant_fulfilments SET state = 'COMPLETED', generation_attempts = ?, result_json = ?,
     output_hash = ?, delivery_receipt_id = ?, receipt_json = ?, receipt_signature_json = ?,
     completed_at = ?, updated_at = ? WHERE id = ? AND state = 'RUNNING'`,
  )
    .bind(
      generated.attempts,
      JSON.stringify(generated.result),
      outputHash,
      deliveryReceiptId,
      JSON.stringify(receipt),
      JSON.stringify(signature),
      completedAt.getTime(),
      completedAt.getTime(),
      fulfilmentId,
    )
    .run();
  if ((updated.meta.changes ?? 0) !== 1)
    throw new SignalWorksFulfilmentError("FULFILMENT_STATE_CONFLICT");

  try {
    await (dependencies.deliverPublication ?? deliverPublication)(bindings, publication);
  } catch {
    throw new SignalWorksFulfilmentError("DELIVERY_CONFIRMATION_FAILED");
  }
  return fulfilmentStatusSchema.parse({
    completedAt: receipt.completed_at,
    entitlementId: claims.jti,
    failureCode: null,
    fulfilmentId,
    result: generated.result,
    state: "COMPLETED",
    transactionId: claims.transaction_id,
  });
}

export async function getSignalWorksFulfilmentStatus(
  bindings: MerchantBindings,
  entitlementJwt: string,
  dependencies: SignalWorksFulfilmentDependencies = {},
) {
  const now = dependencies.now?.() ?? new Date();
  const verification = await verifyForAnyService(bindings, entitlementJwt, now, dependencies);
  if (!verification.valid) throw new SignalWorksFulfilmentError("ENTITLEMENT_INVALID");
  const row = await bindings.DB.prepare(
    `SELECT id, entitlement_id, transaction_id, service_id, state, result_json, delivery_receipt_id,
      receipt_json, receipt_signature_json, failure_code, completed_at
     FROM merchant_fulfilments WHERE entitlement_id = ? AND transaction_id = ? LIMIT 1`,
  )
    .bind(verification.claims.jti, verification.claims.transaction_id)
    .first();
  if (row === null) throw new SignalWorksFulfilmentError("FULFILMENT_NOT_FOUND");
  const fulfilment = fulfilmentRowSchema.parse(row);
  const result =
    fulfilment.result_json === null
      ? null
      : parseServiceResult(JSON.parse(fulfilment.result_json) as unknown, fulfilment.service_id);
  if (
    fulfilment.state === "COMPLETED" &&
    result !== null &&
    fulfilment.receipt_json !== null &&
    fulfilment.receipt_signature_json !== null
  ) {
    const publication = signedDeliveryPublicationSchema.parse({
      receipt: JSON.parse(fulfilment.receipt_json) as unknown,
      result,
      signature: JSON.parse(fulfilment.receipt_signature_json) as unknown,
    });
    await (dependencies.deliverPublication ?? deliverPublication)(bindings, publication).catch(
      () => undefined,
    );
  }
  return fulfilmentStatusSchema.parse({
    completedAt:
      fulfilment.completed_at === null
        ? null
        : utcTimestampFromDate(new Date(fulfilment.completed_at)),
    entitlementId: fulfilment.entitlement_id,
    failureCode: fulfilment.failure_code,
    fulfilmentId: fulfilment.id,
    result,
    state: fulfilment.state,
    transactionId: fulfilment.transaction_id,
  });
}

async function verifyForAnyService(
  bindings: MerchantBindings,
  token: string,
  now: Date,
  dependencies: SignalWorksFulfilmentDependencies,
) {
  for (const serviceId of ["market_snapshot", "detailed_competitor_dossier"] as const) {
    const verification = await verifyForService(bindings, serviceId, token, now, dependencies);
    if (verification.valid) return verification;
  }
  return Object.freeze({ reason: "INVALID_BINDING" as const, valid: false as const });
}

async function verifyForService(
  bindings: MerchantBindings,
  serviceId: SupportedServiceId,
  token: string,
  now: Date,
  dependencies: SignalWorksFulfilmentDependencies,
) {
  const keys = await (dependencies.readVerificationKeys ?? readVerificationKeys)(bindings);
  return verifyEntitlementJwt(token, keys, {
    audience: SIGNALWORKS_AUDIENCE,
    issuer: new URL(bindings.MINDPAY_API_AUDIENCE ?? MINDPAY_ISSUER).href,
    merchantId: SIGNALWORKS_MERCHANT.merchantId,
    nowEpochMs: now.getTime(),
    serviceId,
  });
}

async function readPaidOrder(database: D1Database, claims: EntitlementJwtClaims) {
  const row = await database
    .prepare(
      `SELECT id, transaction_id, agent_id, service_id FROM merchant_payment_orders
       WHERE transaction_id = ? AND agent_id = ? AND service_id = ? AND amount_subunits = ?
         AND currency = ? AND checkout_hash = ? AND status = 'CAPTURED' AND order_status = 'paid'
         AND payment_status = 'captured' AND fulfilment_eligible = 1 LIMIT 1`,
    )
    .bind(
      claims.transaction_id,
      claims.agent_id,
      claims.service_id,
      claims.amount_subunits,
      claims.currency,
      claims.checkout_hash,
    )
    .first();
  return row === null ? null : paymentOrderRowSchema.parse(row);
}

async function readVerificationKeys(bindings: MerchantBindings) {
  if (bindings.MINDPAY_GATEWAY === undefined) throw new Error("MindPay key service is unavailable");
  const response = await bindings.MINDPAY_GATEWAY.fetch(
    new Request(
      `${new URL(bindings.MINDPAY_API_AUDIENCE ?? MINDPAY_ISSUER).href}.well-known/jwks.json`,
    ),
  );
  if (!response.ok) throw new Error("MindPay key service is unavailable");
  const jwks = z
    .object({
      keys: z.array(
        z.object({ kid: z.string(), kty: z.literal("EC"), crv: z.literal("P-256") }).passthrough(),
      ),
    })
    .strict()
    .parse(await response.json());
  return Promise.all(
    jwks.keys.map(async (jwk) => ({
      kid: jwk.kid,
      publicKey: await importEs256PublicJwk(jwk),
      validFromEpochMs: 0,
    })),
  );
}

async function generateValidResult(
  serviceId: SupportedServiceId,
  input: RedemptionInput,
  generatedAt: Date,
  generatorOverride?: SignalWorksFulfilmentDependencies["generateResult"],
): Promise<Readonly<{ attempts: 1 | 2; result: SignalWorksServiceResult }> | null> {
  const generator: NonNullable<SignalWorksFulfilmentDependencies["generateResult"]> =
    generatorOverride ??
    (async (requestedServiceId, requestedInput) =>
      deterministicResult(requestedServiceId, requestedInput, generatedAt));
  for (const attempt of [1, 2] as const) {
    try {
      const parsed = parseServiceResult(await generator(serviceId, input, attempt), serviceId);
      return Object.freeze({ attempts: attempt, result: parsed });
    } catch {
      // One bounded retry is part of the fulfilment contract.
    }
  }
  return null;
}

function parseServiceResult(value: unknown, serviceId: SupportedServiceId) {
  return serviceId === "market_snapshot"
    ? marketSnapshotResultSchema.parse(value)
    : competitorDossierResultSchema.parse(value);
}

async function deterministicResult(
  serviceId: SupportedServiceId,
  input: RedemptionInput,
  generatedAtValue: Date,
): Promise<SignalWorksServiceResult> {
  const generatedAt = utcTimestampFromDate(generatedAtValue);
  if (serviceId === "market_snapshot") {
    return marketSnapshotResultSchema.parse({
      data_source: "DETERMINISTIC_DEMO_FIXTURE",
      executive_summary: `${input.company} is represented by a deterministic demonstration snapshot for the ${input.market} market. It is suitable for testing delivery, not for real investment or purchasing decisions.`,
      findings: [
        {
          confidence: "HIGH",
          evidence:
            "The requested company and market were preserved exactly through the typed fulfilment boundary.",
          finding: "Request binding verified",
        },
        {
          confidence: "MEDIUM",
          evidence:
            "This fixture intentionally makes no live-market claims and requires a production data source before launch.",
          finding: "Live research source required for production",
        },
      ],
      generated_at: generatedAt,
      market: input.market,
      schema_version: "signalworks.market_snapshot.1",
      service_id: "market_snapshot",
      subject_company: input.company,
    });
  }
  if (!("competitors" in input)) throw new Error("Competitors are required");
  return competitorDossierResultSchema.parse({
    competitors: input.competitors.map((competitor) => ({
      competitor,
      positioning: `${competitor} is included as a user-supplied comparison target in this deterministic demonstration.`,
      strengths: ["Typed comparison target retained without external enrichment"],
      weaknesses: ["No live research source is connected in deterministic demonstration mode"],
    })),
    data_source: "DETERMINISTIC_DEMO_FIXTURE",
    executive_summary: `${input.company} is compared with the supplied competitors for the ${input.market} market using a deterministic demonstration fixture. No live-market claims are made.`,
    generated_at: generatedAt,
    market: input.market,
    recommendations: [
      "Connect an approved research source before using this report for production decisions.",
      "Review every live-source citation and freshness timestamp before acting on a dossier.",
    ],
    schema_version: "signalworks.competitor_dossier.1",
    service_id: "detailed_competitor_dossier",
    subject_company: input.company,
  });
}

async function deliverPublication(
  bindings: MerchantBindings,
  publication: ReturnType<typeof signedDeliveryPublicationSchema.parse>,
): Promise<void> {
  if (
    bindings.MINDPAY_GATEWAY === undefined ||
    bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN === undefined
  ) {
    throw new Error("MindPay delivery receiver is unavailable");
  }
  const response = await bindings.MINDPAY_GATEWAY.fetch(
    new Request(
      `${new URL(bindings.MINDPAY_API_AUDIENCE ?? MINDPAY_ISSUER).href}api/internal/v1/merchant-delivery-receipts`,
      {
        body: JSON.stringify(publication),
        headers: {
          Authorization: `Bearer ${bindings.SIGNALWORKS_MACHINE_AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ),
  );
  if (!response.ok) throw new Error(`MindPay delivery receiver failed with ${response.status}`);
}
