import { parseWorkerEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";

export type MerchantBindings = {
  ENVIRONMENT: string;
};

export const merchant = new Hono<{ Bindings: MerchantBindings }>();

merchant.get("/health", (context) => {
  parseWorkerEnvironment(context.env);

  const response = healthResponseSchema.parse({
    service: "signalworks",
    status: "ok",
  });

  return context.json(response);
});

export default merchant;
