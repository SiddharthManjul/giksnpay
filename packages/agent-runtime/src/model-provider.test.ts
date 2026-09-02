import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createConfiguredModelProvider } from "./configured-model-provider";
import { createGoogleModelProvider, type GoogleModelProviderSdk } from "./google-model-provider";
import {
  InvalidStructuredModelOutputError,
  ModelProviderConfigurationError,
  ModelProviderInputError,
  ModelProviderUnavailableError,
} from "./model-provider";
import { createOpenAIModelProvider } from "./openai-model-provider";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("configured model provider", () => {
  it("selects Google Gemini without exposing its implementation", () => {
    const provider = createConfiguredModelProvider({
      AGENT_MODEL_NAME: "gemini-3.8-flash",
      AGENT_MODEL_PROVIDER: "google",
      GOOGLE_GENERATIVE_AI_API_KEY: "mindpay_test_google_key_00000001",
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
        AGENT_MODEL_NAME: "gemini-3.8-flash",
        AGENT_MODEL_PROVIDER: "unsupported",
        GOOGLE_GENERATIVE_AI_API_KEY: "mindpay_test_google_key_00000001",
      },
      {
        AGENT_MODEL_NAME: "gemini-3.8-flash",
        AGENT_MODEL_PROVIDER: "google",
        GOOGLE_BASE_URL: "https://unapproved-provider.test",
        GOOGLE_GENERATIVE_AI_API_KEY: "mindpay_test_google_key_00000001",
      },
    ]) {
      expect(() => createConfiguredModelProvider(environment)).toThrow(
        ModelProviderConfigurationError,
      );
    }
  });

  it("labels Google and optional OpenAI output at the provider-neutral boundary", async () => {
    const google = createGoogleModelProvider(testConfiguration, fakeSdk({}));
    const openAI = createOpenAIModelProvider(
      { apiKey: "mindpay_test_openai_key_00000001", model: "gpt-5-mini" },
      fakeSdk({}),
    );

    await expect(google.generateStructured(generationInput)).resolves.toMatchObject({
      model: "gemini-3.8-flash",
      provider: "google",
    });
    await expect(openAI.streamAgentRun(generationInput)).resolves.toMatchObject({
      model: "gpt-5-mini",
      provider: "openai",
    });
  });
});

describe("Google Gemini boundary", () => {
  it("uses Google's fixed API endpoint and native structured output", async () => {
    const upstreamFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: '{"maximumPriceMinor":40000,"serviceId":"svc_research"}' }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        responseId: "gemini_mindpay_test",
        usageMetadata: {
          candidatesTokenCount: 5,
          promptTokenCount: 10,
          totalTokenCount: 15,
        },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const provider = createGoogleModelProvider(testConfiguration);
    await expect(provider.generateStructured(generationInput)).resolves.toMatchObject({
      attempts: 1,
      model: "gemini-3.8-flash",
      output: { maximumPriceMinor: 40_000, serviceId: "svc_research" },
      provider: "google",
    });

    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [input, init] = upstreamFetch.mock.calls[0] ?? [];
    expect(String(input)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("x-goog-api-key")).toBe("mindpay_test_google_key_00000001");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      generationConfig: {
        maxOutputTokens: 1_024,
        responseMimeType: "application/json",
        thinkingConfig: { includeThoughts: false, thinkingLevel: "low" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("mindpay_test_google_key_00000001");
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
    const provider = createGoogleModelProvider(testConfiguration, sdk);

    await expect(provider.generateStructured(generationInput)).resolves.toEqual({
      attempts: 1,
      finishReason: "stop",
      model: "gemini-3.8-flash",
      output: { maximumPriceMinor: 40_000, serviceId: "svc_research" },
      provider: "google",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it("retries one invalid response and accepts a valid repaired response", async () => {
    const generateStructured = vi
      .fn<GoogleModelProviderSdk["generateStructured"]>()
      .mockResolvedValueOnce({ finishReason: "stop", output: { serviceId: 99 }, usage })
      .mockResolvedValueOnce({
        finishReason: "stop",
        output: { maximumPriceMinor: 29_900, serviceId: "svc_competitor_research" },
        usage,
      });
    const provider = createGoogleModelProvider(testConfiguration, fakeSdk({ generateStructured }));

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
    const provider = createGoogleModelProvider(testConfiguration, fakeSdk({ generateStructured }));
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
    const provider = createGoogleModelProvider(
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
    const provider = createGoogleModelProvider(testConfiguration, sdk);
    const stream = await provider.streamAgentRun(generationInput);
    const events = [];

    for await (const event of stream) events.push(event);

    expect(stream).toMatchObject({ model: "gemini-3.8-flash", provider: "google" });
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
    const provider = createGoogleModelProvider(testConfiguration, fakeSdk({ stream }));

    await expect(
      provider.streamAgentRun({
        maxOutputTokens: 0,
        messages: generationInput.messages,
        system: generationInput.system,
      }),
    ).rejects.toBeInstanceOf(ModelProviderInputError);
    await expect(
      provider.streamAgentRun({
        maxOutputTokens: 2_049,
        messages: generationInput.messages,
        system: generationInput.system,
      }),
    ).rejects.toBeInstanceOf(ModelProviderInputError);
    expect(stream).not.toHaveBeenCalled();
  });

  it("fails a stream that ends without canonical finish metadata", async () => {
    const provider = createGoogleModelProvider(
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
  apiKey: "mindpay_test_google_key_00000001",
  model: "gemini-3.8-flash",
} as const;

function fakeSdk(overrides: Partial<GoogleModelProviderSdk>): GoogleModelProviderSdk {
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
