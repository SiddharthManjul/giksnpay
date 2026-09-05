import { ulidSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import {
  agentIdSchema,
  mandateIdSchema,
  sha256HexSchema,
  transactionIdSchema,
} from "./cross-party";
import {
  checkoutSessionIdSchema,
  es256CanonicalSignatureSchema,
  merchantHttpsUrlSchema,
  merchantIdSchema,
  offerNonceSchema,
  paymentRailSchema,
  stableIdentifierSchema,
} from "./merchant";

const prefixedUlid = (prefix: "evt") =>
  z.string().superRefine((value, context) => {
    if (!value.startsWith(`${prefix}_`) || !ulidSchema.safeParse(value.slice(4)).success) {
      context.addIssue({ code: "custom", message: `Expected ${prefix}_ followed by a ULID` });
    }
  });

const keyIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u);
const providerOrderIdSchema = z.string().regex(/^order_[A-Za-z0-9]{8,64}$/u);
const providerPaymentIdSchema = z.string().regex(/^pay_[A-Za-z0-9]{8,64}$/u);
const providerRefundIdSchema = z.string().regex(/^rfnd_[A-Za-z0-9]{8,64}$/u);

export const merchantPaymentAuthorizationSchema = z
  .object({
    agent_id: agentIdSchema,
    amount_subunits: z.number().int().positive(),
    attempt_number: z.number().int().min(1).max(10),
    checkout_hash: sha256HexSchema,
    checkout_session_id: checkoutSessionIdSchema,
    closed_payment_mandate_hash: sha256HexSchema,
    currency: z.literal("INR"),
    mandate_id: mandateIdSchema,
    payment_rail: paymentRailSchema.refine((rail) => rail === "razorpay:test"),
    service_id: stableIdentifierSchema,
    transaction_id: transactionIdSchema,
  })
  .strict()
  .readonly();

export const safeRazorpayCheckoutConfigSchema = z
  .object({
    amount: z.number().int().positive(),
    currency: z.literal("INR"),
    description: z.string().min(1).max(255),
    key: z.string().regex(/^rzp_test_[A-Za-z0-9]{8,64}$/u),
    name: z.string().min(1).max(120),
    order_id: providerOrderIdSchema,
    retry: z.object({ enabled: z.literal(false) }).strict(),
  })
  .strict()
  .readonly();

export const merchantPaymentOrderResponseSchema = z
  .object({
    attempt_number: z.number().int().min(1).max(10),
    checkout: safeRazorpayCheckoutConfigSchema,
    provider_order_id: providerOrderIdSchema,
    receipt: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/u),
    state: z.literal("PAYMENT_PENDING"),
    transaction_id: transactionIdSchema,
  })
  .strict()
  .readonly();

export const razorpayCheckoutCallbackSchema = z
  .object({
    razorpay_order_id: providerOrderIdSchema,
    razorpay_payment_id: providerPaymentIdSchema,
    razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict()
  .readonly();

export const razorpayCheckoutCallbackResponseSchema = z
  .object({ fulfilment_eligible: z.literal(false), state: z.literal("PAYMENT_RECONCILING") })
  .strict()
  .readonly();

export const merchantPaymentEventTypeSchema = z.enum([
  "ORDER_PAID",
  "PAYMENT_CAPTURED",
  "PAYMENT_FAILED",
  "REFUND_PENDING",
  "REFUNDED",
]);

export const merchantPaymentEventSchema = z
  .object({
    amount_subunits: z.number().int().positive(),
    attempt_number: z.number().int().min(1).max(10),
    audience: merchantHttpsUrlSchema,
    checkout_hash: sha256HexSchema,
    checkout_session_id: checkoutSessionIdSchema,
    currency: z.literal("INR"),
    event_id: prefixedUlid("evt"),
    event_type: merchantPaymentEventTypeSchema,
    expires_at: utcTimestampSchema,
    fulfilment_eligible: z.boolean(),
    issued_at: utcTimestampSchema,
    issuer: merchantHttpsUrlSchema,
    kid: keyIdSchema,
    merchant_id: merchantIdSchema,
    nonce: offerNonceSchema,
    occurred_at: utcTimestampSchema,
    order_status: z.enum(["created", "attempted", "paid"]),
    payment_status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
    provider_order_id: providerOrderIdSchema,
    provider_payment_id: providerPaymentIdSchema.optional(),
    provider_refund_id: providerRefundIdSchema.optional(),
    schema_version: z.literal("mindpay.merchant.payment-event.1"),
    transaction_id: transactionIdSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (Date.parse(event.expires_at) <= Date.parse(event.issued_at)) {
      context.addIssue({ code: "custom", message: "Payment event expiry must follow issuance" });
    }
    if (Date.parse(event.occurred_at) > Date.parse(event.issued_at)) {
      context.addIssue({
        code: "custom",
        message: "Payment event occurrence cannot follow issuance",
      });
    }
    if (
      event.fulfilment_eligible &&
      (event.order_status !== "paid" || event.payment_status !== "captured")
    ) {
      context.addIssue({ code: "custom", message: "Only captured and paid evidence is eligible" });
    }
  })
  .readonly();

export const signedMerchantPaymentEventSchema = z
  .object({
    event: merchantPaymentEventSchema,
    signature: es256CanonicalSignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.event.kid !== value.signature.kid) {
      context.addIssue({ code: "custom", message: "Payment event key IDs must match" });
    }
  })
  .readonly();

export type MerchantPaymentAuthorization = z.infer<typeof merchantPaymentAuthorizationSchema>;
export type MerchantPaymentEvent = z.infer<typeof merchantPaymentEventSchema>;
export type MerchantPaymentEventType = z.infer<typeof merchantPaymentEventTypeSchema>;
export type MerchantPaymentOrderResponse = z.infer<typeof merchantPaymentOrderResponseSchema>;
export type SafeRazorpayCheckoutConfig = z.infer<typeof safeRazorpayCheckoutConfigSchema>;
export type SignedMerchantPaymentEvent = z.infer<typeof signedMerchantPaymentEventSchema>;
