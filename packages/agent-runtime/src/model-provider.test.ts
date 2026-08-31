import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createConfiguredModelProvider } from "./configured-model-provider";
import {
  InvalidStructuredModelOutputError,
  ModelProviderConfigurationError,
  ModelProviderInputError,
  ModelProviderUnavailableError,
} from "./model-provider";
import { createOpenAIModelProvider, type OpenAIModelProviderSdk } from "./openai-model-provider";

const requestSchema = z
  .object({
    maximumPriceMinor: z.number().int().nonnegative(),
    serviceId: z.string().min(1),
  })
  .strict();

const generationInput = {
  maxOutputTokens: 1_024,
  messages: [{ content: "Find a research service under INR 400.", role: "user" }] as const,
  schema: requestSchema,
  schemaDescription: "A validated service-selection request",
  schemaName: "service_selection",
  system: "Use only verified MindPay services.",
  temperature: 0.2,
} as const;

const usage: LanguageModelUsage = {
  inputTokenDetails: {
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    noCacheTokens: 8,
  },
  inputTokens: 10,
  outputTokenDetails: {
    reasoningTokens: 0,
    textTokens: 5,
  },
  outputTokens: 5,
  totalTokens: 15,
};

describe("configured model provider", () => {
  it("selects the configured real provider without exposing its implementation", () => {
    const provider = createConfiguredModelProvider({
      AGENT_MODEL_NAME: "gpt-5-mini",
      AGENT_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "mindpay_test_openai_key_00000001",
    });

    expect(provider).toMatchObject({
      generateStructured: expect.any(Function),
      streamAgentRun: expect.any(Function),
    });
  });

  it("fails closed on incomplete, unsupported, or expanded environment input", () => {
    for (const environment of [
      {},
      {
        AGENT_MODEL_NAME: "gpt-5-mini",
        AGENT_MODEL_PROVIDER: "unsupported",
        OPENAI_API_KEY: "mindpay_test_openai_key_00000001",
      },
      {
        AGENT_MODEL_NAME: "gpt-5-mini",
        AGENT_MODEL_PROVIDER: "openai",
        OPENAI_API_KEY: "mindpay_test_openai_key_00000001",
        OPENAI_BASE_URL: "https://unapproved-provider.test",
      },
    ]) {
      expect(() => createConfiguredModelProvider(environment)).toThrow(
        ModelProviderConfigurationError,
      );
    }
  });
});

describe("structured generation", () => {
  it("returns only output validated by the caller-owned schema", async () => {
    const sdk = fakeSdk({
      generateStructured: vi.fn(async () => ({
        finishReason: "stop" as const,
        output: { maximumPriceMinor: 40_000, serviceId: "svc_research" },
        usage,
      })),
    });
    const provider = createOpenAIModelProvider(testConfiguration, sdk);

    await expect(provider.generateStructured(generationInput)).resolves.toEqual({
      attempts: 1,
      finishReason: "stop",
      model: "gpt-5-mini",
      output: { maximumPriceMinor: 40_000, serviceId: "svc_research" },
      provider: "openai",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it("retries one invalid response and accepts a valid repaired response", async () => {
    const generateStructured = vi
      .fn<OpenAIModelProviderSdk["generateStructured"]>()
      .mockResolvedValueOnce({ finishReason: "stop", output: { serviceId: 99 }, usage })
      .mockResolvedValueOnce({
        finishReason: "stop",
        output: { maximumPriceMinor: 29_900, serviceId: "svc_competitor_research" },
        usage,
      });
    const provider = createOpenAIModelProvider(testConfiguration, fakeSdk({ generateStructured }));

    const result = await provider.generateStructured(generationInput);
    expect(result.attempts).toBe(2);
    expect(result.output.serviceId).toBe("svc_competitor_research");
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it("rejects repeated invalid output before commerce orchestration", async () => {
    const generateStructured = vi.fn(async () => ({
      finishReason: "stop" as const,
      output: { maximumPriceMinor: -1, serviceId: "" },
      usage,
    }));
    const provider = createOpenAIModelProvider(testConfiguration, fakeSdk({ generateStructured }));
    const commerceOrchestration = vi.fn();

    try {
      const result = await provider.generateStructured(generationInput);
      commerceOrchestration(result.output);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStructuredModelOutputError);
      expect(String(error)).not.toContain("maximumPriceMinor");
    }

    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(commerceOrchestration).not.toHaveBeenCalled();
  });

  it("maps provider faults to a stable error without leaking the upstream message", async () => {
    const provider = createOpenAIModelProvider(
      testConfiguration,
      fakeSdk({
        generateStructured: vi.fn(async () => {
          throw new Error("upstream response containing private prompt material");
        }),
      }),
    );

    const error = await provider.generateStructured(generationInput).catch((caught) => caught);
    expect(error).toBeInstanceOf(ModelProviderUnavailableError);
    expect(String(error)).not.toContain("private prompt material");
  });
});

describe("agent-run streaming", () => {
  it("exposes only text deltas and terminal metadata, never provider reasoning", async () => {
    const sdk = fakeSdk({ stream: safeProviderStream });
    const provider = createOpenAIModelProvider(testConfiguration, sdk);
    const stream = await provider.streamAgentRun(generationInput);
    const events = [];

    for await (const event of stream) events.push(event);

    expect(stream).toMatchObject({ model: "gpt-5-mini", provider: "openai" });
    expect(events).toEqual([
      { text: "I found ", type: "text-delta" },
      { text: "a verified service.", type: "text-delta" },
      {
        finishReason: "stop",
        type: "finish",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("hidden comparison rationale");
  });

  it("rejects malformed requests before invoking the provider", async () => {
    const stream = vi.fn(safeProviderStream);
    const provider = createOpenAIModelProvider(testConfiguration, fakeSdk({ stream }));

    await expect(
      provider.streamAgentRun({
        maxOutputTokens: 0,
        messages: generationInput.messages,
        system: generationInput.system,
      }),
    ).rejects.toBeInstanceOf(ModelProviderInputError);
    expect(stream).not.toHaveBeenCalled();
  });

  it("fails a stream that ends without canonical finish metadata", async () => {
    const provider = createOpenAIModelProvider(
      testConfiguration,
      fakeSdk({
        stream: async function* () {
          yield { id: "text-1", text: "incomplete", type: "text-delta" };
        },
      }),
    );
    const stream = await provider.streamAgentRun(generationInput);

    await expect(collect(stream)).rejects.toBeInstanceOf(ModelProviderUnavailableError);
  });
});

const testConfiguration = {
  apiKey: "mindpay_test_openai_key_00000001",
  model: "gpt-5-mini",
} as const;

function fakeSdk(overrides: Partial<OpenAIModelProviderSdk>): OpenAIModelProviderSdk {
  return {
    generateStructured: async () => ({
      finishReason: "stop",
      output: { maximumPriceMinor: 40_000, serviceId: "svc_research" },
      usage,
    }),
    stream: safeProviderStream,
    ...overrides,
  };
}

async function* safeProviderStream(): AsyncGenerator<TextStreamPart<ToolSet>> {
  yield {
    id: "reasoning-1",
    text: "hidden comparison rationale",
    type: "reasoning-delta",
  };
  yield { id: "text-1", text: "I found ", type: "text-delta" };
  yield { id: "text-1", text: "a verified service.", type: "text-delta" };
  yield {
    finishReason: "stop",
    rawFinishReason: "completed",
    totalUsage: usage,
    type: "finish",
  };
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}
