import { parseSignalWorksEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { createUlid } from "@mindpay/domain";
import { Hono } from "hono";
import {
  createSignalWorksCheckoutRoutes,
  type SignalWorksCheckoutBindings,
  type SignalWorksCheckoutDependencies,
} from "./checkout";
import { createSignalWorksCatalogPublication } from "./catalog";
import { createSignalWorksManifestPublication } from "./manifest";

export type MerchantBindings = SignalWorksCheckoutBindings;

export interface MerchantRuntimeDependencies extends SignalWorksCheckoutDependencies {
  readonly createCatalogNonce: () => string;
  readonly createManifestNonce: () => string;
  readonly now: () => Date;
}

const defaultDependencies: MerchantRuntimeDependencies = Object.freeze({
  createCheckoutNonce: (now: Date) => `nonce_checkout_${createUlid(now.getTime())}`,
  createCheckoutSessionId: (now: Date) => `checkout_${createUlid(now.getTime())}`,
  createEventId: (now: Date) => `evt_${createUlid(now.getTime())}`,
  createEventNonce: (now: Date) => `nonce_event_${createUlid(now.getTime())}`,
  createCatalogNonce: () => crypto.randomUUID(),
  createManifestNonce: () => crypto.randomUUID(),
  createOrderId: (now: Date) => `ord_${createUlid(now.getTime())}`,
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
      SIGNALWORKS_MACHINE_AUTH_TOKEN: context.env.SIGNALWORKS_MACHINE_AUTH_TOKEN,
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
      SIGNALWORKS_MACHINE_AUTH_TOKEN: context.env.SIGNALWORKS_MACHINE_AUTH_TOKEN,
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
      SIGNALWORKS_MACHINE_AUTH_TOKEN: context.env.SIGNALWORKS_MACHINE_AUTH_TOKEN,
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

  app.route("/", createSignalWorksCheckoutRoutes(dependencies));

  return app;
}

export const merchant = createMerchantApp();

export default merchant;
