import { describe, expect, it } from "vitest";
import {
  merchantCatalogJsonSchema,
  merchantCheckoutJsonSchema,
  merchantManifestJsonSchema,
  merchantOfferJsonSchema,
  serviceVersionJsonSchema,
  signedMerchantCatalogJsonSchema,
  signedMerchantManifestJsonSchema,
} from "./merchant-json-schemas";

describe("merchant JSON Schema exports", () => {
  it.each([
    [merchantManifestJsonSchema, "manifest.schema.json"],
    [signedMerchantManifestJsonSchema, "signed-manifest.schema.json"],
    [serviceVersionJsonSchema, "service-version.schema.json"],
    [merchantCatalogJsonSchema, "catalog.schema.json"],
    [signedMerchantCatalogJsonSchema, "signed-catalog.schema.json"],
    [merchantOfferJsonSchema, "offer.schema.json"],
    [merchantCheckoutJsonSchema, "checkout.schema.json"],
  ])("exports a strict draft 2020-12 schema for %s", (schema, filename) => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe(`https://schemas.mindpay.dev/merchant/v1/${filename}`);
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(Object.isFrozen(schema)).toBe(true);
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it("preserves integer INR and required-field constraints", () => {
    const properties = serviceVersionJsonSchema.properties as Record<string, unknown>;
    const price = properties.price_subunits as Record<string, unknown>;
    const currency = properties.currency as Record<string, unknown>;

    expect(price.type).toBe("integer");
    expect(price.minimum).toBe(0);
    expect(currency.enum).toEqual(["INR"]);
    expect(serviceVersionJsonSchema.required).toEqual(
      expect.arrayContaining([
        "service_id",
        "version",
        "price_subunits",
        "currency",
        "fulfilment",
        "policy_links",
      ]),
    );
    for (const schema of [
      merchantManifestJsonSchema,
      merchantCatalogJsonSchema,
      merchantOfferJsonSchema,
      merchantCheckoutJsonSchema,
    ]) {
      expect(schema.required).toEqual(
        expect.arrayContaining(["issuer", "audience", "kid", "issued_at", "expires_at", "nonce"]),
      );
    }
  });
});
