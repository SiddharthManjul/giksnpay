import { bindingAllowsService } from "@mindpay/agent-runtime";
import {
  type AgentToolBinding,
  agentToolBindingSchema,
  evidenceAvailabilitySchema,
  getVerifiedServiceOutputSchema,
  mindPayMcpProposalInputSchema,
  mindPayMcpProposalSchema,
  mindPayMcpSearchInputSchema,
  mindPayMcpServiceInputSchema,
  mindPayMcpTransactionInputSchema,
  requestSignedOfferOutputSchema,
  searchVerifiedServicesOutputSchema,
  transactionStatusOutputSchema,
  verifiedServiceOfferSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";
import {
  createRemoteMcpHandler,
  McpServer,
  mcpStructuredResult,
  mcpToolError,
  validateMcpHost,
} from "@mindpay/mcp-tools";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
} from "./authorization";
import { readMarketplaceDocument } from "./marketplace";

const MCP_REQUESTS_PER_MINUTE = 60;

const agentBindingRowSchema = z.object({ scope_json: z.string() }).strict();
const offerEvidenceRowSchema = z
  .object({
    catalog_expires_at: z.number().int().nonnegative(),
    catalog_hash: z.string(),
    catalog_signature: z.string(),
    catalog_verified_at: z.number().int().nonnegative(),
  })
  .strict();
const transactionStatusRowSchema = z
  .object({
    amount_subunits: z.number().int().nonnegative(),
    currency: z.literal("INR"),
    id: z.string(),
    state: z.string(),
  })
  .strict();

type ToolName =
  | "get_evidence_bundle"
  | "get_transaction_status"
  | "get_verified_service"
  | "propose_purchase"
  | "request_signed_offer"
  | "search_verified_services";

class MindPayMcpError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MindPayMcpError";
  }
}

export interface MindPayMcpDependencies {
  readonly now?: () => Date;
}

export function createMindPayMcpRoutes(dependencies: MindPayMcpDependencies = {}) {
  const routes = new Hono<GatewayEnvironment>();
  const now = dependencies.now ?? (() => new Date());
  routes.use("*", requireAuthentication);
  routes.use("*", requireOrganizationCapability("agent:read"));
  routes.all("/", async (context) => {
    const hostRejection = validateMcpHost(context.req.raw, allowedHosts(context.env));
    if (hostRejection !== undefined) return hostRejection;
    if (!trustedOrigin(context.req.raw, context.env.TRUSTED_ORIGINS)) {
      return new Response(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }), {
        headers: { "Content-Type": "application/json" },
        status: 403,
      });
    }
    const handler = createRemoteMcpHandler(() => createServer(context, now));
    return handler.fetch(context.req.raw);
  });
  return routes;
}

function createServer(context: Context<GatewayEnvironment>, now: () => Date) {
  const server = new McpServer({ name: "mindpay", version: "1.0.0" });
  server.registerTool(
    "search_verified_services",
    {
      description: "Search only currently verified services within this agent's published scope.",
      inputSchema: mindPayMcpSearchInputSchema,
      outputSchema: searchVerifiedServicesOutputSchema,
      title: "Search Verified Services",
    },
    async (input) =>
      execute(
        context,
        now,
        "search_verified_services",
        input.agentId,
        input,
        async (binding, calledAt) => {
          const document = await readMarketplaceDocument(
            context.env.DB,
            context.env.MARKETPLACE_CACHE,
            calledAt.getTime(),
          );
          const query = input.query.toLocaleLowerCase("en-US");
          return searchVerifiedServicesOutputSchema.parse({
            services: document.services.filter((service) => {
              const searchable =
                `${service.name}\n${service.description}\n${service.merchant.name}`.toLocaleLowerCase(
                  "en-US",
                );
              return (
                service.category === input.category &&
                service.priceSubunits <= input.maximumPriceSubunits &&
                searchable.includes(query) &&
                bindingAllowsService(binding, service)
              );
            }),
          });
        },
      ),
  );
  server.registerTool(
    "get_verified_service",
    {
      description: "Read one currently verified service within this agent's published scope.",
      inputSchema: mindPayMcpServiceInputSchema,
      outputSchema: getVerifiedServiceOutputSchema,
      title: "Get Verified Service",
    },
    async (input) =>
      execute(
        context,
        now,
        "get_verified_service",
        input.agentId,
        input,
        async (binding, calledAt) => ({
          service: await scopedService(context, input.serviceId, binding, calledAt),
        }),
      ),
  );
  server.registerTool(
    "request_signed_offer",
    {
      description:
        "Read the verified catalog evidence and exact current commercial terms for one service.",
      inputSchema: mindPayMcpServiceInputSchema,
      outputSchema: requestSignedOfferOutputSchema,
      title: "Request Signed Offer",
    },
    async (input) =>
      execute(
        context,
        now,
        "request_signed_offer",
        input.agentId,
        input,
        async (binding, calledAt) => ({
          offer: await signedOffer(
            context,
            await scopedService(context, input.serviceId, binding, calledAt),
            calledAt,
          ),
        }),
      ),
  );
  server.registerTool(
    "propose_purchase",
    {
      description:
        "Create a non-authoritative purchase proposal. This tool cannot create a transaction or move money.",
      inputSchema: mindPayMcpProposalInputSchema,
      outputSchema: mindPayMcpProposalSchema,
      title: "Propose Purchase",
    },
    async (input) =>
      execute(context, now, "propose_purchase", input.agentId, input, async (binding, calledAt) => {
        const service = await scopedService(context, input.serviceId, binding, calledAt);
        return mindPayMcpProposalSchema.parse({
          amountSubunits: service.priceSubunits,
          currency: service.currency,
          decisionSummary: input.decisionSummary,
          merchantId: service.merchant.id,
          requiresTransactionCreation: true,
          serviceId: service.id,
        });
      }),
  );
  server.registerTool(
    "get_transaction_status",
    {
      description:
        "Read a transaction owned by the authenticated user, organization, and bound agent.",
      inputSchema: mindPayMcpTransactionInputSchema,
      outputSchema: transactionStatusOutputSchema,
      title: "Get Transaction Status",
    },
    async (input) =>
      execute(context, now, "get_transaction_status", input.agentId, input, async () => {
        const row = await context.env.DB.prepare(
          "SELECT id, amount_subunits, currency, state FROM transactions WHERE id = ? AND organization_id = ? AND user_id = ? AND agent_id = ? LIMIT 1",
        )
          .bind(
            input.transactionId,
            organizationId(context),
            context.get("principal").id,
            input.agentId,
          )
          .first();
        if (row === null) throw new MindPayMcpError("TRANSACTION_NOT_FOUND");
        return transactionStatusOutputSchema.parse(transactionStatusRowSchema.parse(row));
      }),
  );
  server.registerTool(
    "get_evidence_bundle",
    {
      description:
        "Read evidence availability for a transaction without synthesizing missing evidence.",
      inputSchema: mindPayMcpTransactionInputSchema,
      outputSchema: evidenceAvailabilitySchema,
      title: "Get Evidence Bundle",
    },
    async (input) =>
      execute(context, now, "get_evidence_bundle", input.agentId, input, async () => {
        const row = await context.env.DB.prepare(
          "SELECT id FROM transactions WHERE id = ? AND organization_id = ? AND user_id = ? AND agent_id = ? LIMIT 1",
        )
          .bind(
            input.transactionId,
            organizationId(context),
            context.get("principal").id,
            input.agentId,
          )
          .first();
        if (row === null) throw new MindPayMcpError("TRANSACTION_NOT_FOUND");
        return evidenceAvailabilitySchema.parse({
          available: false,
          reason: "NOT_YET_CREATED",
          transactionId: input.transactionId,
        });
      }),
  );
  return server;
}

async function execute<T extends Readonly<Record<string, unknown>>>(
  context: Context<GatewayEnvironment>,
  now: () => Date,
  toolName: ToolName,
  agentId: string,
  input: Readonly<Record<string, unknown>>,
  operation: (binding: AgentToolBinding, calledAt: Date) => Promise<T>,
) {
  const calledAt = now();
  const inputHash = await sha256CanonicalJsonHex(input);
  try {
    const binding = await readBinding(context, agentId, `${toolName}.v1`);
    await enforceRateLimit(context, agentId, calledAt);
    const output = await operation(binding, calledAt);
    const outputHash = await sha256CanonicalJsonHex(output);
    await recordInvocation(
      context,
      agentId,
      toolName,
      inputHash,
      outputHash,
      "SUCCEEDED",
      null,
      calledAt,
    );
    return mcpStructuredResult(output);
  } catch (error) {
    const code = error instanceof MindPayMcpError ? error.code : "TOOL_EXECUTION_FAILED";
    const outcome = code === "RATE_LIMITED" ? "RATE_LIMITED" : "FAILED";
    await recordInvocation(
      context,
      agentId,
      toolName,
      inputHash,
      null,
      outcome,
      code,
      calledAt,
    ).catch(() => undefined);
    return mcpToolError(code);
  }
}

async function readBinding(
  context: Context<GatewayEnvironment>,
  agentId: string,
  toolVersionId: string,
) {
  const row = await context.env.DB.prepare(
    `SELECT t.scope_json FROM agents a
     JOIN agent_versions v ON v.id = a.current_version_id AND v.agent_id = a.id
     JOIN agent_version_tools t ON t.agent_version_id = v.id
     WHERE a.id = ? AND a.organization_id = ? AND a.status = 'ACTIVE'
       AND v.published_at IS NOT NULL AND t.tool_version_id = ? LIMIT 1`,
  )
    .bind(agentId, organizationId(context), toolVersionId)
    .first();
  if (row === null) throw new MindPayMcpError("TOOL_NOT_BOUND");
  const parsed = agentBindingRowSchema.parse(row);
  return agentToolBindingSchema.parse({
    scope: JSON.parse(parsed.scope_json) as unknown,
    toolVersionId,
  });
}

async function scopedService(
  context: Context<GatewayEnvironment>,
  serviceId: string,
  binding: AgentToolBinding,
  now: Date,
) {
  const document = await readMarketplaceDocument(
    context.env.DB,
    context.env.MARKETPLACE_CACHE,
    now.getTime(),
  );
  const service = document.services.find((candidate) => candidate.id === serviceId);
  if (service === undefined) throw new MindPayMcpError("SERVICE_NOT_VERIFIED");
  if (!bindingAllowsService(binding, service)) throw new MindPayMcpError("TOOL_SCOPE_DENIED");
  return service;
}

async function signedOffer(
  context: Context<GatewayEnvironment>,
  service: Awaited<ReturnType<typeof scopedService>>,
  now: Date,
) {
  const row = await context.env.DB.prepare(
    `SELECT mc.catalog_hash, mc.signature AS catalog_signature, mc.verified_at AS catalog_verified_at,
      mc.expires_at AS catalog_expires_at FROM services s
     JOIN service_versions sv ON sv.id = s.current_version_id
     JOIN merchants m ON m.id = s.merchant_id JOIN merchant_catalogs mc ON mc.id = m.current_catalog_id
     WHERE s.id = ? AND sv.version = ? AND sv.catalog_hash = mc.catalog_hash AND m.id = ?
       AND s.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.verification_status = 'APPROVED'
       AND m.verification_expires_at > ? AND mc.expires_at > ? LIMIT 1`,
  )
    .bind(service.id, service.version, service.merchant.id, now.getTime(), now.getTime())
    .first();
  if (row === null) throw new MindPayMcpError("SIGNED_OFFER_UNAVAILABLE");
  const evidence = offerEvidenceRowSchema.parse(row);
  return verifiedServiceOfferSchema.parse({
    amountSubunits: service.priceSubunits,
    catalogExpiresAt: utcTimestampFromDate(new Date(evidence.catalog_expires_at)),
    catalogHash: evidence.catalog_hash,
    catalogSignature: JSON.parse(evidence.catalog_signature) as unknown,
    catalogSignatureVerified: true,
    currency: service.currency,
    merchantDomain: service.merchant.domain,
    merchantId: service.merchant.id,
    paymentRail: service.paymentRail,
    serviceExternalId: service.externalId,
    serviceId: service.id,
    serviceVersion: service.version,
    termsUrl: service.policyLinks.termsUrl,
    verifiedAt: utcTimestampFromDate(new Date(evidence.catalog_verified_at)),
  });
}

async function enforceRateLimit(context: Context<GatewayEnvironment>, agentId: string, now: Date) {
  const windowStartedAt = Math.floor(now.getTime() / 60_000) * 60_000;
  const subjectHash = await sha256CanonicalJsonHex({
    agentId,
    organizationId: organizationId(context),
    sessionId: context.get("principal").sessionId,
    userId: context.get("principal").id,
  });
  await context.env.DB.prepare(
    `INSERT INTO mcp_rate_limits (subject_hash, window_started_at, request_count, expires_at)
     VALUES (?, ?, 1, ?) ON CONFLICT(subject_hash, window_started_at)
     DO UPDATE SET request_count = request_count + 1`,
  )
    .bind(subjectHash, windowStartedAt, windowStartedAt + 120_000)
    .run();
  const row = await context.env.DB.prepare(
    "SELECT request_count FROM mcp_rate_limits WHERE subject_hash = ? AND window_started_at = ?",
  )
    .bind(subjectHash, windowStartedAt)
    .first<{ request_count: number }>();
  if (row === null || row.request_count > MCP_REQUESTS_PER_MINUTE)
    throw new MindPayMcpError("RATE_LIMITED");
}

async function recordInvocation(
  context: Context<GatewayEnvironment>,
  agentId: string,
  toolName: ToolName,
  inputHash: string,
  outputHash: string | null,
  outcome: "FAILED" | "RATE_LIMITED" | "SUCCEEDED",
  errorCode: string | null,
  occurredAt: Date,
) {
  await context.env.DB.prepare(
    `INSERT INTO mcp_tool_invocations
     (id, organization_id, user_id, agent_id, tool_name, input_hash, output_hash, outcome, error_code, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `mci_${createUlid(occurredAt.getTime())}`,
      organizationId(context),
      context.get("principal").id,
      agentId,
      toolName,
      inputHash,
      outputHash,
      outcome,
      errorCode,
      occurredAt.getTime(),
    )
    .run();
}

function organizationId(context: Context<GatewayEnvironment>) {
  return context.get("organizationAuthorization").organization.id;
}

function allowedHosts(bindings: GatewayEnvironment["Bindings"]) {
  return Object.freeze([
    new URL(bindings.MINDPAY_API_AUDIENCE ?? "https://api.mindpay.example/").hostname,
    "localhost",
    "127.0.0.1",
  ]);
}

function trustedOrigin(request: Request, configuredOrigins: string) {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  try {
    const allowed = configuredOrigins
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new URL(value).origin);
    return allowed.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}
