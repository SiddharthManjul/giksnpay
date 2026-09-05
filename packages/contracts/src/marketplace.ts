import { currencySubunitsSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import {
  fulfilmentTypeSchema,
  merchantDomainSchema,
  merchantIdSchema,
  paymentRailSchema,
  semanticVersionSchema,
  serviceAvailabilitySchema,
  stableIdentifierSchema,
} from "./merchant";

export const merchantVerificationStatusSchema = z.enum([
  "SUBMITTED",
  "DOMAIN_VERIFIED",
  "KEY_VERIFIED",
  "CATALOG_VALIDATED",
  "PAYMENT_CONFIGURATION_VERIFIED",
  "APPROVED",
  "REVIEW_REQUIRED",
  "QUARANTINED",
]);
export const merchantOperationalStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]);
export const merchantRiskTierSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const merchantVerificationTierSchema = z.enum(["NONE", "TEST_VERIFIED"]);

export const merchantSubmissionRequestSchema = z
  .object({
    domain: merchantDomainSchema,
    legalName: z.string().trim().min(2).max(160),
    merchantId: merchantIdSchema,
    name: z.string().trim().min(2).max(120),
  })
  .strict()
  .readonly();

const marketplaceMerchantSummaryObjectSchema = z
  .object({
    domain: merchantDomainSchema,
    id: merchantIdSchema,
    name: z.string().min(2).max(120),
    riskTier: merchantRiskTierSchema,
    verificationStatus: merchantVerificationStatusSchema,
    verificationTier: merchantVerificationTierSchema,
    verifiedAt: utcTimestampSchema.nullable(),
  })
  .strict();

export const marketplaceMerchantSummarySchema = marketplaceMerchantSummaryObjectSchema.readonly();

export const merchantAdministrationResponseSchema = z
  .object({
    merchant: marketplaceMerchantSummaryObjectSchema.extend({
      operationalStatus: merchantOperationalStatusSchema,
    }),
    verification: z
      .object({
        catalogVersion: semanticVersionSchema.nullable(),
        reason: z.string().min(1).max(128).nullable(),
        result: z.enum(["NOT_RUN", "PASSED", "FAILED", "MATERIAL_CHANGE"]),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const merchantAdministrationListResponseSchema = z
  .object({ merchants: z.array(merchantAdministrationResponseSchema).max(1_000).readonly() })
  .strict()
  .readonly();

export const marketplaceServiceIdSchema = z
  .string()
  .regex(/^service_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u);

export const marketplaceServiceSchema = z
  .object({
    availability: serviceAvailabilitySchema,
    category: stableIdentifierSchema,
    currency: z.literal("INR"),
    description: z.string().min(10).max(2_000),
    externalId: stableIdentifierSchema,
    fulfilment: z
      .object({
        estimatedDeliverySeconds: z.number().int().positive().max(86_400),
        toolId: stableIdentifierSchema,
        type: fulfilmentTypeSchema,
      })
      .strict()
      .readonly(),
    id: marketplaceServiceIdSchema,
    merchant: marketplaceMerchantSummarySchema,
    name: z.string().min(2).max(160),
    paymentRail: paymentRailSchema,
    policyLinks: z
      .object({ privacyUrl: z.string().url(), termsUrl: z.string().url() })
      .strict()
      .readonly(),
    priceSubunits: currencySubunitsSchema,
    protocol: z.enum(["ACP", "MCP"]),
    version: semanticVersionSchema,
  })
  .strict()
  .readonly();

export const marketplaceCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const marketplaceSearchQuerySchema = z
  .object({
    availability: serviceAvailabilitySchema.optional(),
    category: stableIdentifierSchema.optional(),
    cursor: marketplaceCursorSchema.optional(),
    fulfilment: fulfilmentTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    maxPriceSubunits: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    merchantId: merchantIdSchema.optional(),
    minPriceSubunits: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    q: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.minPriceSubunits !== undefined &&
      query.maxPriceSubunits !== undefined &&
      query.minPriceSubunits > query.maxPriceSubunits
    ) {
      context.addIssue({ code: "custom", message: "Minimum price cannot exceed maximum price" });
    }
  })
  .readonly();

export const marketplaceServicesResponseSchema = z
  .object({
    nextCursor: marketplaceCursorSchema.nullable(),
    services: z.array(marketplaceServiceSchema).max(100).readonly(),
  })
  .strict()
  .readonly();

export const marketplaceServiceResponseSchema = z
  .object({ service: marketplaceServiceSchema })
  .strict()
  .readonly();

export const merchantTrustResponseSchema = z
  .object({
    merchant: marketplaceMerchantSummaryObjectSchema.extend({
      catalogVersion: semanticVersionSchema,
      checks: z
        .array(
          z
            .object({ checkedAt: utcTimestampSchema, type: z.string().min(1).max(64) })
            .strict()
            .readonly(),
        )
        .max(32)
        .readonly(),
      paymentRails: z.array(paymentRailSchema).min(1).readonly(),
      protocols: z
        .array(z.enum(["ACP", "MCP"]))
        .min(1)
        .readonly(),
    }),
  })
  .strict()
  .readonly();

export type MerchantVerificationStatus = z.infer<typeof merchantVerificationStatusSchema>;
export type MerchantSubmissionRequest = z.infer<typeof merchantSubmissionRequestSchema>;
export type MerchantAdministrationResponse = z.infer<typeof merchantAdministrationResponseSchema>;
export type MarketplaceService = z.infer<typeof marketplaceServiceSchema>;
export type MarketplaceSearchQuery = z.infer<typeof marketplaceSearchQuerySchema>;
export type MarketplaceServicesResponse = z.infer<typeof marketplaceServicesResponseSchema>;
export type MerchantTrustResponse = z.infer<typeof merchantTrustResponseSchema>;
