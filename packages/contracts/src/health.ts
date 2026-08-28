import { z } from "zod";

export const serviceNameSchema = z.enum(["mindpay-gateway", "mindpay-web", "signalworks"]);

export const healthResponseSchema = z
  .object({
    service: serviceNameSchema,
    status: z.literal("ok"),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;
