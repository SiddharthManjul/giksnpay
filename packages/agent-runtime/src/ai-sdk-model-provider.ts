import {
  type FinishReason,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import type { z } from "zod";
import {
  type AgentRunInput,
  type AgentRunStream,
  assertAgentRunInput,
  assertStructuredGenerationInput,
  InvalidStructuredModelOutputError,
  type ModelProvider,
  ModelProviderAbortedError,
  ModelProviderUnavailableError,
  type ModelTokenUsage,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
} from "./model-provider";

export interface AiSdkModelProviderConfiguration {
  readonly model: string;
  readonly provider: string;
}

export interface AiSdkStructuredRequest extends AgentRunInput {
  readonly schema: z.ZodType;
  readonly schemaDescription?: string;
  readonly schemaName: string;
}

export interface AiSdkStructuredResponse {
  readonly finishReason: FinishReason;
  readonly output: unknown;
  readonly usage: LanguageModelUsage;
}

export interface AiSdkModelProviderSdk {
  generateStructured(input: AiSdkStructuredRequest): Promise<AiSdkStructuredResponse>;
  stream(input: AgentRunInput): AsyncIterable<TextStreamPart<ToolSet>>;
}

export function createAiSdkModelProvider(
  configuration: AiSdkModelProviderConfiguration,
  sdk: AiSdkModelProviderSdk,
): ModelProvider {
  return Object.freeze({
    async generateStructured<TSchema extends z.ZodType>(
      input: StructuredGenerationInput<TSchema>,
    ): Promise<StructuredGenerationResult<TSchema>> {
      assertStructuredGenerationInput(input);

      for (const attempt of [1, 2] as const) {
        try {
          const generated = await sdk.generateStructured(input);
          const validated = await input.schema.safeParseAsync(generated.output);
          if (!validated.success) {
            if (attempt === 1) continue;
            throw new InvalidStructuredModelOutputError();
          }

          return Object.freeze({
            attempts: attempt,
            finishReason: generated.finishReason,
            model: configuration.model,
            output: validated.data,
            provider: configuration.provider,
            usage: modelTokenUsage(generated.usage),
          });
        } catch (error) {
          if (error instanceof InvalidStructuredModelOutputError) throw error;
          if (isInvalidStructuredOutput(error)) {
            if (attempt === 1) continue;
            throw new InvalidStructuredModelOutputError();
          }
          throw providerError(error, input.abortSignal);
        }
      }

      throw new InvalidStructuredModelOutputError();
    },

    async streamAgentRun(input: AgentRunInput): Promise<AgentRunStream> {
      assertAgentRunInput(input);

      let providerStream: AsyncIterable<TextStreamPart<ToolSet>>;
      try {
        providerStream = sdk.stream(input);
      } catch (error) {
        throw providerError(error, input.abortSignal);
      }

      const events = streamSafeEvents(providerStream, input.abortSignal);
      return Object.freeze({
        model: configuration.model,
        provider: configuration.provider,
        [Symbol.asyncIterator]: () => events[Symbol.asyncIterator](),
      });
    },
  });
}

async function* streamSafeEvents(
  providerStream: AsyncIterable<TextStreamPart<ToolSet>>,
  abortSignal: AbortSignal | undefined,
) {
  try {
    for await (const part of providerStream) {
      if (part.type === "text-delta" && part.text.length > 0) {
        yield Object.freeze({ text: part.text, type: "text-delta" as const });
      } else if (part.type === "finish") {
        yield Object.freeze({
          finishReason: part.finishReason,
          type: "finish" as const,
          usage: modelTokenUsage(part.totalUsage),
        });
        return;
      } else if (part.type === "error") {
        throw providerError(part.error, abortSignal);
      } else if (part.type === "abort") {
        throw new ModelProviderAbortedError();
      }
    }
  } catch (error) {
    if (
      error instanceof ModelProviderUnavailableError ||
      error instanceof ModelProviderAbortedError
    ) {
      throw error;
    }
    throw providerError(error, abortSignal);
  }

  throw new ModelProviderUnavailableError();
}

function isInvalidStructuredOutput(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

function providerError(error: unknown, abortSignal: AbortSignal | undefined): Error {
  if (
    abortSignal?.aborted === true ||
    (error instanceof DOMException && error.name === "AbortError")
  ) {
    return new ModelProviderAbortedError();
  }
  return new ModelProviderUnavailableError();
}

function modelTokenUsage(usage: LanguageModelUsage): ModelTokenUsage {
  return Object.freeze({
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
  });
}
