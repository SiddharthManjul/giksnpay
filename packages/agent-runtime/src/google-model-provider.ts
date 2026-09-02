import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, type ModelMessage, Output, streamText } from "ai";
import {
  createAiSdkModelProvider,
  type AiSdkModelProviderSdk,
  type AiSdkStructuredRequest,
} from "./ai-sdk-model-provider";
import type { AgentRunInput, ModelProvider } from "./model-provider";

export interface GoogleModelProviderConfiguration {
  readonly apiKey: string;
  readonly model: string;
}

export type GoogleModelProviderSdk = AiSdkModelProviderSdk;

export function createGoogleModelProvider(
  configuration: GoogleModelProviderConfiguration,
  sdk: GoogleModelProviderSdk = createGoogleSdk(configuration),
): ModelProvider {
  return createAiSdkModelProvider({ model: configuration.model, provider: "google" }, sdk);
}

function createGoogleSdk(configuration: GoogleModelProviderConfiguration): GoogleModelProviderSdk {
  const provider = createGoogleGenerativeAI({ apiKey: configuration.apiKey, name: "google" });
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
        providerOptions: googleProviderOptions(true),
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
        providerOptions: googleProviderOptions(false),
        system: input.system,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      }).stream;
    },
  });
}

function googleProviderOptions(structured: boolean) {
  return {
    google: {
      thinkingConfig: { includeThoughts: false, thinkingLevel: "low" },
      ...(structured ? { structuredOutputs: true } : {}),
    },
  } as const;
}

function modelMessages(input: AgentRunInput): ModelMessage[] {
  return input.messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));
}
