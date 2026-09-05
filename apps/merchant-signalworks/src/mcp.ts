import {
  fulfilmentStatusSchema,
  getFulfilmentStatusInputSchema,
  redeemCompetitorDossierInputSchema,
  redeemMarketSnapshotInputSchema,
} from "@mindpay/contracts";
import {
  createRemoteMcpHandler,
  McpServer,
  mcpStructuredResult,
  mcpToolError,
  validateMcpHost,
} from "@mindpay/mcp-tools";
import { Hono } from "hono";
import type { MerchantBindings } from "./index";
import {
  getSignalWorksFulfilmentStatus,
  redeemSignalWorksService,
  type SignalWorksFulfilmentDependencies,
  SignalWorksFulfilmentError,
} from "./fulfilment";

const ALLOWED_MCP_HOSTS = Object.freeze(["merchant-demo.example.com", "localhost", "127.0.0.1"]);

export function createSignalWorksMcpRoutes(
  dependencies: SignalWorksFulfilmentDependencies = {},
): Hono<{ Bindings: MerchantBindings }> {
  const routes = new Hono<{ Bindings: MerchantBindings }>();
  routes.all("/mcp", async (context) => {
    const hostRejection = validateMcpHost(context.req.raw, ALLOWED_MCP_HOSTS);
    if (hostRejection !== undefined) return hostRejection;
    const handler = createRemoteMcpHandler(() => {
      const server = new McpServer({ name: "signalworks-fulfilment", version: "1.0.0" });
      server.registerTool(
        "redeem_market_snapshot",
        {
          description: "Redeem one paid Market Snapshot entitlement exactly once.",
          inputSchema: redeemMarketSnapshotInputSchema,
          outputSchema: fulfilmentStatusSchema,
          title: "Redeem Market Snapshot",
        },
        async (input) =>
          execute(() =>
            redeemSignalWorksService(context.env, "market_snapshot", input, dependencies),
          ),
      );
      server.registerTool(
        "redeem_competitor_dossier",
        {
          description: "Redeem one paid Detailed Competitor Dossier entitlement exactly once.",
          inputSchema: redeemCompetitorDossierInputSchema,
          outputSchema: fulfilmentStatusSchema,
          title: "Redeem Competitor Dossier",
        },
        async (input) =>
          execute(() =>
            redeemSignalWorksService(
              context.env,
              "detailed_competitor_dossier",
              input,
              dependencies,
            ),
          ),
      );
      server.registerTool(
        "get_fulfilment_status",
        {
          description:
            "Read the fulfilment produced for a scoped entitlement without executing it again.",
          inputSchema: getFulfilmentStatusInputSchema,
          outputSchema: fulfilmentStatusSchema,
          title: "Get Fulfilment Status",
        },
        async ({ entitlementJwt }) =>
          execute(() => getSignalWorksFulfilmentStatus(context.env, entitlementJwt, dependencies)),
      );
      return server;
    });
    return handler.fetch(context.req.raw);
  });
  return routes;
}

async function execute(operation: () => Promise<ReturnType<typeof fulfilmentStatusSchema.parse>>) {
  try {
    return mcpStructuredResult(await operation());
  } catch (error) {
    return mcpToolError(
      error instanceof SignalWorksFulfilmentError ? error.code : "FULFILMENT_UNAVAILABLE",
    );
  }
}
