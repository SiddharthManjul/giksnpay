import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum(["development", "test", "preview", "production"]);

export const workerEnvironmentSchema = z
  .object({
    ENVIRONMENT: runtimeEnvironmentSchema,
  })
  .strict();

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function parseWorkerEnvironment(input: unknown): WorkerEnvironment {
  return workerEnvironmentSchema.parse(input);
}
