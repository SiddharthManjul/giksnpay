import {
  type EvidenceBundle,
  evidenceBundleSchema,
  type EvidenceProofResult,
  evidenceProofResultSchema,
  es256CanonicalSignatureSchema,
  type PublicEvidenceBundle,
  publicEvidenceBundleSchema,
  type SignedEvidenceBundle,
  signedAuditEventSchema,
  signedEvidenceBundleSchema,
} from "@mindpay/contracts";
import {
  type Es256VerificationKey,
  importEs256PublicJwk,
  sha256CanonicalJsonHex,
  sha256Hex,
  signCanonicalJsonEs256,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { verifySignedAuditChain } from "@mindpay/audit";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";
import { z } from "zod";
import {
  broadcastAuditEvents,
  prepareAuditStatements,
  readSignedAuditEvents,
  verifyStoredAuditEvents,
} from "./audit";
import type { GatewayAuthBindings } from "./auth";
import { loadOrCreatePlatformSigningKey } from "./platform-signing";

const evidenceRowSchema = z
  .object({
    bundle_hash: z.string(),
    bundle_json: z.string(),
    id: z.string(),
    signature_json: z.string(),
    signing_kid: z.string(),
    transaction_id: z.string(),
  })
  .strict();

const sourceRowSchema = z
  .object({
    agent_id: z.string(),
    agent_version: z.string(),
    amount_subunits: z.number().int().nonnegative(),
    catalog_hash: z.string(),
    created_at: z.number().int().nonnegative(),
    current_state: z.enum(["BLOCKED", "PAYMENT_FAILED", "FULFILLED"]),
    decision_json: z.string(),
    manifest_hash: z.string(),
    mandate_id: z.string(),
    mandate_payload_hash: z.string(),
    merchant_id: z.string(),
    organization_id: z.string(),
    retention_expires_at: z.number().int().nonnegative(),
    system_policy_hash: z.string(),
    transaction_id: z.string(),
    updated_at: z.number().int().nonnegative(),
  })
  .strict();

const decisionSchema = z
  .object({
    checkout: z
      .object({
        checkout_session_id: z.string(),
        currency: z.literal("INR"),
        total_subunits: z.number().int().nonnegative(),
      })
      .passthrough(),
    checkoutHash: z.string(),
    checkoutSignatureVerified: z.boolean(),
    offerSignatureVerified: z.boolean(),
    policy: z
      .object({
        decision: z.enum(["ALLOW", "APPROVAL_REQUIRED", "BLOCK"]),
        reasons: z.array(
          z.object({ code: z.string(), severity: z.enum(["HIGH", "MEDIUM"]) }).passthrough(),
        ),
        rulesetVersion: z.string(),
      })
      .passthrough(),
    risk: z
      .object({
        outcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
        reasons: z.array(
          z
            .object({ code: z.string(), severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "INFO"]) })
            .passthrough(),
        ),
        rulesetVersion: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const mandateProofRowSchema = z
  .object({
    challenge_hash: z.string(),
    credential_id: z.string(),
    payload_hash: z.string(),
    verified_at: z.number().int().nonnegative(),
  })
  .strict();

const paymentRowSchema = z
  .object({
    callback_verified_at: z.number().int().nonnegative().nullable(),
    order_status: z.string().nullable(),
    payload_hash: z.string().nullable(),
    payment_status: z.string().nullable(),
    provider_order_id: z.string(),
    provider_payment_id: z.string().nullable(),
    signature_verified: z.union([z.boolean(), z.number().int().min(0).max(1)]).nullable(),
  })
  .strict();

const fulfilmentRowSchema = z
  .object({
    entitlement_id: z.string(),
    output_hash: z.string(),
    receipt_json: z.string(),
    receipt_signature_json: z.string(),
  })
  .strict();

export interface PortableEvidenceVerification {
  readonly bundle: EvidenceBundle | null;
  readonly bundleHash: string;
  readonly proofResults: readonly EvidenceProofResult[];
  readonly verified: boolean;
}

export async function verifyPortableEvidenceEnvelope(
  untrustedEnvelope: unknown,
  verificationKeys: readonly Es256VerificationKey[],
  verifiedAt: Date,
): Promise<PortableEvidenceVerification> {
  const publicResult = publicEvidenceBundleSchema.safeParse(untrustedEnvelope);
  const envelopeInput =
    publicResult.success &&
    publicResult.data.bundle !== null &&
    publicResult.data.signature !== null
      ? {
          auditSignatures: publicResult.data.auditSignatures,
          bundle: publicResult.data.bundle,
          bundleHash: publicResult.data.bundleHash,
          signature: publicResult.data.signature,
        }
      : untrustedEnvelope;
  const envelope = signedEvidenceBundleSchema.safeParse(envelopeInput);
  const rawBundle = envelope.success
    ? envelope.data.bundle
    : rawBundleFromEnvelope(untrustedEnvelope);
  const bundle = evidenceBundleSchema.safeParse(rawBundle);
  const calculatedHash = await sha256CanonicalJsonHex(rawBundle).catch(() => "0".repeat(64));
  const expectedHash = envelope.success ? envelope.data.bundleHash : "0".repeat(64);
  const hashValid = envelope.success && calculatedHash === expectedHash;
  const signatureValid = envelope.success
    ? (
        await verifyCanonicalJsonEs256(
          envelope.data.bundle,
          envelope.data.signature,
          verificationKeys,
          verifiedAt.getTime(),
        ).catch(() => ({ valid: false as const }))
      ).valid
    : false;
  const auditValid = envelope.success
    ? await verifyEnvelopeAudit(envelope.data, verificationKeys, verifiedAt.getTime())
    : false;
  const redactionValid = !containsForbiddenPublicKey(rawBundle);
  const proofResults = proofResultSet(
    bundle.success ? bundle.data : null,
    bundle.success,
    hashValid,
    signatureValid,
    auditValid,
    redactionValid,
  );
  return Object.freeze({
    bundle: bundle.success ? bundle.data : null,
    bundleHash: expectedHash,
    proofResults,
    verified: proofResults.every((proof) => proof.status !== "FAIL"),
  });
}

async function verifyEnvelopeAudit(
  envelope: SignedEvidenceBundle,
  verificationKeys: readonly Es256VerificationKey[],
  verifiedAtEpochMs: number,
): Promise<boolean> {
  const signatures = new Map(
    envelope.auditSignatures.map((entry) => [entry.eventId, entry.signature] as const),
  );
  if (signatures.size !== envelope.bundle.audit.events.length) return false;
  const publications = envelope.bundle.audit.events.map((event) => {
    const signature = signatures.get(event.jti);
    return signature === undefined ? null : signedAuditEventSchema.safeParse({ event, signature });
  });
  if (publications.some((publication) => publication === null || !publication.success))
    return false;
  const signed = publications.flatMap((publication) =>
    publication?.success ? [publication.data] : [],
  );
  return (await verifySignedAuditChain(signed, verificationKeys, verifiedAtEpochMs)).valid;
}

function rawBundleFromEnvelope(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("bundle" in value)) return null;
  return value.bundle;
}

export async function ensureEvidenceBundle(
  bindings: GatewayAuthBindings,
  transactionId: string,
  createdAt = new Date(),
): Promise<PublicEvidenceBundle> {
  const existing = await readEvidenceRowByTransaction(bindings.DB, transactionId);
  if (existing !== null) return verifyEvidenceRow(bindings.DB, existing, createdAt);

  const source = await readEvidenceSource(bindings.DB, transactionId);
  if (source === null) throw new Error("Evidence source is unavailable or not terminal");
  const decision = decisionSchema.parse(JSON.parse(source.decision_json) as unknown);
  const [mandateProof, payment, fulfilment, tools, existingEvents] = await Promise.all([
    readMandateProof(bindings.DB, source.mandate_id, source.mandate_payload_hash),
    readPayment(bindings.DB, transactionId),
    readFulfilment(bindings.DB, transactionId),
    readToolVersions(bindings.DB, source.agent_id, source.agent_version),
    readSignedAuditEvents(bindings.DB, transactionId),
  ]);
  if (mandateProof === null || existingEvents.length === 0) {
    throw new Error("Evidence source proofs are incomplete");
  }

  const evidenceId = `evd_${createUlid(createdAt.getTime())}`;
  const terminalAudit = await prepareAuditStatements(
    bindings,
    transactionId,
    [
      ...(source.current_state === "FULFILLED"
        ? ([
            {
              actor: { id: "mindpay_gateway", type: "MINDPAY" as const },
              eventType: "TRANSACTION_COMPLETED" as const,
              payload: { amount_subunits: source.amount_subunits, currency: "INR" },
            },
          ] as const)
        : []),
      {
        actor: { id: "mindpay_gateway", type: "MINDPAY" },
        eventType: "EVIDENCE_BUNDLE_CREATED",
        payload: { evidence_id: evidenceId, transaction_state: source.current_state },
      },
    ],
    createdAt,
    source.retention_expires_at,
  );
  const auditEvents = [...existingEvents, ...terminalAudit.publications];
  const bundleState =
    source.current_state === "FULFILLED" ? "EVIDENCE_READY" : source.current_state;
  const issuedAt = utcTimestampFromDate(createdAt);
  const issuer = new URL(bindings.MINDPAY_API_AUDIENCE ?? "https://api.mindpay.example/").href;
  const paymentProof = bundleState === "BLOCKED" ? null : paymentFromSource(source, payment);
  const fulfilmentProof =
    bundleState === "EVIDENCE_READY"
      ? await fulfilmentFromSource(bindings.DB, source, fulfilment, createdAt)
      : null;
  const bundle = evidenceBundleSchema.parse({
    agent: {
      agent_id: source.agent_id,
      agent_version: source.agent_version,
      system_policy_hash: source.system_policy_hash,
      tool_versions: tools,
    },
    audit: {
      event_count: auditEvents.length,
      events: auditEvents.map(({ event }) => event),
      final_event_hash: auditEvents.at(-1)?.event.event_hash,
      root_event_hash: auditEvents[0]?.event.event_hash,
    },
    audience: "https://mindpay.example/",
    created_at: issuedAt,
    evidence_id: evidenceId,
    expires_at: utcTimestampFromDate(new Date(source.retention_expires_at)),
    fulfilment: bundleState === "EVIDENCE_READY" ? fulfilmentProof : null,
    issued_at: issuedAt,
    issuer,
    jti: evidenceId,
    kid: (await loadOrCreatePlatformSigningKey(bindings, createdAt.getTime())).kid,
    merchant: {
      catalog_hash: source.catalog_hash,
      checkout_amount_subunits: decision.checkout.total_subunits,
      checkout_currency: decision.checkout.currency,
      checkout_hash: decision.checkoutHash,
      checkout_session_id: decision.checkout.checkout_session_id,
      checkout_signature_verified: decision.checkoutSignatureVerified,
      manifest_hash: source.manifest_hash,
      merchant_id: source.merchant_id,
      offer_signature_verified: decision.offerSignatureVerified,
    },
    payment: paymentProof,
    policy: {
      decision: decision.policy.decision,
      reasons: decision.policy.reasons.map((reason) => ({
        code: normalizeReasonCode(reason.code),
        severity: reason.severity,
      })),
      ruleset_version: decision.policy.rulesetVersion,
    },
    risk: {
      outcome: decision.risk.outcome,
      reasons: decision.risk.reasons.map((reason) => ({
        code: normalizeReasonCode(reason.code),
        severity: reason.severity,
      })),
      ruleset_version: decision.risk.rulesetVersion,
    },
    schema_version: "mindpay.evidence.1",
    transaction: {
      amount_subunits: source.amount_subunits,
      checkout_session_id: decision.checkout.checkout_session_id,
      completed_at: utcTimestampFromDate(new Date(source.updated_at)),
      created_at: utcTimestampFromDate(new Date(source.created_at)),
      currency: "INR",
      mandate_id: source.mandate_id,
      state: bundleState,
      transaction_id: source.transaction_id,
    },
    user_mandate: {
      mandate_id: source.mandate_id,
      payload_hash: mandateProof.payload_hash,
      proof: {
        challenge_hash: mandateProof.challenge_hash,
        credential_id_hash: await sha256Hex(mandateProof.credential_id),
        proof_type: "WEBAUTHN_ASSERTION",
        signed_payload_hash: mandateProof.payload_hash,
        verified_at: utcTimestampFromDate(new Date(mandateProof.verified_at)),
      },
    },
  });
  const signingKey = await loadOrCreatePlatformSigningKey(bindings, createdAt.getTime());
  const bundleHash = await sha256CanonicalJsonHex(bundle);
  const signature = await signCanonicalJsonEs256(bundle, signingKey, createdAt.getTime());
  const envelope = signedEvidenceBundleSchema.parse({
    auditSignatures: auditEvents.map(({ event, signature: auditSignature }) => ({
      eventId: event.jti,
      signature: auditSignature,
    })),
    bundle,
    bundleHash,
    signature,
  });
  const privateStorageKey = `evidence/${source.organization_id}/${evidenceId}.json`;
  await bindings.EVIDENCE?.put(privateStorageKey, JSON.stringify(envelope), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { bundleHash, schemaVersion: bundle.schema_version },
  });
  try {
    await bindings.DB.batch([
      ...terminalAudit.statements,
      bindings.DB.prepare(
        `INSERT INTO evidence_bundles
         (id, organization_id, transaction_id, status, schema_version, bundle_json, bundle_hash,
          signature_json, signing_kid, private_storage_key, retention_expires_at, created_at)
         VALUES (?, ?, ?, 'READY', 'mindpay.evidence.1', ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        evidenceId,
        source.organization_id,
        transactionId,
        JSON.stringify(bundle),
        bundleHash,
        JSON.stringify(signature),
        signingKey.kid,
        privateStorageKey,
        source.retention_expires_at,
        createdAt.getTime(),
      ),
      ...(source.current_state === "FULFILLED"
        ? [
            bindings.DB.prepare(
              "UPDATE transactions SET state = 'EVIDENCE_READY', updated_at = ? WHERE id = ? AND state = 'FULFILLED'",
            ).bind(createdAt.getTime(), transactionId),
          ]
        : []),
    ]);
  } catch (error) {
    const raced = await readEvidenceRowByTransaction(bindings.DB, transactionId);
    if (raced === null) throw error;
    return verifyEvidenceRow(bindings.DB, raced, createdAt);
  }
  await broadcastAuditEvents(bindings, transactionId, terminalAudit.publications);
  const row = await readEvidenceRowByTransaction(bindings.DB, transactionId);
  if (row === null) throw new Error("Stored evidence could not be reloaded");
  return verifyEvidenceRow(bindings.DB, row, createdAt);
}

export async function getPublicEvidence(
  bindings: GatewayAuthBindings,
  evidenceId: string,
  verifiedAt = new Date(),
): Promise<PublicEvidenceBundle | null> {
  const row = await bindings.DB.prepare(
    "SELECT id, transaction_id, bundle_json, bundle_hash, signature_json, signing_kid FROM evidence_bundles WHERE id = ? LIMIT 1",
  )
    .bind(evidenceId)
    .first();
  return row === null
    ? null
    : verifyEvidenceRow(bindings.DB, evidenceRowSchema.parse(row), verifiedAt);
}

async function verifyEvidenceRow(
  database: D1Database,
  row: z.infer<typeof evidenceRowSchema>,
  verifiedAt: Date,
): Promise<PublicEvidenceBundle> {
  const rawBundle = parseJsonOrNull(row.bundle_json);
  const parsedBundle = evidenceBundleSchema.safeParse(rawBundle);
  const bundleHash = await sha256CanonicalJsonHex(rawBundle).catch(() => "0".repeat(64));
  const hashValid = bundleHash === row.bundle_hash;
  const storedSignature = es256CanonicalSignatureSchema.safeParse(
    parseJsonOrNull(row.signature_json),
  );
  const keyRow = await database
    .prepare(
      "SELECT public_jwk, valid_from, valid_until, revoked_at FROM platform_signing_keys WHERE kid = ? LIMIT 1",
    )
    .bind(row.signing_kid)
    .first<{
      public_jwk: string;
      revoked_at: number | null;
      valid_from: number;
      valid_until: number | null;
    }>();
  let signatureValid = false;
  if (keyRow !== null && storedSignature.success) {
    try {
      const result = await verifyCanonicalJsonEs256(
        rawBundle,
        storedSignature.data,
        [
          {
            kid: row.signing_kid,
            publicKey: await importEs256PublicJwk(JSON.parse(keyRow.public_jwk) as unknown),
            validFromEpochMs: keyRow.valid_from,
            ...(keyRow.valid_until === null ? {} : { validUntilEpochMs: keyRow.valid_until }),
            ...(keyRow.revoked_at === null ? {} : { revokedAtEpochMs: keyRow.revoked_at }),
          },
        ],
        verifiedAt.getTime(),
      );
      signatureValid = result.valid;
    } catch {
      signatureValid = false;
    }
  }
  const [audit, auditPublications] = await Promise.all([
    verifyStoredAuditEvents(database, row.transaction_id, verifiedAt.getTime()).catch(() => ({
      failures: ["AUDIT_READ_FAILED"],
      valid: false,
    })),
    readSignedAuditEvents(database, row.transaction_id).catch(() => []),
  ]);
  const bundle = parsedBundle.success ? parsedBundle.data : null;
  const redactionValid = bundle !== null && !containsForbiddenPublicKey(bundle);
  const proofResults = proofResultSet(
    bundle,
    parsedBundle.success,
    hashValid,
    signatureValid,
    audit.valid,
    redactionValid,
  );
  return publicEvidenceBundleSchema.parse({
    auditSignatures: auditPublications.map(({ event, signature }) => ({
      eventId: event.jti,
      signature,
    })),
    bundle,
    bundleHash: row.bundle_hash,
    evidenceId: row.id,
    proofResults,
    signature: storedSignature.success ? storedSignature.data : null,
    signingKid: row.signing_kid,
    verified: proofResults.every((proof) => proof.status !== "FAIL"),
    verifiedAt: utcTimestampFromDate(verifiedAt),
  });
}

function proofResultSet(
  bundle: EvidenceBundle | null,
  schemaValid: boolean,
  hashValid: boolean,
  signatureValid: boolean,
  auditValid: boolean,
  redactionValid: boolean,
): readonly EvidenceProofResult[] {
  const merchantPassed = Boolean(
    bundle?.merchant.checkout_signature_verified && bundle.merchant.offer_signature_verified,
  );
  const paymentPassed =
    bundle !== null &&
    bundle.payment !== null &&
    (bundle.transaction.state === "PAYMENT_FAILED"
      ? !bundle.payment.captured
      : bundle.payment.captured && bundle.payment.order_paid);
  const deliveryPassed =
    bundle !== null &&
    bundle.fulfilment?.merchant_receipt_signature_verified === true &&
    bundle.fulfilment.entitlement_consumed;
  const result = (
    type: EvidenceProofResult["type"],
    label: string,
    passed: boolean | null,
    code: string,
  ) =>
    evidenceProofResultSchema.parse({
      code,
      label,
      status: passed === null ? "NOT_APPLICABLE" : passed ? "PASS" : "FAIL",
      type,
    });
  return Object.freeze([
    result(
      "BUNDLE_SCHEMA",
      "Evidence schema",
      schemaValid,
      schemaValid ? "SCHEMA_VALID" : "SCHEMA_INVALID",
    ),
    result(
      "BUNDLE_HASH",
      "Canonical bundle hash",
      hashValid,
      hashValid ? "HASH_VALID" : "HASH_INVALID",
    ),
    result(
      "BUNDLE_SIGNATURE",
      "MindPay signature",
      signatureValid,
      signatureValid ? "SIGNATURE_VALID" : "SIGNATURE_INVALID",
    ),
    result(
      "AUDIT_CHAIN",
      "Audit hash links",
      auditValid,
      auditValid ? "AUDIT_CHAIN_VALID" : "AUDIT_CHAIN_INVALID",
    ),
    result(
      "AUDIT_SIGNATURES",
      "Audit event signatures",
      auditValid,
      auditValid ? "AUDIT_SIGNATURES_VALID" : "AUDIT_SIGNATURES_INVALID",
    ),
    result(
      "MERCHANT_CHECKOUT",
      "Merchant checkout proof",
      merchantPassed,
      merchantPassed ? "MERCHANT_PROOF_VALID" : "MERCHANT_PROOF_INVALID",
    ),
    result(
      "PAYMENT_EVIDENCE",
      "Razorpay payment proof",
      bundle?.transaction.state === "BLOCKED" ? null : paymentPassed,
      bundle?.transaction.state === "BLOCKED"
        ? "PAYMENT_NOT_APPLICABLE"
        : paymentPassed
          ? "PAYMENT_PROOF_VALID"
          : "PAYMENT_PROOF_INVALID",
    ),
    result(
      "DELIVERY_RECEIPT",
      "Fulfilment receipt",
      bundle === null
        ? false
        : bundle.transaction.state !== "EVIDENCE_READY"
          ? null
          : deliveryPassed,
      bundle !== null && bundle.transaction.state !== "EVIDENCE_READY"
        ? "DELIVERY_NOT_APPLICABLE"
        : deliveryPassed
          ? "DELIVERY_PROOF_VALID"
          : "DELIVERY_PROOF_INVALID",
    ),
    result(
      "PUBLIC_REDACTION",
      "Public redaction",
      redactionValid,
      redactionValid ? "REDACTION_VALID" : "REDACTION_INVALID",
    ),
  ]);
}

async function readEvidenceSource(database: D1Database, transactionId: string) {
  const row = await database
    .prepare(
      `SELECT t.id AS transaction_id, t.organization_id, t.agent_id, av.version AS agent_version,
       av.system_policy_hash, t.amount_subunits, t.mandate_id, t.state AS current_state,
       t.policy_decision_json AS decision_json, t.created_at, t.updated_at, t.retention_expires_at,
       t.merchant_id, m.manifest_hash, c.catalog_hash, md.payload_hash AS mandate_payload_hash
       FROM transactions t
       JOIN agent_versions av ON av.id = t.agent_version_id
       JOIN mandates md ON md.id = t.mandate_id
       JOIN merchants merchant ON merchant.id = t.merchant_id
       JOIN merchant_manifests m ON m.id = merchant.current_manifest_id
       JOIN merchant_catalogs c ON c.id = merchant.current_catalog_id
       WHERE t.id = ? AND t.state IN ('BLOCKED', 'PAYMENT_FAILED', 'FULFILLED') LIMIT 1`,
    )
    .bind(transactionId)
    .first();
  return row === null ? null : sourceRowSchema.parse(row);
}

async function readEvidenceRowByTransaction(database: D1Database, transactionId: string) {
  const row = await database
    .prepare(
      "SELECT id, transaction_id, bundle_json, bundle_hash, signature_json, signing_kid FROM evidence_bundles WHERE transaction_id = ? LIMIT 1",
    )
    .bind(transactionId)
    .first();
  return row === null ? null : evidenceRowSchema.parse(row);
}

async function readMandateProof(database: D1Database, mandateId: string, payloadHash: string) {
  const row = await database
    .prepare(
      `SELECT p.payload_hash, p.verified_at, a.challenge_hash, p.key_id AS credential_id
       FROM mandate_proofs p JOIN approval_challenges a
         ON a.mandate_id = p.mandate_id AND a.payload_hash = p.payload_hash
       WHERE p.mandate_id = ? AND p.payload_hash = ? AND p.proof_type = 'WEBAUTHN_ASSERTION'
         AND a.state = 'CONSUMED' ORDER BY p.verified_at DESC LIMIT 1`,
    )
    .bind(mandateId, payloadHash)
    .first();
  return row === null ? null : mandateProofRowSchema.parse(row);
}

async function readPayment(database: D1Database, transactionId: string) {
  const row = await database
    .prepare(
      `SELECT p.provider_order_id, p.provider_payment_id, p.callback_verified_at, p.order_status,
       p.payment_status, pe.payload_hash, pe.signature_verified
       FROM payment_attempts p LEFT JOIN provider_events pe ON pe.payment_attempt_id = p.id
       WHERE p.transaction_id = ? ORDER BY p.attempt_number DESC, pe.received_at DESC LIMIT 1`,
    )
    .bind(transactionId)
    .first();
  return row === null ? null : paymentRowSchema.parse(row);
}

async function readFulfilment(database: D1Database, transactionId: string) {
  const row = await database
    .prepare(
      `SELECT f.entitlement_id, f.output_hash, f.receipt_json, f.receipt_signature_json
       FROM fulfilment_results f WHERE f.transaction_id = ? LIMIT 1`,
    )
    .bind(transactionId)
    .first();
  return row === null ? null : fulfilmentRowSchema.parse(row);
}

async function readToolVersions(database: D1Database, agentId: string, agentVersion: string) {
  const result = await database
    .prepare(
      `SELECT t.tool_version_id FROM agent_version_tools t JOIN agent_versions v ON v.id = t.agent_version_id
       WHERE v.agent_id = ? AND v.version = ? ORDER BY t.tool_version_id`,
    )
    .bind(agentId, agentVersion)
    .all();
  return result.results.map((untrusted) => {
    const row = z.object({ tool_version_id: z.string() }).strict().parse(untrusted);
    const match = /^(.*)\.v(\d+)$/u.exec(row.tool_version_id);
    return { tool_id: match?.[1] ?? row.tool_version_id, version: `${match?.[2] ?? "1"}.0.0` };
  });
}

function paymentFromSource(
  source: z.infer<typeof sourceRowSchema>,
  payment: z.infer<typeof paymentRowSchema> | null,
) {
  if (payment === null) throw new Error("Payment evidence is unavailable");
  if (payment.payload_hash === null) throw new Error("Payment event evidence hash is unavailable");
  const webhookVerified = payment.signature_verified === true || payment.signature_verified === 1;
  const callbackVerified = payment.callback_verified_at !== null;
  const verificationSources = [
    ...(callbackVerified ? (["CALLBACK"] as const) : []),
    ...(webhookVerified ? (["WEBHOOK"] as const) : []),
  ];
  return {
    amount_subunits: source.amount_subunits,
    callback_signature_verified: callbackVerified,
    captured: payment.payment_status === "captured",
    currency: "INR" as const,
    evidence_hash: payment.payload_hash,
    mode: "TEST" as const,
    order_paid: payment.order_status === "paid",
    provider: "RAZORPAY" as const,
    provider_order_id: payment.provider_order_id,
    provider_payment_id: payment.provider_payment_id,
    transaction_id: source.transaction_id,
    verification_sources: verificationSources,
    webhook_signature_verified: webhookVerified,
  };
}

async function fulfilmentFromSource(
  database: D1Database,
  source: z.infer<typeof sourceRowSchema>,
  fulfilment: z.infer<typeof fulfilmentRowSchema> | null,
  verifiedAt: Date,
) {
  if (fulfilment === null) throw new Error("Fulfilment evidence is unavailable");
  const receipt = JSON.parse(fulfilment.receipt_json) as unknown;
  const signature = JSON.parse(fulfilment.receipt_signature_json) as unknown;
  const parsedSignature = z.object({ kid: z.string() }).passthrough().parse(signature);
  const keyRow = await database
    .prepare(
      `SELECT public_jwk, valid_from, valid_until, revoked_at FROM merchant_keys
       WHERE merchant_id = ? AND kid = ? AND purpose = 'event' LIMIT 1`,
    )
    .bind(source.merchant_id, parsedSignature.kid)
    .first<{
      public_jwk: string;
      revoked_at: number | null;
      valid_from: number;
      valid_until: number | null;
    }>();
  let receiptSignatureVerified = false;
  if (keyRow !== null) {
    try {
      const verification = await verifyCanonicalJsonEs256(
        receipt,
        signature,
        [
          {
            kid: parsedSignature.kid,
            publicKey: await importEs256PublicJwk(JSON.parse(keyRow.public_jwk) as unknown),
            validFromEpochMs: keyRow.valid_from,
            ...(keyRow.valid_until === null ? {} : { validUntilEpochMs: keyRow.valid_until }),
            ...(keyRow.revoked_at === null ? {} : { revokedAtEpochMs: keyRow.revoked_at }),
          },
        ],
        verifiedAt.getTime(),
      );
      receiptSignatureVerified = verification.valid;
    } catch {
      receiptSignatureVerified = false;
    }
  }
  return {
    delivery_receipt_hash: await sha256CanonicalJsonHex(receipt),
    entitlement_consumed: true,
    entitlement_id: fulfilment.entitlement_id,
    merchant_receipt_signature_verified: receiptSignatureVerified,
    output_hash: fulfilment.output_hash,
    transaction_id: source.transaction_id,
  };
}

function normalizeReasonCode(code: string): string {
  return code.toLowerCase();
}

function containsForbiddenPublicKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPublicKey);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([key, nested]) =>
    /^(?:api[_-]?key|authorization|cookie|password|private[_-]?(?:jwk|key)|prompt|raw[_-]?payload|refresh[_-]?token|secret|session[_-]?token|token|webhook[_-]?secret)$/iu.test(
      key,
    ) && !key.toLowerCase().endsWith("_hash")
      ? nested !== "[REDACTED]"
      : containsForbiddenPublicKey(nested),
  );
}

function parseJsonOrNull(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
