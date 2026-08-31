import { utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import { agentIdSchema, organizationIdSchema, userIdSchema } from "./cross-party";
import { es256PublicJwkSchema, semanticVersionSchema, stableIdentifierSchema } from "./merchant";

const PREFIXED_ULID_SUFFIX = "[0-7][0-9A-HJKMNP-TV-Z]{25}";
const prefixedUlidSchema = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${PREFIXED_ULID_SUFFIX}$`, "u"));

export const agentVersionIdSchema = prefixedUlidSchema("agv");
export const agentKeyIdSchema = prefixedUlidSchema("aky");
export const agentStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const agentVerificationStatusSchema = z.enum(["NOT_RUN", "PASSED", "FAILED"]);
export const agentModelNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
export const agentSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u);

export const agentConfigurationSchema = z
  .object({
    maxOutputTokens: z.number().int().min(128).max(32_768),
    temperature: z.number().min(0).max(2),
  })
  .strict()
  .readonly();

export const approvedAgentToolVersionIds = Object.freeze([
  "search_verified_services.v1",
  "get_verified_service.v1",
  "request_signed_offer.v1",
  "propose_purchase.v1",
  "get_transaction_status.v1",
  "get_evidence_bundle.v1",
] as const);

export const agentToolVersionIdSchema = z.enum(approvedAgentToolVersionIds);

export const procurementToolScopeSchema = z
  .object({
    allowedCategories: z.array(stableIdentifierSchema).min(1).max(32).readonly(),
    maximumPriceSubunits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .readonly();

const procurementToolBinding = <
  TToolVersionId extends (typeof approvedAgentToolVersionIds)[number],
>(
  toolVersionId: TToolVersionId,
) =>
  z
    .object({
      scope: procurementToolScopeSchema,
      toolVersionId: z.literal(toolVersionId),
    })
    .strict()
    .readonly();

const evidenceToolBinding = <TToolVersionId extends (typeof approvedAgentToolVersionIds)[number]>(
  toolVersionId: TToolVersionId,
) =>
  z
    .object({
      scope: z.object({}).strict().readonly(),
      toolVersionId: z.literal(toolVersionId),
    })
    .strict()
    .readonly();

export const agentToolBindingSchema = z.union([
  procurementToolBinding("search_verified_services.v1"),
  procurementToolBinding("get_verified_service.v1"),
  procurementToolBinding("request_signed_offer.v1"),
  procurementToolBinding("propose_purchase.v1"),
  evidenceToolBinding("get_transaction_status.v1"),
  evidenceToolBinding("get_evidence_bundle.v1"),
]);

export const agentToolBindingsSchema = z
  .array(agentToolBindingSchema)
  .max(approvedAgentToolVersionIds.length)
  .refine(
    (bindings) =>
      new Set(bindings.map((binding) => binding.toolVersionId)).size === bindings.length,
    "Tool bindings must be unique",
  )
  .readonly();

export const createAgentRequestSchema = z
  .object({
    description: z.string().trim().min(10).max(2_000),
    name: z.string().trim().min(2).max(120),
    slug: agentSlugSchema,
  })
  .strict()
  .readonly();

export const createAgentVersionRequestSchema = z
  .object({
    configuration: agentConfigurationSchema,
    modelName: agentModelNameSchema,
    modelProvider: stableIdentifierSchema,
    specialization: z.string().trim().min(2).max(160),
    systemPolicy: z.string().trim().min(20).max(20_000),
    toolBindings: agentToolBindingsSchema.default([]),
    version: semanticVersionSchema,
  })
  .strict()
  .readonly();

export const publishAgentVersionRequestSchema = z
  .object({ versionId: agentVersionIdSchema })
  .strict()
  .readonly();

export const agentPublicKeySchema = z
  .object({
    id: agentKeyIdSchema,
    kid: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
    publicJwk: es256PublicJwkSchema,
    revokedAt: utcTimestampSchema.nullable(),
    validFrom: utcTimestampSchema,
  })
  .strict()
  .readonly();

export const agentVersionSchema = z
  .object({
    agentId: agentIdSchema,
    configuration: agentConfigurationSchema,
    createdAt: utcTimestampSchema,
    id: agentVersionIdSchema,
    modelName: agentModelNameSchema,
    modelProvider: stableIdentifierSchema,
    publishedAt: utcTimestampSchema.nullable(),
    specialization: z.string().min(2).max(160),
    systemPolicy: z.string().min(20).max(20_000),
    systemPolicyHash: z.string().regex(/^[0-9a-f]{64}$/u),
    toolBindings: agentToolBindingsSchema,
    verificationStatus: agentVerificationStatusSchema,
    version: semanticVersionSchema,
  })
  .strict()
  .readonly();

export const agentSchema = z
  .object({
    createdAt: utcTimestampSchema,
    createdBy: userIdSchema,
    currentVersionId: agentVersionIdSchema.nullable(),
    description: z.string().min(10).max(2_000),
    id: agentIdSchema,
    key: agentPublicKeySchema,
    name: z.string().min(2).max(120),
    organizationId: organizationIdSchema,
    slug: agentSlugSchema,
    status: agentStatusSchema,
    updatedAt: utcTimestampSchema,
    versions: z.array(agentVersionSchema).max(1_000).readonly(),
  })
  .strict()
  .readonly();

export const agentResponseSchema = z.object({ agent: agentSchema }).strict().readonly();
export const agentsResponseSchema = z
  .object({ agents: z.array(agentSchema).max(1_000).readonly() })
  .strict()
  .readonly();

export type Agent = z.infer<typeof agentSchema>;
export type AgentVersion = z.infer<typeof agentVersionSchema>;
export type AgentToolBinding = z.infer<typeof agentToolBindingSchema>;
export type AgentToolVersionId = z.infer<typeof agentToolVersionIdSchema>;
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;
export type CreateAgentVersionRequest = z.infer<typeof createAgentVersionRequestSchema>;
