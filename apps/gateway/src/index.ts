import { parseWorkerEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";

export type GatewayBindings = {
  ENVIRONMENT: string;
};

export const gateway = new Hono<{ Bindings: GatewayBindings }>();

gateway.get("/health", (context) => {
  parseWorkerEnvironment(context.env);

  const response = healthResponseSchema.parse({
    service: "mindpay-gateway",
    status: "ok",
  });

  return context.json(response);
});

export default gateway;
