import { parseSignalWorksEnvironment } from "@mindpay/config";
import { healthResponseSchema } from "@mindpay/contracts";
import { createUlid } from "@mindpay/domain";
import { RazorpayClient } from "@mindpay/razorpay";
import { Hono } from "hono";
import {
  createSignalWorksCheckoutRoutes,
  type SignalWorksCheckoutBindings,
  type SignalWorksCheckoutDependencies,
} from "./checkout";
import { createSignalWorksCatalogPublication } from "./catalog";
import { createSignalWorksManifestPublication } from "./manifest";
import { createSignalWorksMcpRoutes } from "./mcp";
import {
  createSignalWorksPaymentRoutes,
  processSignalWorksRazorpayEvent,
  type SignalWorksPaymentBindings,
  type SignalWorksPaymentDependencies,
} from "./payments";

export interface MerchantBindings extends SignalWorksCheckoutBindings {
  MINDPAY_GATEWAY?: SignalWorksPaymentBindings["MINDPAY_GATEWAY"];
  MINDPAY_API_AUDIENCE?: string;
  PAYMENT_EVENTS?: SignalWorksPaymentBindings["PAYMENT_EVENTS"];
  PAYMENT_EVIDENCE?: SignalWorksPaymentBindings["PAYMENT_EVIDENCE"];
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_MCP_READONLY_ENABLED?: string;
  RAZORPAY_REFUNDS_ENABLED?: string;
  RAZORPAY_WEBHOOK_OLD_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}

export interface MerchantRuntimeDependencies
  extends SignalWorksCheckoutDependencies,
    SignalWorksPaymentDependencies {
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
  createCallbackId: (now: Date) => `pcb_${createUlid(now.getTime())}`,
  createPaymentEventId: (now: Date) => `evt_${createUlid(now.getTime())}`,
  createPaymentOrderId: (now: Date) => `mpo_${createUlid(now.getTime())}`,
  createProviderEventId: (now: Date) => `rpe_${createUlid(now.getTime())}`,
  now: () => new Date(),
  razorpayClient: (bindings: SignalWorksPaymentBindings) =>
    new RazorpayClient({
      keyId: bindings.RAZORPAY_KEY_ID,
      keySecret: bindings.RAZORPAY_KEY_SECRET,
    }),
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
  app.route(
    "/",
    createSignalWorksPaymentRoutes(dependencies) as unknown as Hono<{ Bindings: MerchantBindings }>,
  );
  app.route("/", createSignalWorksMcpRoutes());

  return app;
}

export const merchant = createMerchantApp();

export default {
  fetch: merchant.fetch,
  async queue(
    batch: MessageBatch<import("./payments").SignalWorksPaymentQueueMessage>,
    bindings: SignalWorksPaymentBindings,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processSignalWorksRazorpayEvent(bindings, message.body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
};
