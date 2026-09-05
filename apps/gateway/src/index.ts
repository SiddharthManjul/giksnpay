import { parseWorkerEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";
import { type AgentRunRouteDependencies, createAgentRunRoutes } from "./agent-runs";
import { createAgentRoutes } from "./agents";
import { type GatewayAuthBindings, handleGatewayAuth } from "./auth";
import type { GatewayEnvironment } from "./authorization";
import { browserSecurityBoundary } from "./browser-security";
import { demoWorkspaceRoutes } from "./demo-workspaces";
import { createFulfilmentReceiptRoutes } from "./fulfilment-receipts";
import { createPublicEvidenceRoutes, createTransactionEvidenceRoutes } from "./evidence-routes";
import { ensureEvidenceBundle } from "./evidence";
import { createMandateRoutes, type MandateRouteDependencies } from "./mandates";
import { createMarketplaceRoutes } from "./marketplace";
import { createMindPayMcpRoutes, type MindPayMcpDependencies } from "./mcp";
import { createMerchantAdminRoutes } from "./merchant-admin";
import {
  createMerchantPaymentEventRoutes,
  type MerchantPaymentEventDependencies,
} from "./merchant-payment-events";
import type { MerchantVerificationDependencies } from "./merchant-verification";
import { organizationRoutes } from "./organizations";
import { passkeyRoutes } from "./passkeys";
import { createPurchasePreparationRoutes } from "./purchase-preparations";
import { readPlatformJwks } from "./platform-signing";
import { createTransactionRoutes, type TransactionRouteDependencies } from "./transactions";
export { TransactionEventStream } from "./transaction-events";

export type GatewayBindings = GatewayAuthBindings;

export function createGatewayApp(
  verificationDependencies: MerchantVerificationDependencies = {},
  agentDependencies: Parameters<typeof createAgentRoutes>[0] = {},
  agentRunDependencies: AgentRunRouteDependencies = {},
  mandateDependencies: MandateRouteDependencies = {},
  transactionDependencies: TransactionRouteDependencies = {},
  merchantPaymentEventDependencies: MerchantPaymentEventDependencies = {},
  mcpDependencies: MindPayMcpDependencies = {},
  fulfilmentReceiptDependencies: Parameters<typeof createFulfilmentReceiptRoutes>[0] = {},
) {
  const app = new Hono<GatewayEnvironment>();

  app.use("/api/*", browserSecurityBoundary);

  app.get("/health", (context) => {
    parseWorkerEnvironment({ ENVIRONMENT: context.env.ENVIRONMENT });

    const response = healthResponseSchema.parse({
      service: "mindpay-gateway",
      status: "ok",
    });

    return context.json(response);
  });

  app.get("/.well-known/jwks.json", async (context) => {
    const jwks = await readPlatformJwks(context.env.DB);
    context.header("Cache-Control", "public, max-age=300");
    context.header("X-Content-Type-Options", "nosniff");
    return context.json(jwks);
  });

  app.all("/api/auth/*", (context) => handleGatewayAuth(context.req.raw, context.env));
  app.route("/mcp", createMindPayMcpRoutes(mcpDependencies));
  app.route("/api/v1/admin/merchants", createMerchantAdminRoutes(verificationDependencies));
  app.route("/api/v1/agents", createAgentRoutes(agentDependencies));
  app.route("/api/v1/agents/:agentId/runs", createAgentRunRoutes(agentRunDependencies));
  app.route("/api/v1/agent-runs", createAgentRunRoutes(agentRunDependencies));
  app.route("/api/v1/marketplace", createMarketplaceRoutes(verificationDependencies));
  app.route("/api/v1/mandates", createMandateRoutes(mandateDependencies));
  app.route("/api/v1/transactions", createTransactionRoutes(transactionDependencies));
  app.route("/api/v1/purchase-preparations", createPurchasePreparationRoutes());
  app.route("/api/v1/transactions", createTransactionEvidenceRoutes());
  app.route("/api/v1/evidence", createPublicEvidenceRoutes());
  app.route("/api/internal/v1", createMerchantPaymentEventRoutes(merchantPaymentEventDependencies));
  app.route("/api/internal/v1", createFulfilmentReceiptRoutes(fulfilmentReceiptDependencies));
  app.route("/api/v1/demo-workspaces", demoWorkspaceRoutes);
  app.route("/api/v1/passkeys", passkeyRoutes);
  app.route("/api/v1", organizationRoutes);
  return app;
}

export const gateway = createGatewayApp();

export default {
  fetch: gateway.fetch,
  async queue(
    batch: MessageBatch<{ readonly transactionId: string }>,
    bindings: GatewayAuthBindings,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        await ensureEvidenceBundle(bindings, message.body.transactionId);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
};
