import { describe, expect, it } from "vitest";
import {
  auditEventJsonSchema,
  closedCheckoutMandateJsonSchema,
  closedPaymentMandateJsonSchema,
  entitlementJsonSchema,
  evidenceBundleJsonSchema,
  mandateJsonSchema,
  merchantEventJsonSchema,
  openCheckoutMandateJsonSchema,
  openPaymentMandateJsonSchema,
} from "./cross-party-json-schemas";

describe("cross-party JSON Schema exports", () => {
  it.each([
    [openCheckoutMandateJsonSchema, "open-checkout-mandate.schema.json"],
    [openPaymentMandateJsonSchema, "open-payment-mandate.schema.json"],
    [closedCheckoutMandateJsonSchema, "closed-checkout-mandate.schema.json"],
    [closedPaymentMandateJsonSchema, "closed-payment-mandate.schema.json"],
    [mandateJsonSchema, "mandate.schema.json"],
    [merchantEventJsonSchema, "merchant-event.schema.json"],
    [auditEventJsonSchema, "audit-event.schema.json"],
    [entitlementJsonSchema, "entitlement.schema.json"],
    [evidenceBundleJsonSchema, "evidence-bundle.schema.json"],
  ])("exports serializable draft 2020-12 schema %s", (schema, filename) => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe(`https://schemas.mindpay.dev/protocol/v1/${filename}`);
    expect(Object.isFrozen(schema)).toBe(true);
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it.each([
    openCheckoutMandateJsonSchema,
    openPaymentMandateJsonSchema,
    closedCheckoutMandateJsonSchema,
    closedPaymentMandateJsonSchema,
    merchantEventJsonSchema,
    auditEventJsonSchema,
    entitlementJsonSchema,
    evidenceBundleJsonSchema,
  ])("requires common signed-object claims for %s", (schema) => {
    expect(schema.required).toEqual(
      expect.arrayContaining(["issuer", "audience", "kid", "issued_at", "expires_at"]),
    );
  });

  it("preserves strict integer-INR payment and proof fields", () => {
    const paymentProperties = openPaymentMandateJsonSchema.properties as Record<string, unknown>;
    const maximum = paymentProperties.max_transaction_subunits as Record<string, unknown>;
    const currency = paymentProperties.currency as Record<string, unknown>;
    expect(maximum.type).toBe("integer");
    expect(maximum.minimum).toBe(0);
    expect(currency.enum).toEqual(["INR"]);

    expect(merchantEventJsonSchema.required).toEqual(
      expect.arrayContaining(["checkout_hash", "payment", "amount_subunits", "currency", "jti"]),
    );
    expect(evidenceBundleJsonSchema.required).toEqual(
      expect.arrayContaining([
        "transaction",
        "user_mandate",
        "merchant",
        "policy",
        "risk",
        "audit",
        "jti",
      ]),
    );
  });

  it("publishes all four mandate variants through one union schema", () => {
    expect(mandateJsonSchema.oneOf).toHaveLength(4);
  });
});
