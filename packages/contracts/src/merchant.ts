import { currencyCodeSchema, currencySubunitsSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";

const STABLE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const BASE64URL_256_BIT_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const NONCE_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/u;

const canonicalTextSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .min(minimum)
    .max(maximum)
    .refine((value) => value === value.trim(), "Text must not have leading or trailing whitespace");

const uniqueStringArray = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

export const merchantContractVersionSchema = z.literal("1");

export const stableIdentifierSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(STABLE_IDENTIFIER_PATTERN, "Identifier must be stable lowercase snake_case");

export const merchantIdSchema = z
  .string()
  .min(12)
  .max(96)
  .regex(/^merchant_[a-z0-9]+(?:_[a-z0-9]+)*$/u, "Merchant ID must start with merchant_");

export const catalogIdSchema = z
  .string()
  .min(11)
  .max(96)
  .regex(/^catalog_[a-z0-9]+(?:_[a-z0-9]+)*$/u, "Catalog ID must start with catalog_");

export const checkoutSessionIdSchema = z
  .string()
  .regex(
    /^checkout_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u,
    "Checkout session ID must be checkout_ followed by a canonical ULID",
  );

export const offerIdSchema = z
  .string()
  .regex(
    /^offer_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u,
    "Offer ID must be offer_ followed by a canonical ULID",
  );

export const semanticVersionSchema = z
  .string()
  .regex(SEMANTIC_VERSION_PATTERN, "Version must be canonical major.minor.patch");

export const merchantDomainSchema = z
  .string()
  .min(4)
  .max(253)
  .refine((value) => value === value.toLowerCase(), "Merchant domain must be lowercase")
  .refine((value) => value.includes("."), "Merchant domain must be a fully qualified hostname")
  .refine(
    (value) =>
      value
        .split(".")
        .every(
          (label) =>
            label.length > 0 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
        ),
    "Merchant domain contains an invalid hostname label",
  )
  .refine(
    (value) => !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value),
    "Merchant domain cannot be an IP address",
  )
  .refine((value) => !value.endsWith(".local"), "Merchant domain cannot use a local suffix");

export const merchantHttpsUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      context.addIssue({ code: "custom", message: "Merchant URL must use HTTPS" });
    }
    if (url.username !== "" || url.password !== "") {
      context.addIssue({ code: "custom", message: "Merchant URL cannot contain credentials" });
    }
    if (url.search !== "" || url.hash !== "") {
      context.addIssue({
        code: "custom",
        message: "Merchant URL cannot contain query or fragment",
      });
    }
    if (!merchantDomainSchema.safeParse(url.hostname).success) {
      context.addIssue({
        code: "custom",
        message: "Merchant URL must use a canonical public hostname",
      });
    }
    if (url.toString() !== value) {
      context.addIssue({
        code: "custom",
        message: "Merchant URL must use canonical serialization",
      });
    }
  });

export const offerNonceSchema = z.string().regex(NONCE_PATTERN, "Nonce is not canonical");

const merchantSignedClaimsShape = {
  audience: merchantHttpsUrlSchema,
  issuer: merchantHttpsUrlSchema,
  kid: z.string().regex(KEY_ID_PATTERN, "Key ID is not canonical"),
  nonce: offerNonceSchema,
} as const;

export const merchantIdentitySchema = z
  .object({
    domain: merchantDomainSchema,
    merchant_id: merchantIdSchema,
    name: canonicalTextSchema(2, 120),
  })
  .strict()
  .readonly();

export const es256PublicJwkSchema = z
  .object({
    alg: z.literal("ES256").optional(),
    crv: z.literal("P-256"),
    ext: z.boolean().optional(),
    key_ops: z
      .tuple([z.literal("verify")])
      .readonly()
      .optional(),
    kty: z.literal("EC"),
    use: z.literal("sig").optional(),
    x: z.string().regex(BASE64URL_256_BIT_PATTERN),
    y: z.string().regex(BASE64URL_256_BIT_PATTERN),
  })
  .strict()
  .readonly();

export const merchantSigningPurposeSchema = z.enum(["checkout", "event", "manifest"]);

const merchantSigningPurposesSchema = z
  .array(merchantSigningPurposeSchema)
  .min(1)
  .max(3)
  .refine(uniqueStringArray, "Signing-key purposes must be unique")
  .readonly();

export const merchantSigningKeySchema = z
  .object({
    kid: z.string().regex(KEY_ID_PATTERN),
    public_jwk: es256PublicJwkSchema,
    purpose: merchantSigningPurposesSchema,
    revoked_at: utcTimestampSchema.optional(),
    valid_from: utcTimestampSchema,
    valid_until: utcTimestampSchema.optional(),
  })
  .strict()
  .superRefine((key, context) => {
    if (
      key.valid_until !== undefined &&
      Date.parse(key.valid_until) <= Date.parse(key.valid_from)
    ) {
      context.addIssue({
        code: "custom",
        message: "Signing key valid_until must be later than valid_from",
        path: ["valid_until"],
      });
    }
    if (key.revoked_at !== undefined && Date.parse(key.revoked_at) < Date.parse(key.valid_from)) {
      context.addIssue({
        code: "custom",
        message: "Signing key revoked_at cannot be earlier than valid_from",
        path: ["revoked_at"],
      });
    }
  })
  .readonly();

const signingKeysSchema = z
  .array(merchantSigningKeySchema)
  .min(1)
  .max(16)
  .refine((keys) => uniqueStringArray(keys.map((key) => key.kid)), "Signing key IDs must be unique")
  .refine(
    (keys) => keys.some((key) => key.purpose.includes("manifest")),
    "At least one key must support manifest signing",
  )
  .readonly();

export const paymentRailSchema = z.enum(["razorpay:test"]);

const paymentRailsSchema = z
  .array(paymentRailSchema)
  .min(1)
  .refine(uniqueStringArray, "Payment rails must be unique")
  .readonly();

export const merchantManifestSchema = z
  .object({
    ...merchantSignedClaimsShape,
    acp_base_url: merchantHttpsUrlSchema,
    catalog_url: merchantHttpsUrlSchema,
    domain: merchantDomainSchema,
    expires_at: utcTimestampSchema,
    issued_at: utcTimestampSchema,
    legal_name: canonicalTextSchema(2, 160),
    mcp_url: merchantHttpsUrlSchema,
    merchant_id: merchantIdSchema,
    name: canonicalTextSchema(2, 120),
    payment_rails: paymentRailsSchema,
    schema_version: merchantContractVersionSchema,
    signing_keys: signingKeysSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    validateTimestampOrder(manifest.issued_at, manifest.expires_at, "expires_at", context);
    validateIssuerOrigin(manifest.issuer, manifest.domain, context);
    validateExactOrigin(
      manifest.domain,
      ["acp_base_url", "catalog_url", "mcp_url"],
      manifest,
      context,
    );
    const signingKey = manifest.signing_keys.find((key) => key.kid === manifest.kid);
    if (signingKey === undefined || !signingKey.purpose.includes("manifest")) {
      context.addIssue({
        code: "custom",
        message: "Manifest kid must select a manifest-capable signing key",
        path: ["kid"],
      });
    } else if (
      Date.parse(manifest.issued_at) < Date.parse(signingKey.valid_from) ||
      (signingKey.valid_until !== undefined &&
        Date.parse(manifest.issued_at) >= Date.parse(signingKey.valid_until)) ||
      (signingKey.revoked_at !== undefined &&
        Date.parse(manifest.issued_at) >= Date.parse(signingKey.revoked_at))
    ) {
      context.addIssue({
        code: "custom",
        message: "Manifest signing key must be active at issuance",
        path: ["kid"],
      });
    }
  })
  .readonly();

export const serviceAvailabilitySchema = z.enum(["available", "paused", "unavailable"]);
export const fulfilmentTypeSchema = z.enum(["mcp", "rest"]);

export const servicePolicyLinksSchema = z
  .object({
    privacy_url: merchantHttpsUrlSchema,
    terms_url: merchantHttpsUrlSchema,
  })
  .strict()
  .readonly();

export const serviceFulfilmentSchema = z
  .object({
    estimated_delivery_seconds: z.number().int().positive().max(86_400),
    tool_id: stableIdentifierSchema,
    type: fulfilmentTypeSchema,
  })
  .strict()
  .readonly();

export const serviceVersionSchema = z
  .object({
    availability: serviceAvailabilitySchema,
    category: stableIdentifierSchema,
    currency: currencyCodeSchema,
    description: canonicalTextSchema(10, 2_000),
    fulfilment: serviceFulfilmentSchema,
    merchant_id: merchantIdSchema,
    name: canonicalTextSchema(2, 160),
    policy_links: servicePolicyLinksSchema,
    price_subunits: currencySubunitsSchema,
    published_at: utcTimestampSchema,
    service_id: stableIdentifierSchema,
    version: semanticVersionSchema,
  })
  .strict()
  .readonly();

const catalogServicesSchema = z
  .array(serviceVersionSchema)
  .min(1)
  .max(500)
  .refine(
    (services) => uniqueStringArray(services.map((service) => service.service_id)),
    "Catalog service IDs must be unique",
  )
  .readonly();

export const merchantCatalogSchema = z
  .object({
    ...merchantSignedClaimsShape,
    catalog_id: catalogIdSchema,
    expires_at: utcTimestampSchema,
    generated_at: utcTimestampSchema,
    issued_at: utcTimestampSchema,
    schema_version: merchantContractVersionSchema,
    seller: merchantIdentitySchema,
    services: catalogServicesSchema,
    version: semanticVersionSchema,
  })
  .strict()
  .superRefine((catalog, context) => {
    validateTimestampOrder(catalog.issued_at, catalog.expires_at, "expires_at", context);
    validateIssuerOrigin(catalog.issuer, catalog.seller.domain, context);
    if (catalog.generated_at !== catalog.issued_at) {
      context.addIssue({
        code: "custom",
        message: "Catalog generation must equal signed issuance",
        path: ["generated_at"],
      });
    }

    for (const [index, service] of catalog.services.entries()) {
      if (service.merchant_id !== catalog.seller.merchant_id) {
        context.addIssue({
          code: "custom",
          message: "Service merchant_id must match the catalog seller",
          path: ["services", index, "merchant_id"],
        });
      }
      if (Date.parse(service.published_at) > Date.parse(catalog.generated_at)) {
        context.addIssue({
          code: "custom",
          message: "Service cannot be published after catalog generation",
          path: ["services", index, "published_at"],
        });
      }

      for (const field of ["privacy_url", "terms_url"] as const) {
        if (!hasExactOrigin(service.policy_links[field], catalog.seller.domain)) {
          context.addIssue({
            code: "custom",
            message: "Service policy URL must use the seller's exact HTTPS origin",
            path: ["services", index, "policy_links", field],
          });
        }
      }
    }
  })
  .readonly();

export const merchantOfferSchema = z
  .object({
    ...merchantSignedClaimsShape,
    amount_subunits: currencySubunitsSchema,
    checkout_session_id: checkoutSessionIdSchema,
    currency: currencyCodeSchema,
    expires_at: utcTimestampSchema,
    issued_at: utcTimestampSchema,
    merchant_domain: merchantDomainSchema,
    merchant_id: merchantIdSchema,
    offer_id: offerIdSchema,
    quantity: z.number().int().positive().max(100),
    schema_version: merchantContractVersionSchema,
    service_id: stableIdentifierSchema,
    service_version: semanticVersionSchema,
    terms_url: merchantHttpsUrlSchema,
  })
  .strict()
  .superRefine((offer, context) => {
    validateTimestampOrder(offer.issued_at, offer.expires_at, "expires_at", context);
    validateIssuerOrigin(offer.issuer, offer.merchant_domain, context);
    if (!hasExactOrigin(offer.terms_url, offer.merchant_domain)) {
      context.addIssue({
        code: "custom",
        message: "Offer terms URL must use the merchant's exact HTTPS origin",
        path: ["terms_url"],
      });
    }
  })
  .readonly();

export const checkoutLineItemSchema = z
  .object({
    line_total_subunits: currencySubunitsSchema,
    quantity: z.number().int().positive().max(100),
    service_id: stableIdentifierSchema,
    service_version: semanticVersionSchema,
    unit_price_subunits: currencySubunitsSchema,
  })
  .strict()
  .superRefine((lineItem, context) => {
    const calculated = BigInt(lineItem.quantity) * BigInt(lineItem.unit_price_subunits);
    if (
      calculated > BigInt(Number.MAX_SAFE_INTEGER) ||
      calculated !== BigInt(lineItem.line_total_subunits)
    ) {
      context.addIssue({
        code: "custom",
        message: "Line total must equal quantity multiplied by unit price",
        path: ["line_total_subunits"],
      });
    }
  })
  .readonly();

const checkoutLineItemsSchema = z
  .array(checkoutLineItemSchema)
  .min(1)
  .max(20)
  .refine(
    (items) => uniqueStringArray(items.map((item) => item.service_id)),
    "Checkout service IDs must be unique",
  )
  .readonly();

export const checkoutFulfilmentTermsSchema = z
  .object({
    delivery_type: fulfilmentTypeSchema,
    policy_url: merchantHttpsUrlSchema,
    summary: canonicalTextSchema(10, 500),
  })
  .strict()
  .readonly();

export const merchantCheckoutSchema = z
  .object({
    ...merchantSignedClaimsShape,
    checkout_session_id: checkoutSessionIdSchema,
    currency: currencyCodeSchema,
    expires_at: utcTimestampSchema,
    fulfilment_terms: checkoutFulfilmentTermsSchema,
    issued_at: utcTimestampSchema,
    line_items: checkoutLineItemsSchema,
    merchant_domain: merchantDomainSchema,
    merchant_id: merchantIdSchema,
    schema_version: merchantContractVersionSchema,
    total_subunits: currencySubunitsSchema,
  })
  .strict()
  .superRefine((checkout, context) => {
    validateTimestampOrder(checkout.issued_at, checkout.expires_at, "expires_at", context);
    validateIssuerOrigin(checkout.issuer, checkout.merchant_domain, context);

    const calculatedTotal = checkout.line_items.reduce(
      (total, item) => total + BigInt(item.line_total_subunits),
      0n,
    );
    if (
      calculatedTotal > BigInt(Number.MAX_SAFE_INTEGER) ||
      calculatedTotal !== BigInt(checkout.total_subunits)
    ) {
      context.addIssue({
        code: "custom",
        message: "Checkout total must equal the sum of line totals",
        path: ["total_subunits"],
      });
    }

    if (!hasExactOrigin(checkout.fulfilment_terms.policy_url, checkout.merchant_domain)) {
      context.addIssue({
        code: "custom",
        message: "Fulfilment policy URL must use the merchant's exact HTTPS origin",
        path: ["fulfilment_terms", "policy_url"],
      });
    }
  })
  .readonly();

export type MerchantIdentity = z.infer<typeof merchantIdentitySchema>;
export type Es256PublicJwk = z.infer<typeof es256PublicJwkSchema>;
export type MerchantSigningKey = z.infer<typeof merchantSigningKeySchema>;
export type MerchantManifest = z.infer<typeof merchantManifestSchema>;
export type ServiceVersion = z.infer<typeof serviceVersionSchema>;
export type MerchantCatalog = z.infer<typeof merchantCatalogSchema>;
export type MerchantOffer = z.infer<typeof merchantOfferSchema>;
export type CheckoutLineItem = z.infer<typeof checkoutLineItemSchema>;
export type MerchantCheckout = z.infer<typeof merchantCheckoutSchema>;

function validateTimestampOrder(
  issuedAt: string,
  expiresAt: string,
  path: string,
  context: z.RefinementCtx,
): void {
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    context.addIssue({
      code: "custom",
      message: "Expiry must be later than issuance",
      path: [path],
    });
  }
}

function hasExactOrigin(value: string, domain: string): boolean {
  return new URL(value).origin === `https://${domain}`;
}

function validateIssuerOrigin(issuer: string, domain: string, context: z.RefinementCtx): void {
  if (!hasExactOrigin(issuer, domain)) {
    context.addIssue({
      code: "custom",
      message: "Signed issuer must use the merchant's exact HTTPS origin",
      path: ["issuer"],
    });
  }
}

function validateExactOrigin<T extends Record<string, unknown>, K extends keyof T>(
  domain: string,
  fields: readonly K[],
  value: T,
  context: z.RefinementCtx,
): void {
  for (const field of fields) {
    const endpoint = value[field];
    if (typeof endpoint === "string" && !hasExactOrigin(endpoint, domain)) {
      context.addIssue({
        code: "custom",
        message: "Endpoint must use the merchant's exact HTTPS origin",
        path: [field as string],
      });
    }
  }
}
