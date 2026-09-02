import { parseModelProviderEnvironment } from "@mindpay/config";
import { type ModelProvider, ModelProviderConfigurationError } from "./model-provider";
import { createGoogleModelProvider } from "./google-model-provider";
import { createOpenAIModelProvider } from "./openai-model-provider";

export function createConfiguredModelProvider(environment: unknown): ModelProvider {
  let configuration: ReturnType<typeof parseModelProviderEnvironment>;
  try {
    configuration = parseModelProviderEnvironment(environment);
  } catch {
    throw new ModelProviderConfigurationError();
  }

  switch (configuration.AGENT_MODEL_PROVIDER) {
    case "google":
      return createGoogleModelProvider({
        apiKey: configuration.GOOGLE_GENERATIVE_AI_API_KEY,
        model: configuration.AGENT_MODEL_NAME,
      });
    case "openai":
      return createOpenAIModelProvider({
        apiKey: configuration.OPENAI_API_KEY,
        model: configuration.AGENT_MODEL_NAME,
      });
  }
}
