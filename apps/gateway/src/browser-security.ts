import { parseGatewayAuthEnvironment } from "@mindpay/config";
import type { Context, MiddlewareHandler } from "hono";
import { apiError, type GatewayEnvironment } from "./authorization";

const allowedMethods = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST"]);
const allowedRequestHeaders = new Set([
  "content-type",
  "idempotency-key",
  "x-mindpay-organization-id",
]);
const unsafeMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

const corsAllowHeaders = [...allowedRequestHeaders].join(", ");
const corsAllowMethods = [...allowedMethods].join(", ");

export const browserSecurityBoundary: MiddlewareHandler<GatewayEnvironment> = async (
  context,
  next,
) => {
  const request = context.req.raw;
  const environment = parseGatewayAuthEnvironment({
    BETTER_AUTH_SECRET: context.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: context.env.BETTER_AUTH_URL,
    ENVIRONMENT: context.env.ENVIRONMENT,
    PASSKEY_RP_ID: context.env.PASSKEY_RP_ID,
    TRUSTED_ORIGINS: context.env.TRUSTED_ORIGINS,
  });
  const origin = request.headers.get("origin");
  const trustedOrigin = origin !== null && environment.TRUSTED_ORIGINS.includes(origin);
  const browserSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  const hasCredentialCookie = request.headers.has("cookie");

  if (
    (origin !== null && !trustedOrigin) ||
    (browserSite === "cross-site" && (unsafeMethods.has(request.method) || hasCredentialCookie)) ||
    (unsafeMethods.has(request.method) && hasCredentialCookie && !trustedOrigin)
  ) {
    return crossOriginDenied(context);
  }

  if (request.method === "OPTIONS") {
    if (!trustedOrigin || !validPreflight(request)) {
      return crossOriginDenied(context);
    }

    applyCorsHeaders(context, origin);
    return context.body(null, 204);
  }

  await next();

  if (origin !== null && trustedOrigin) {
    applyCorsHeaders(context, origin);
  }
};

function validPreflight(request: Request): boolean {
  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
  if (requestedMethod === undefined || !allowedMethods.has(requestedMethod)) {
    return false;
  }

  const requestedHeaders = request.headers.get("access-control-request-headers");
  if (requestedHeaders === null || requestedHeaders.trim() === "") {
    return true;
  }

  return requestedHeaders
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .every((header) => header.length > 0 && allowedRequestHeaders.has(header));
}

function applyCorsHeaders(context: Context<GatewayEnvironment>, origin: string): void {
  context.header("Access-Control-Allow-Credentials", "true");
  context.header("Access-Control-Allow-Headers", corsAllowHeaders);
  context.header("Access-Control-Allow-Methods", corsAllowMethods);
  context.header("Access-Control-Allow-Origin", origin);
  context.header("Access-Control-Expose-Headers", "X-Retry-After");
  context.header("Access-Control-Max-Age", "600");
  context.header("Vary", "Origin", { append: true });
}

function crossOriginDenied(context: Parameters<typeof apiError>[0]) {
  return apiError(
    context,
    403,
    "CROSS_ORIGIN_REQUEST_DENIED",
    "The browser request origin is not allowed.",
  );
}
