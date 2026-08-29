import { z } from "zod";
import {
  auditEventSchema,
  closedCheckoutMandateSchema,
  closedPaymentMandateSchema,
  entitlementSchema,
  evidenceBundleSchema,
  mandateSchema,
  merchantEventSchema,
  openCheckoutMandateSchema,
  openPaymentMandateSchema,
} from "./cross-party";

const SCHEMA_BASE_URL = "https://schemas.mindpay.dev/protocol/v1";

export const openCheckoutMandateJsonSchema = createJsonSchema(
  openCheckoutMandateSchema,
  `${SCHEMA_BASE_URL}/open-checkout-mandate.schema.json`,
);

export const openPaymentMandateJsonSchema = createJsonSchema(
  openPaymentMandateSchema,
  `${SCHEMA_BASE_URL}/open-payment-mandate.schema.json`,
);

export const closedCheckoutMandateJsonSchema = createJsonSchema(
  closedCheckoutMandateSchema,
  `${SCHEMA_BASE_URL}/closed-checkout-mandate.schema.json`,
);

export const closedPaymentMandateJsonSchema = createJsonSchema(
  closedPaymentMandateSchema,
  `${SCHEMA_BASE_URL}/closed-payment-mandate.schema.json`,
);

export const mandateJsonSchema = createJsonSchema(
  mandateSchema,
  `${SCHEMA_BASE_URL}/mandate.schema.json`,
);

export const merchantEventJsonSchema = createJsonSchema(
  merchantEventSchema,
  `${SCHEMA_BASE_URL}/merchant-event.schema.json`,
);

export const auditEventJsonSchema = createJsonSchema(
  auditEventSchema,
  `${SCHEMA_BASE_URL}/audit-event.schema.json`,
);

export const entitlementJsonSchema = createJsonSchema(
  entitlementSchema,
  `${SCHEMA_BASE_URL}/entitlement.schema.json`,
);

export const evidenceBundleJsonSchema = createJsonSchema(
  evidenceBundleSchema,
  `${SCHEMA_BASE_URL}/evidence-bundle.schema.json`,
);

function createJsonSchema(schema: z.ZodType, id: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...z.toJSONSchema(schema, { target: "draft-2020-12" }),
    $id: id,
  });
}
