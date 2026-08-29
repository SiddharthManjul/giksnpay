import { parseSignalWorksEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { Hono } from "hono";
import { createSignalWorksCatalogPublication } from "./catalog";
import { createSignalWorksManifestPublication } from "./manifest";

export type MerchantBindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  SIGNALWORKS_KEY_ENCRYPTION_KEY: string;
};

export interface MerchantRuntimeDependencies {
  readonly createCatalogNonce: () => string;
  readonly createManifestNonce: () => string;
  readonly now: () => Date;
}

const defaultDependencies: MerchantRuntimeDependencies = Object.freeze({
  createCatalogNonce: () => crypto.randomUUID(),
  createManifestNonce: () => crypto.randomUUID(),
  now: () => new Date(),
});

export function createMerchantApp(
  overrides: Partial<MerchantRuntimeDependencies> = {},
): Hono<{ Bindings: MerchantBindings }> {
  const dependencies: MerchantRuntimeDependencies = { ...defaultDependencies, ...overrides };
  const app = new Hono<{ Bindings: MerchantBindings }>();

  app.get("/health", (context) => {
    parseSignalWorksEnvironment({
      ENVIRONMENT: context.env.ENVIRONMENT,
      SIGNALWORKS_KEY_ENCRYPTION_KEY: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
    });

    const response = healthResponseSchema.parse({
      service: "signalworks",
      status: "ok",
    });

    return context.json(response);
  });

  app.get("/.well-known/mindpay.json", async (context) => {
    const environment = parseSignalWorksEnvironment({
      ENVIRONMENT: context.env.ENVIRONMENT,
      SIGNALWORKS_KEY_ENCRYPTION_KEY: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
    });
    const publication = await createSignalWorksManifestPublication({
      database: context.env.DB,
      keyEncryptionSecret: environment.SIGNALWORKS_KEY_ENCRYPTION_KEY,
      nonce: dependencies.createManifestNonce(),
      now: dependencies.now(),
    });

    context.header("Cache-Control", "no-store");
    context.header("X-Content-Type-Options", "nosniff");
    return context.json(publication);
  });

  app.get("/catalog/feed.json", async (context) => {
    const environment = parseSignalWorksEnvironment({
      ENVIRONMENT: context.env.ENVIRONMENT,
      SIGNALWORKS_KEY_ENCRYPTION_KEY: context.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
    });
    const publication = await createSignalWorksCatalogPublication({
      database: context.env.DB,
      keyEncryptionSecret: environment.SIGNALWORKS_KEY_ENCRYPTION_KEY,
      nonce: dependencies.createCatalogNonce(),
      now: dependencies.now(),
    });

    context.header("Cache-Control", "no-store");
    context.header("X-Content-Type-Options", "nosniff");
    return context.json(publication);
  });

  return app;
}

export const merchant = createMerchantApp();

export default merchant;
