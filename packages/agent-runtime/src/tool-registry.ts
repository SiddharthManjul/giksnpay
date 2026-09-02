import {
  type AgentToolBinding,
  type AgentToolVersionId,
  agentToolBindingsSchema,
  getVerifiedServiceOutputSchema,
  proposePurchaseInputSchema,
  proposePurchaseOutputSchema,
  requestSignedOfferOutputSchema,
  searchVerifiedServicesInputSchema,
  searchVerifiedServicesOutputSchema,
  serviceLookupInputSchema,
  transactionLookupInputSchema,
  untrustedToolOutputSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { z } from "zod";

const genericReadOutputSchema = z.record(z.string(), z.unknown()).readonly();

const approvedToolDefinitions = Object.freeze({
  "get_evidence_bundle.v1": {
    input: transactionLookupInputSchema,
    output: genericReadOutputSchema,
  },
  "get_transaction_status.v1": {
    input: transactionLookupInputSchema,
    output: genericReadOutputSchema,
  },
  "get_verified_service.v1": {
    input: serviceLookupInputSchema,
    output: getVerifiedServiceOutputSchema,
  },
  "propose_purchase.v1": {
    input: proposePurchaseInputSchema,
    output: proposePurchaseOutputSchema,
  },
  "request_signed_offer.v1": {
    input: serviceLookupInputSchema,
    output: requestSignedOfferOutputSchema,
  },
  "search_verified_services.v1": {
    input: searchVerifiedServicesInputSchema,
    output: searchVerifiedServicesOutputSchema,
  },
} satisfies Readonly<Record<AgentToolVersionId, ApprovedToolDefinition>>);

interface ApprovedToolDefinition {
  readonly input: z.ZodType;
  readonly output: z.ZodType;
}

export interface ToolExecutionSuccess {
  readonly input: Readonly<Record<string, unknown>>;
  readonly inputHash: string;
  readonly latencyMs: number;
  readonly output: z.infer<typeof untrustedToolOutputSchema>;
  readonly outputHash: string;
  readonly status: "SUCCEEDED";
}

export interface ToolExecutionFailure {
  readonly errorCode:
    | "TOOL_EXECUTION_FAILED"
    | "TOOL_INPUT_INVALID"
    | "TOOL_NOT_BOUND"
    | "TOOL_OUTPUT_INVALID";
  readonly input: Readonly<Record<string, unknown>>;
  readonly inputHash: string;
  readonly latencyMs: number;
  readonly output: null;
  readonly outputHash: null;
  readonly status: "FAILED";
}

export interface ToolExecutionTimeout {
  readonly errorCode: "TOOL_TIMEOUT";
  readonly input: Readonly<Record<string, unknown>>;
  readonly inputHash: string;
  readonly latencyMs: number;
  readonly output: null;
  readonly outputHash: null;
  readonly status: "TIMED_OUT";
}

export type ToolExecutionResult =
  | ToolExecutionSuccess
  | ToolExecutionFailure
  | ToolExecutionTimeout;

export interface BoundToolRegistry {
  readonly toolVersionIds: readonly AgentToolVersionId[];
  binding(toolVersionId: AgentToolVersionId): AgentToolBinding | null;
  execute(
    toolVersionId: string,
    input: unknown,
    implementation: (
      input: Readonly<Record<string, unknown>>,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ): Promise<ToolExecutionResult>;
}

export interface BoundToolRegistryOptions {
  readonly nowEpochMs?: () => number;
  readonly timeoutMs?: number;
}

export function createBoundToolRegistry(
  untrustedBindings: unknown,
  options: BoundToolRegistryOptions = {},
): BoundToolRegistry {
  const bindings = agentToolBindingsSchema.parse(untrustedBindings);
  const byId = new Map(bindings.map((binding) => [binding.toolVersionId, binding]));
  const toolVersionIds = Object.freeze(bindings.map((binding) => binding.toolVersionId));
  const nowEpochMs = options.nowEpochMs ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("Tool timeout configuration is invalid");
  }

  return Object.freeze({
    binding(toolVersionId: AgentToolVersionId): AgentToolBinding | null {
      return byId.get(toolVersionId) ?? null;
    },

    async execute(
      toolVersionId: string,
      input: unknown,
      implementation: (
        input: Readonly<Record<string, unknown>>,
        signal: AbortSignal,
      ) => Promise<unknown>,
    ): Promise<ToolExecutionResult> {
      const startedAt = nowEpochMs();
      const definition = approvedToolDefinitions[toolVersionId as AgentToolVersionId];
      const inputRecord = toRecord(input);
      const inputHash = await sha256CanonicalJsonHex(inputRecord);
      if (definition === undefined || !byId.has(toolVersionId as AgentToolVersionId)) {
        return failure("TOOL_NOT_BOUND", inputRecord, inputHash, elapsed(startedAt, nowEpochMs()));
      }

      const parsedInput = definition.input.safeParse(input);
      if (!parsedInput.success) {
        return failure(
          "TOOL_INPUT_INVALID",
          inputRecord,
          inputHash,
          elapsed(startedAt, nowEpochMs()),
        );
      }

      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          implementation(toRecord(parsedInput.data), controller.signal).then((output) => ({
            output,
            type: "output" as const,
          })),
          new Promise<{ readonly type: "timeout" }>((resolve) => {
            timeoutHandle = setTimeout(() => {
              controller.abort();
              resolve({ type: "timeout" });
            }, timeoutMs);
          }),
        ]);
        const latencyMs = elapsed(startedAt, nowEpochMs());
        if (outcome.type === "timeout") {
          return Object.freeze({
            errorCode: "TOOL_TIMEOUT",
            input: inputRecord,
            inputHash,
            latencyMs,
            output: null,
            outputHash: null,
            status: "TIMED_OUT",
          });
        }

        const parsedOutput = definition.output.safeParse(outcome.output);
        if (!parsedOutput.success) {
          return failure("TOOL_OUTPUT_INVALID", inputRecord, inputHash, latencyMs);
        }
        const output = untrustedToolOutputSchema.parse({
          data: parsedOutput.data,
          trust: "UNTRUSTED_EXTERNAL_DATA",
        });
        return Object.freeze({
          input: inputRecord,
          inputHash,
          latencyMs,
          output,
          outputHash: await sha256CanonicalJsonHex(output),
          status: "SUCCEEDED",
        });
      } catch {
        return failure(
          "TOOL_EXECUTION_FAILED",
          inputRecord,
          inputHash,
          elapsed(startedAt, nowEpochMs()),
        );
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
    },

    toolVersionIds,
  });
}

export function bindingAllowsService(
  binding: AgentToolBinding,
  service: { readonly category: string; readonly priceSubunits: number },
): boolean {
  if (
    binding.toolVersionId === "get_evidence_bundle.v1" ||
    binding.toolVersionId === "get_transaction_status.v1"
  ) {
    return true;
  }
  return (
    binding.scope.allowedCategories.includes(service.category) &&
    service.priceSubunits <= binding.scope.maximumPriceSubunits
  );
}

function failure(
  errorCode: ToolExecutionFailure["errorCode"],
  input: Readonly<Record<string, unknown>>,
  inputHash: string,
  latencyMs: number,
): ToolExecutionFailure {
  return Object.freeze({
    errorCode,
    input,
    inputHash,
    latencyMs,
    output: null,
    outputHash: null,
    status: "FAILED",
  });
}

function elapsed(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function toRecord(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : Object.freeze({});
}
