import { currencySubunitsSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import { agentToolVersionIdSchema, agentVersionIdSchema } from "./agents";
import { agentIdSchema, transactionIdSchema, userIdSchema } from "./cross-party";
import { marketplaceServiceIdSchema, marketplaceServiceSchema } from "./marketplace";
import {
  es256CanonicalSignatureSchema,
  merchantDomainSchema,
  merchantIdSchema,
  paymentRailSchema,
  semanticVersionSchema,
  stableIdentifierSchema,
} from "./merchant";

const PREFIXED_ULID_SUFFIX = "[0-7][0-9A-HJKMNP-TV-Z]{25}";
const prefixedUlidSchema = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${PREFIXED_ULID_SUFFIX}$`, "u"));

export const agentRunIdSchema = prefixedUlidSchema("run");
export const agentToolCallIdSchema = prefixedUlidSchema("tlc");
export const purchaseProposalIdSchema = prefixedUlidSchema("prp");

export const agentRunSourceSchema = z.enum(["AI", "MANUAL"]);
export const agentRunStatusSchema = z.enum([
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "PROVIDER_UNAVAILABLE",
]);
export const agentToolCallStatusSchema = z.enum(["RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"]);
export const agentRunEventTypeSchema = z.enum([
  "RUN_STARTED",
  "INTENT_PARSED",
  "MODEL_TEXT_DELTA",
  "TOOL_CALL_STARTED",
  "TOOL_CALL_COMPLETED",
  "TOOL_CALL_FAILED",
  "PROPOSAL_CREATED",
  "FALLBACK_AVAILABLE",
  "RUN_COMPLETED",
  "RUN_FAILED",
]);

export const procurementPreferenceSchema = z.enum([
  "LOWEST_PRICE",
  "FASTEST_DELIVERY",
  "BEST_VALUE",
]);

export const procurementIntentSchema = z
  .object({
    category: stableIdentifierSchema,
    currency: z.literal("INR"),
    maximumPriceSubunits: currencySubunitsSchema,
    preference: procurementPreferenceSchema,
    query: z.string().trim().min(2).max(120),
  })
  .strict()
  .readonly();

export const searchVerifiedServicesInputSchema = procurementIntentSchema;
export const searchVerifiedServicesOutputSchema = z
  .object({ services: z.array(marketplaceServiceSchema).max(100).readonly() })
  .strict()
  .readonly();

export const serviceLookupInputSchema = z
  .object({ serviceId: marketplaceServiceIdSchema })
  .strict()
  .readonly();

export const getVerifiedServiceOutputSchema = z
  .object({ service: marketplaceServiceSchema })
  .strict()
  .readonly();

export const verifiedServiceOfferSchema = z
  .object({
    amountSubunits: currencySubunitsSchema,
    catalogExpiresAt: utcTimestampSchema,
    catalogHash: z.string().regex(/^[0-9a-f]{64}$/u),
    catalogSignature: es256CanonicalSignatureSchema,
    catalogSignatureVerified: z.literal(true),
    currency: z.literal("INR"),
    merchantDomain: merchantDomainSchema,
    merchantId: merchantIdSchema,
    paymentRail: paymentRailSchema,
    serviceExternalId: stableIdentifierSchema,
    serviceId: marketplaceServiceIdSchema,
    serviceVersion: semanticVersionSchema,
    termsUrl: z.string().url(),
    verifiedAt: utcTimestampSchema,
  })
  .strict()
  .readonly();

export const requestSignedOfferOutputSchema = z
  .object({ offer: verifiedServiceOfferSchema })
  .strict()
  .readonly();

export const proposePurchaseInputSchema = z
  .object({
    decisionSummary: z.string().trim().min(10).max(500),
    serviceId: marketplaceServiceIdSchema,
  })
  .strict()
  .readonly();

export const purchaseProposalSchema = z
  .object({
    agentRunId: agentRunIdSchema,
    agentVersionId: agentVersionIdSchema,
    amountSubunits: currencySubunitsSchema,
    catalogHash: z.string().regex(/^[0-9a-f]{64}$/u),
    createdAt: utcTimestampSchema,
    currency: z.literal("INR"),
    decisionSummary: z.string().min(10).max(500),
    id: purchaseProposalIdSchema,
    merchant: z.object({ domain: merchantDomainSchema, id: merchantIdSchema }).strict().readonly(),
    paymentRail: paymentRailSchema,
    service: z
      .object({
        externalId: stableIdentifierSchema,
        id: marketplaceServiceIdSchema,
        name: z.string().min(2).max(160),
        version: semanticVersionSchema,
      })
      .strict()
      .readonly(),
    source: agentRunSourceSchema,
    status: z.literal("PROPOSED"),
  })
  .strict()
  .readonly();

export const proposePurchaseOutputSchema = z
  .object({ proposal: purchaseProposalSchema })
  .strict()
  .readonly();

export const transactionLookupInputSchema = z
  .object({ transactionId: transactionIdSchema })
  .strict()
  .readonly();

export const untrustedToolOutputSchema = z
  .object({
    data: z.unknown(),
    trust: z.literal("UNTRUSTED_EXTERNAL_DATA"),
  })
  .strict()
  .readonly();

export const agentToolCallSchema = z
  .object({
    completedAt: utcTimestampSchema.nullable(),
    createdAt: utcTimestampSchema,
    errorCode: z.string().min(1).max(64).nullable(),
    id: agentToolCallIdSchema,
    input: z.record(z.string(), z.unknown()).readonly(),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/u),
    latencyMs: z.number().int().nonnegative().nullable(),
    output: untrustedToolOutputSchema.nullable(),
    outputHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    status: agentToolCallStatusSchema,
    toolVersionId: agentToolVersionIdSchema,
  })
  .strict()
  .superRefine((call, context) => {
    const runningIsValid =
      call.status === "RUNNING" &&
      call.completedAt === null &&
      call.errorCode === null &&
      call.latencyMs === null &&
      call.output === null &&
      call.outputHash === null;
    const successIsValid =
      call.status === "SUCCEEDED" &&
      call.completedAt !== null &&
      call.errorCode === null &&
      call.latencyMs !== null &&
      call.output !== null &&
      call.outputHash !== null;
    const failureIsValid =
      (call.status === "FAILED" || call.status === "TIMED_OUT") &&
      call.completedAt !== null &&
      call.errorCode !== null &&
      call.latencyMs !== null &&
      call.output === null &&
      call.outputHash === null;
    if (!runningIsValid && !successIsValid && !failureIsValid) {
      context.addIssue({ code: "custom", message: "Tool-call terminal evidence is inconsistent" });
    }
    if (call.completedAt !== null && call.completedAt < call.createdAt) {
      context.addIssue({ code: "custom", message: "Tool call cannot complete before creation" });
    }
  })
  .readonly();

export const agentRunEventSchema = z
  .object({
    createdAt: utcTimestampSchema,
    payload: z.record(z.string(), z.unknown()).readonly(),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/u),
    sequence: z.number().int().nonnegative(),
    type: agentRunEventTypeSchema,
  })
  .strict()
  .readonly();

export const agentRunSchema = z
  .object({
    agentId: agentIdSchema,
    agentVersionId: agentVersionIdSchema,
    completedAt: utcTimestampSchema.nullable(),
    decisionSummary: z.string().min(10).max(500).nullable(),
    events: z.array(agentRunEventSchema).max(2_000).readonly(),
    failureCode: z.string().min(1).max(64).nullable(),
    id: agentRunIdSchema,
    intentSummary: z.string().min(2).max(500).nullable(),
    manualFallbackAvailable: z.boolean(),
    proposal: purchaseProposalSchema.nullable(),
    source: agentRunSourceSchema,
    startedAt: utcTimestampSchema,
    status: agentRunStatusSchema,
    toolCalls: z.array(agentToolCallSchema).max(256).readonly(),
    transactionId: transactionIdSchema.nullable(),
    userId: userIdSchema,
  })
  .strict()
  .superRefine((run, context) => {
    const runningIsValid =
      run.status === "RUNNING" &&
      run.completedAt === null &&
      run.failureCode === null &&
      run.proposal === null &&
      !run.manualFallbackAvailable;
    const succeededIsValid =
      run.status === "SUCCEEDED" &&
      run.completedAt !== null &&
      run.decisionSummary !== null &&
      run.failureCode === null &&
      run.proposal !== null &&
      !run.manualFallbackAvailable;
    const failedIsValid =
      run.status === "FAILED" &&
      run.completedAt !== null &&
      run.failureCode !== null &&
      run.proposal === null &&
      !run.manualFallbackAvailable;
    const providerUnavailableIsValid =
      run.status === "PROVIDER_UNAVAILABLE" &&
      run.completedAt !== null &&
      run.failureCode !== null &&
      run.proposal === null &&
      run.manualFallbackAvailable;
    if (!runningIsValid && !succeededIsValid && !failedIsValid && !providerUnavailableIsValid) {
      context.addIssue({ code: "custom", message: "Agent-run terminal evidence is inconsistent" });
    }
    if (run.completedAt !== null && run.completedAt < run.startedAt) {
      context.addIssue({ code: "custom", message: "Agent run cannot complete before it starts" });
    }
    if (
      run.proposal !== null &&
      (run.proposal.agentRunId !== run.id ||
        run.proposal.agentVersionId !== run.agentVersionId ||
        run.proposal.source !== run.source ||
        run.proposal.decisionSummary !== run.decisionSummary)
    ) {
      context.addIssue({ code: "custom", message: "Proposal must bind to its canonical run" });
    }
    if (run.events.some((event, index) => event.sequence !== index)) {
      context.addIssue({
        code: "custom",
        message: "Run events must be a contiguous zero-based sequence",
      });
    }
  })
  .readonly();

export const agentRunResponseSchema = z.object({ run: agentRunSchema }).strict().readonly();

export const createAgentRunRequestSchema = z
  .object({
    agentId: agentIdSchema,
    intent: z.string().trim().min(5).max(1_000),
  })
  .strict()
  .readonly();

export const createManualAgentRunRequestSchema = z
  .object({
    agentId: agentIdSchema,
    decisionSummary: z.string().trim().min(10).max(500).optional(),
    serviceId: marketplaceServiceIdSchema,
  })
  .strict()
  .readonly();

export type ProcurementIntent = z.infer<typeof procurementIntentSchema>;
export type PurchaseProposal = z.infer<typeof purchaseProposalSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentRunEvent = z.infer<typeof agentRunEventSchema>;
export type AgentToolCall = z.infer<typeof agentToolCallSchema>;
