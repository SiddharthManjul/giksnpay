import { z } from "zod";

const promptTextSchema = z.string().min(1).max(100_000);

const agentMessageSchema = z
  .object({
    content: promptTextSchema,
    role: z.enum(["assistant", "user"]),
  })
  .strict()
  .readonly();

const generationSettingsSchema = z
  .object({
    maxOutputTokens: z.number().int().min(1).max(32_768).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict();

const schemaNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/u);

export type AgentMessage = z.infer<typeof agentMessageSchema>;

export interface ModelGenerationSettings {
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export interface AgentRunInput extends ModelGenerationSettings {
  readonly abortSignal?: AbortSignal;
  readonly messages: readonly AgentMessage[];
  readonly system: string;
}

export type ModelFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

export interface ModelTokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export type AgentRunEvent =
  | Readonly<{
      text: string;
      type: "text-delta";
    }>
  | Readonly<{
      finishReason: ModelFinishReason;
      type: "finish";
      usage: ModelTokenUsage;
    }>;

export interface AgentRunStream extends AsyncIterable<AgentRunEvent> {
  readonly model: string;
  readonly provider: string;
}

export interface StructuredGenerationInput<TSchema extends z.ZodType> extends AgentRunInput {
  readonly schema: TSchema;
  readonly schemaDescription?: string;
  readonly schemaName: string;
}

export interface StructuredGenerationResult<TSchema extends z.ZodType> {
  readonly attempts: 1 | 2;
  readonly finishReason: ModelFinishReason;
  readonly model: string;
  readonly output: z.output<TSchema>;
  readonly provider: string;
  readonly usage: ModelTokenUsage;
}

export interface ModelProvider {
  generateStructured<TSchema extends z.ZodType>(
    input: StructuredGenerationInput<TSchema>,
  ): Promise<StructuredGenerationResult<TSchema>>;
  streamAgentRun(input: AgentRunInput): Promise<AgentRunStream>;
}

export class ModelProviderConfigurationError extends Error {
  constructor() {
    super("The model provider is not configured correctly");
    this.name = "ModelProviderConfigurationError";
  }
}

export class ModelProviderInputError extends Error {
  constructor() {
    super("The model-provider request is invalid");
    this.name = "ModelProviderInputError";
  }
}

export class InvalidStructuredModelOutputError extends Error {
  constructor() {
    super("The model provider did not return valid structured output");
    this.name = "InvalidStructuredModelOutputError";
  }
}

export class ModelProviderUnavailableError extends Error {
  constructor() {
    super("The model provider is unavailable");
    this.name = "ModelProviderUnavailableError";
  }
}

export class ModelProviderAbortedError extends Error {
  constructor() {
    super("The model-provider request was aborted");
    this.name = "ModelProviderAbortedError";
  }
}

export function assertAgentRunInput(input: AgentRunInput): void {
  const parsed = generationSettingsSchema.safeParse({
    maxOutputTokens: input.maxOutputTokens,
    temperature: input.temperature,
  });

  if (
    !parsed.success ||
    !promptTextSchema.safeParse(input.system).success ||
    !z.array(agentMessageSchema).min(1).max(128).safeParse(input.messages).success ||
    (input.abortSignal !== undefined && !isAbortSignal(input.abortSignal))
  ) {
    throw new ModelProviderInputError();
  }
}

export function assertStructuredGenerationInput<TSchema extends z.ZodType>(
  input: StructuredGenerationInput<TSchema>,
): void {
  assertAgentRunInput(input);
  if (
    !schemaNameSchema.safeParse(input.schemaName).success ||
    (input.schemaDescription !== undefined &&
      !z.string().min(1).max(500).safeParse(input.schemaDescription).success) ||
    typeof input.schema.safeParseAsync !== "function"
  ) {
    throw new ModelProviderInputError();
  }
}

function isAbortSignal(value: AbortSignal): boolean {
  return (
    typeof value.aborted === "boolean" &&
    typeof value.addEventListener === "function" &&
    typeof value.removeEventListener === "function"
  );
}
