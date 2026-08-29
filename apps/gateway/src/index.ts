import { parseWorkerEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";
import { type GatewayAuthBindings, handleGatewayAuth } from "./auth";

export type GatewayBindings = GatewayAuthBindings;

export const gateway = new Hono<{ Bindings: GatewayBindings }>();

gateway.get("/health", (context) => {
  parseWorkerEnvironment({ ENVIRONMENT: context.env.ENVIRONMENT });

  const response = healthResponseSchema.parse({
    service: "mindpay-gateway",
    status: "ok",
  });

  return context.json(response);
});

gateway.all("/api/auth/*", (context) => handleGatewayAuth(context.req.raw, context.env));

export default gateway;
