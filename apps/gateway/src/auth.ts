import { parseGatewayAuthEnvironment } from "@mindpay/config";
import { createMindPayDatabase, schema } from "@mindpay/db";
import { createUlid } from "@mindpay/domain";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";

export const AUTH_BASE_PATH = "/api/auth";

export interface GatewayAuthBindings {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  DB: D1Database;
  ENVIRONMENT: string;
  MARKETPLACE_CACHE?: KVNamespace;
  MINDPAY_API_AUDIENCE?: string;
  PASSKEY_RP_ID: string;
  TRUSTED_ORIGINS: string;
}

const authModelPrefixes = {
  account: "acc",
  rateLimit: "rtl",
  session: "ses",
  user: "usr",
  verification: "ver",
} as const;

const sensitiveAuthResponseKeys = new Set([
  "accessToken",
  "idToken",
  "refreshToken",
  "sessionToken",
  "token",
]);

export function createGatewayAuth(bindings: GatewayAuthBindings) {
  const environment = parseGatewayAuthEnvironment({
    BETTER_AUTH_SECRET: bindings.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: bindings.BETTER_AUTH_URL,
    ENVIRONMENT: bindings.ENVIRONMENT,
    PASSKEY_RP_ID: bindings.PASSKEY_RP_ID,
    TRUSTED_ORIGINS: bindings.TRUSTED_ORIGINS,
  });
  const secureCookies = environment.BETTER_AUTH_URL.startsWith("https://");
  const database = createMindPayDatabase(bindings.DB);

  const options = {
    account: {
      accountLinking: {
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        disableImplicitLinking: true,
        enabled: false,
      },
      encryptOAuthTokens: true,
      storeAccountCookie: false,
      storeStateStrategy: "database",
    },
    advanced: {
      cookiePrefix: "mindpay",
      database: {
        generateId: createAuthDatabaseId,
        joins: false,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: secureCookies,
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
        ipv6Subnet: 64,
      },
      useSecureCookies: secureCookies,
    },
    appName: "MindPay",
    basePath: AUTH_BASE_PATH,
    baseURL: environment.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      camelCase: false,
      debugLogs: false,
      provider: "sqlite",
      schema,
      transaction: false,
      usePlural: false,
    }),
    emailAndPassword: {
      autoSignIn: false,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },
    logger: { disabled: true },
    rateLimit: {
      customRules: {
        "/change-password": { max: 5, window: 60 },
        "/sign-in/email": { max: 5, window: 60 },
        "/sign-out": { max: 30, window: 60 },
        "/sign-up/email": { max: 5, window: 60 },
      },
      enabled: true,
      max: 120,
      storage: "database",
      window: 60,
    },
    secret: environment.BETTER_AUTH_SECRET,
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      freshAge: 60 * 5,
      updateAge: 60 * 60 * 24,
    },
    telemetry: { enabled: false },
    trustedOrigins: [...environment.TRUSTED_ORIGINS],
    verification: {
      storeIdentifier: "hashed",
    },
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export async function handleGatewayAuth(
  request: Request,
  bindings: GatewayAuthBindings,
): Promise<Response> {
  const response = await createGatewayAuth(bindings).handler(request);
  return sanitizeAuthResponse(response);
}

export async function sanitizeAuthResponse(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return response;
  }

  let responseBody: unknown;
  try {
    responseBody = await response.clone().json();
  } catch {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(JSON.stringify(redactAuthResponseValue(responseBody)), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function createAuthDatabaseId({ model }: { readonly model: string }): string {
  const prefix = authModelPrefixes[model as keyof typeof authModelPrefixes];
  if (prefix === undefined) {
    throw new Error(`Better Auth requested an unregistered ID model: ${model}`);
  }
  return `${prefix}_${createUlid()}`;
}

function redactAuthResponseValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAuthResponseValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveAuthResponseKeys.has(key))
      .map(([key, nestedValue]) => [key, redactAuthResponseValue(nestedValue)]),
  );
}
