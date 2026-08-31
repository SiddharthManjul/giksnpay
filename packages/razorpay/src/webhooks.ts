import { z } from "zod";
import { razorpayOrderSchema, razorpayPaymentSchema, razorpayRefundSchema } from "./client";

export const supportedRazorpayWebhookEventSchema = z.enum([
  "order.paid",
  "payment.captured",
  "payment.failed",
  "refund.created",
  "refund.failed",
  "refund.processed",
]);

const entity = <T extends z.ZodType>(schema: T) => z.object({ entity: schema }).passthrough();

export const razorpayWebhookPayloadSchema = z
  .object({
    account_id: z.string().min(1),
    contains: z.array(z.string()),
    created_at: z.number().int().nonnegative(),
    entity: z.literal("event"),
    event: supportedRazorpayWebhookEventSchema,
    payload: z
      .object({
        order: entity(razorpayOrderSchema).optional(),
        payment: entity(razorpayPaymentSchema).optional(),
        refund: entity(razorpayRefundSchema).optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const requiredEntity = value.event.split(".")[0] as "order" | "payment" | "refund";
    if (value.payload[requiredEntity] === undefined) {
      context.addIssue({ code: "custom", message: `Webhook is missing ${requiredEntity} entity` });
    }
  })
  .readonly();

export type RazorpayWebhookPayload = z.infer<typeof razorpayWebhookPayloadSchema>;

export function parseRazorpayWebhook(rawBody: Uint8Array): RazorpayWebhookPayload {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)) as unknown;
  } catch {
    throw new TypeError("Razorpay webhook body is not valid UTF-8 JSON");
  }
  return razorpayWebhookPayloadSchema.parse(value);
}
