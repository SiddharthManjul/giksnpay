import { parseWorkerEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";
import { type GatewayAuthBindings, handleGatewayAuth } from "./auth";
import type { GatewayEnvironment } from "./authorization";
import { browserSecurityBoundary } from "./browser-security";
import { demoWorkspaceRoutes } from "./demo-workspaces";
import { organizationRoutes } from "./organizations";
import { passkeyRoutes } from "./passkeys";

export type GatewayBindings = GatewayAuthBindings;

export const gateway = new Hono<GatewayEnvironment>();

gateway.use("/api/*", browserSecurityBoundary);

gateway.get("/health", (context) => {
  parseWorkerEnvironment({ ENVIRONMENT: context.env.ENVIRONMENT });

  const response = healthResponseSchema.parse({
    service: "mindpay-gateway",
    status: "ok",
  });

  return context.json(response);
});

gateway.all("/api/auth/*", (context) => handleGatewayAuth(context.req.raw, context.env));
gateway.route("/api/v1/demo-workspaces", demoWorkspaceRoutes);
gateway.route("/api/v1/passkeys", passkeyRoutes);
gateway.route("/api/v1", organizationRoutes);

export default gateway;
