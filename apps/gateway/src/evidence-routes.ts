import {
  evidenceIdSchema,
  organizationIdSchema,
  publicEvidenceBundleSchema,
  transactionAuditEventsResponseSchema,
  transactionIdSchema,
} from "@mindpay/contracts";
import { Hono, type Context } from "hono";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
  resourceNotFound,
} from "./authorization";
import { readSignedAuditEvents, verifyStoredAuditEvents } from "./audit";
import { ensureEvidenceBundle, getPublicEvidence } from "./evidence";

export function createPublicEvidenceRoutes(dependencies: { readonly now?: () => Date } = {}) {
  const routes = new Hono<GatewayEnvironment>();
  const now = dependencies.now ?? (() => new Date());

  routes.get("/:evidenceId", async (context) => {
    const evidenceId = evidenceIdSchema.safeParse(context.req.param("evidenceId"));
    if (!evidenceId.success) return resourceNotFound(context);
    const evidence = await getPublicEvidence(context.env, evidenceId.data, now());
    if (evidence === null) return resourceNotFound(context);
    context.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return context.json(publicEvidenceBundleSchema.parse(evidence));
  });

  routes.get("/:evidenceId/download", async (context) => {
    const evidenceId = evidenceIdSchema.safeParse(context.req.param("evidenceId"));
    if (!evidenceId.success) return resourceNotFound(context);
    const evidence = await getPublicEvidence(context.env, evidenceId.data, now());
    if (evidence === null) return resourceNotFound(context);
    context.header("Cache-Control", "no-store");
    context.header("Content-Disposition", `attachment; filename="mindpay-${evidenceId.data}.json"`);
    context.header("Content-Type", "application/json; charset=utf-8");
    return context.body(JSON.stringify(publicEvidenceBundleSchema.parse(evidence), null, 2));
  });
  return routes;
}

export function createTransactionEvidenceRoutes(dependencies: { readonly now?: () => Date } = {}) {
  const routes = new Hono<GatewayEnvironment>();
  const now = dependencies.now ?? (() => new Date());
  routes.use("*", requireAuthentication);
  routes.use("/:transactionId/events", requireOrganizationCapability("agent:read"));
  routes.use("/:transactionId/evidence", requireOrganizationCapability("agent:read"));

  routes.get("/:transactionId/events", async (context) => {
    const transactionId = await ownedTransactionId(context, context.req.param("transactionId"));
    if (transactionId === null) return resourceNotFound(context);
    const [events, verification] = await Promise.all([
      readSignedAuditEvents(context.env.DB, transactionId),
      verifyStoredAuditEvents(context.env.DB, transactionId, now().getTime()),
    ]);
    const invalid = new Set(
      verification.failures
        .map((failure) => /^EVENT_(\d+)_/u.exec(failure)?.[1])
        .filter((index): index is string => index !== undefined)
        .map(Number),
    );
    return context.json(
      transactionAuditEventsResponseSchema.parse({
        events: events.map(({ event }, index) => ({
          event,
          signatureVerified: !invalid.has(index),
        })),
      }),
    );
  });

  routes.get("/:transactionId/evidence", async (context) => {
    const transactionId = await ownedTransactionId(context, context.req.param("transactionId"));
    if (transactionId === null) return resourceNotFound(context);
    try {
      return context.json(await ensureEvidenceBundle(context.env, transactionId, now()));
    } catch {
      return apiError(
        context,
        409,
        "EVIDENCE_NOT_READY",
        "The transaction does not yet have complete terminal evidence.",
      );
    }
  });

  routes.get("/:transactionId/stream", async (context) => {
    const transactionId = await ownedStreamTransactionId(
      context,
      context.req.param("transactionId"),
      context.req.query("organizationId"),
      now().getTime(),
    );
    if (transactionId === null) return resourceNotFound(context);
    if (
      context.env.TRANSACTION_EVENTS === undefined ||
      context.req.header("Upgrade")?.toLowerCase() !== "websocket"
    ) {
      return apiError(
        context,
        426,
        "REALTIME_UPGRADE_REQUIRED",
        "Use a WebSocket upgrade, then refetch canonical state after connecting.",
      );
    }
    const id = context.env.TRANSACTION_EVENTS.idFromName(transactionId);
    return context.env.TRANSACTION_EVENTS.get(id).fetch(context.req.raw);
  });
  return routes;
}

async function ownedStreamTransactionId(
  context: Context<GatewayEnvironment>,
  untrustedTransactionId: string | undefined,
  untrustedOrganizationId: string | undefined,
  nowEpochMs: number,
): Promise<string | null> {
  const transactionId = transactionIdSchema.safeParse(untrustedTransactionId);
  const organizationId = organizationIdSchema.safeParse(untrustedOrganizationId);
  if (!transactionId.success || !organizationId.success) return null;
  const principal = context.get("principal");
  const row = await context.env.DB.prepare(
    `SELECT t.id FROM transactions t
     JOIN organization_members om ON om.organization_id = t.organization_id
     JOIN organizations o ON o.id = t.organization_id
     LEFT JOIN demo_workspaces dw ON dw.organization_id = t.organization_id
     WHERE t.id = ? AND t.organization_id = ? AND t.user_id = ? AND om.user_id = ?
       AND o.status = 'ACTIVE' AND (dw.organization_id IS NULL OR dw.expires_at > ?)
     LIMIT 1`,
  )
    .bind(transactionId.data, organizationId.data, principal.id, principal.id, nowEpochMs)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function ownedTransactionId(
  context: Context<GatewayEnvironment>,
  untrusted: string | undefined,
): Promise<string | null> {
  const parsed = transactionIdSchema.safeParse(untrusted);
  if (!parsed.success) return null;
  const row = await context.env.DB.prepare(
    "SELECT id FROM transactions WHERE id = ? AND organization_id = ? AND user_id = ? LIMIT 1",
  )
    .bind(
      parsed.data,
      context.get("organizationAuthorization").organization.id,
      context.get("principal").id,
    )
    .first<{ id: string }>();
  return row?.id ?? null;
}
