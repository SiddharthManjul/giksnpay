import { describe, expect, it } from "vitest";
import {
  agentRunSchema,
  agentToolCallSchema,
  proposePurchaseInputSchema,
  purchaseProposalSchema,
} from "./agent-runs";

const timestamp = "2026-08-30T12:00:00.000Z";
const hash = "a".repeat(64);

const proposal = purchaseProposalSchema.parse({
  agentRunId: "run_01JGFJH900H8M2APVYVDZ4R6AA",
  agentVersionId: "agv_01JGFJH900H8M2APVYVDZ4R6AA",
  amountSubunits: 29_900,
  catalogHash: hash,
  createdAt: timestamp,
  currency: "INR",
  decisionSummary: "Selected the verified ₹299 market snapshot within the ₹400 budget.",
  id: "prp_01JGFJH900H8M2APVYVDZ4R6AA",
  merchant: { domain: "merchant-demo.example.com", id: "merchant_signalworks" },
  paymentRail: "razorpay:test",
  service: {
    externalId: "market_snapshot",
    id: "service_01JGFJH900H8M2APVYVDZ4R6AA",
    name: "Market Snapshot",
    version: "1.0.0",
  },
  source: "AI",
  status: "PROPOSED",
});

const successfulToolCall = agentToolCallSchema.parse({
  completedAt: timestamp,
  createdAt: timestamp,
  errorCode: null,
  id: "tlc_01JGFJH900H8M2APVYVDZ4R6AA",
  input: { serviceId: "service_01JGFJH900H8M2APVYVDZ4R6AA" },
  inputHash: hash,
  latencyMs: 12,
  output: { data: { service: "canonical" }, trust: "UNTRUSTED_EXTERNAL_DATA" },
  outputHash: "b".repeat(64),
  status: "SUCCEEDED",
  toolVersionId: "get_verified_service.v1",
});

const succeededRun = {
  agentId: "agt_01JGFJH900H8M2APVYVDZ4R6AA",
  agentVersionId: "agv_01JGFJH900H8M2APVYVDZ4R6AA",
  completedAt: timestamp,
  decisionSummary: proposal.decisionSummary,
  events: [
    {
      createdAt: timestamp,
      payload: { source: "AI" },
      payloadHash: hash,
      sequence: 0,
      type: "RUN_STARTED",
    },
    {
      createdAt: timestamp,
      payload: { status: "SUCCEEDED" },
      payloadHash: "b".repeat(64),
      sequence: 1,
      type: "RUN_COMPLETED",
    },
  ],
  failureCode: null,
  id: "run_01JGFJH900H8M2APVYVDZ4R6AA",
  intentSummary: "competitor research under INR 400.00",
  manualFallbackAvailable: false,
  proposal,
  source: "AI",
  startedAt: timestamp,
  status: "SUCCEEDED",
  toolCalls: [successfulToolCall],
  transactionId: null,
  userId: "usr_01JGFJH900H8M2APVYVDZ4R6AA",
} as const;

describe("agent-run commerce contracts", () => {
  it("keeps amount and recipient out of the model-addressable proposal input", () => {
    expect(
      proposePurchaseInputSchema.safeParse({
        decisionSummary: "Choose the canonical verified service for this bounded request.",
        serviceId: "service_01JGFJH900H8M2APVYVDZ4R6AA",
      }).success,
    ).toBe(true);
    expect(
      proposePurchaseInputSchema.safeParse({
        amountSubunits: 1,
        decisionSummary: "Override the canonical amount and recipient from model prose.",
        merchantId: "merchant_attacker",
        serviceId: "service_01JGFJH900H8M2APVYVDZ4R6AA",
      }).success,
    ).toBe(false);
  });

  it("requires explicit coherent terminal tool-call evidence", () => {
    expect(successfulToolCall.status).toBe("SUCCEEDED");
    expect(
      agentToolCallSchema.safeParse({
        ...successfulToolCall,
        completedAt: null,
        latencyMs: null,
        output: null,
        outputHash: null,
      }).success,
    ).toBe(false);
    expect(
      agentToolCallSchema.safeParse({
        ...successfulToolCall,
        errorCode: "TOOL_TIMEOUT",
        output: null,
        outputHash: null,
        status: "TIMED_OUT",
      }).success,
    ).toBe(true);
  });

  it("binds a successful proposal to its run, version, source, decision, and event sequence", () => {
    expect(agentRunSchema.safeParse(succeededRun).success).toBe(true);
    expect(
      agentRunSchema.safeParse({
        ...succeededRun,
        proposal: { ...proposal, amountSubunits: 1, agentRunId: "run_01JGFJH900H8M2APVYVDZ4R6AB" },
      }).success,
    ).toBe(false);
    expect(
      agentRunSchema.safeParse({
        ...succeededRun,
        events: [{ ...succeededRun.events[0], sequence: 1 }],
      }).success,
    ).toBe(false);
  });

  it("makes provider unavailability and manual fallback an explicit coherent state", () => {
    expect(
      agentRunSchema.safeParse({
        ...succeededRun,
        decisionSummary: null,
        failureCode: "MODEL_PROVIDER_UNAVAILABLE",
        manualFallbackAvailable: true,
        proposal: null,
        status: "PROVIDER_UNAVAILABLE",
      }).success,
    ).toBe(true);
    expect(
      agentRunSchema.safeParse({
        ...succeededRun,
        decisionSummary: null,
        failureCode: "MODEL_PROVIDER_UNAVAILABLE",
        manualFallbackAvailable: false,
        proposal: null,
        status: "PROVIDER_UNAVAILABLE",
      }).success,
    ).toBe(false);
  });
});
