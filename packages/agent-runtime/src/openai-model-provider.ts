import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage, Output, streamText } from "ai";
import {
  createAiSdkModelProvider,
  type AiSdkModelProviderSdk,
  type AiSdkStructuredRequest,
} from "./ai-sdk-model-provider";
import type { AgentRunInput, ModelProvider } from "./model-provider";

export interface OpenAIModelProviderConfiguration {
  readonly apiKey: string;
  readonly model: string;
}

export type OpenAIModelProviderSdk = AiSdkModelProviderSdk;

export function createOpenAIModelProvider(
  configuration: OpenAIModelProviderConfiguration,
  sdk: OpenAIModelProviderSdk = createOpenAISdk(configuration),
): ModelProvider {
  return createAiSdkModelProvider({ model: configuration.model, provider: "openai" }, sdk);
}

function createOpenAISdk(configuration: OpenAIModelProviderConfiguration): OpenAIModelProviderSdk {
  const provider = createOpenAI({ apiKey: configuration.apiKey, name: "openai" });
  const model = provider(configuration.model);

  return Object.freeze({
    async generateStructured(input: AiSdkStructuredRequest) {
      const result = await generateText({
        ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
        maxRetries: 1,
        messages: modelMessages(input),
        model,
        output: Output.object({
          ...(input.schemaDescription === undefined
            ? {}
            : { description: input.schemaDescription }),
          name: input.schemaName,
          schema: input.schema,
        }),
        providerOptions: openAIProviderOptions(true),
        system: input.system,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      });

      return { finishReason: result.finishReason, output: result.output, usage: result.usage };
    },

    stream(input: AgentRunInput) {
      return streamText({
        ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
        maxRetries: 1,
        messages: modelMessages(input),
        model,
        providerOptions: openAIProviderOptions(false),
        system: input.system,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      }).stream;
    },
  });
}

function openAIProviderOptions(structured: boolean) {
  return {
    openai: {
      reasoningSummary: null,
      store: false,
      ...(structured ? { strictJsonSchema: true } : {}),
    },
  } as const;
}

function modelMessages(input: AgentRunInput): ModelMessage[] {
  return input.messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));
}
