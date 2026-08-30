import { parseWorkerEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";
import { type GatewayAuthBindings, handleGatewayAuth } from "./auth";
import type { GatewayEnvironment } from "./authorization";
import { browserSecurityBoundary } from "./browser-security";
import { demoWorkspaceRoutes } from "./demo-workspaces";
import { createMerchantAdminRoutes } from "./merchant-admin";
import type { MerchantVerificationDependencies } from "./merchant-verification";
import { createMarketplaceRoutes } from "./marketplace";
import { organizationRoutes } from "./organizations";
import { passkeyRoutes } from "./passkeys";

export type GatewayBindings = GatewayAuthBindings;

export function createGatewayApp(verificationDependencies: MerchantVerificationDependencies = {}) {
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

  app.all("/api/auth/*", (context) => handleGatewayAuth(context.req.raw, context.env));
  app.route("/api/v1/admin/merchants", createMerchantAdminRoutes(verificationDependencies));
  app.route("/api/v1/marketplace", createMarketplaceRoutes(verificationDependencies));
  app.route("/api/v1/demo-workspaces", demoWorkspaceRoutes);
  app.route("/api/v1/passkeys", passkeyRoutes);
  app.route("/api/v1", organizationRoutes);
  return app;
}

export const gateway = createGatewayApp();

export default gateway;
