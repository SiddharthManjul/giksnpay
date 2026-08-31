import { describe, expect, it } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { gateway } from "./index";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const UNTRUSTED_ORIGIN = "https://attacker.example";

const bindings: GatewayAuthBindings = {
  AGENT_KEY_ENCRYPTION_KEY: "A".repeat(43),
  BETTER_AUTH_SECRET: "mindpay-test-auth-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: AUTH_URL,
  DB: {} as D1Database,
  ENVIRONMENT: "test",
  PASSKEY_RP_ID: "localhost",
  TRUSTED_ORIGINS: FRONTEND_ORIGIN,
};

const authMutations = [
  "/api/auth/change-email",
  "/api/auth/change-password",
  "/api/auth/delete-user",
  "/api/auth/link-social",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/revoke-other-sessions",
  "/api/auth/revoke-session",
  "/api/auth/revoke-sessions",
  "/api/auth/send-verification-email",
  "/api/auth/sign-in/email",
  "/api/auth/sign-in/social",
  "/api/auth/sign-out",
  "/api/auth/sign-up/email",
  "/api/auth/unlink-account",
  "/api/auth/update-session",
  "/api/auth/update-user",
] as const;

describe("Gateway browser security boundary", () => {
  it("answers valid preflights only for the exact origin, method, and header allowlist", async () => {
    const allowed = await gateway.request(
      `${AUTH_URL}/api/v1/organizations/current`,
      {
        headers: {
          "access-control-request-headers":
            "content-type, idempotency-key, x-mindpay-organization-id",
          "access-control-request-method": "PATCH",
          origin: FRONTEND_ORIGIN,
        },
        method: "OPTIONS",
      },
      bindings,
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(FRONTEND_ORIGIN);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(allowed.headers.get("access-control-allow-headers")).toContain(
      "x-mindpay-organization-id",
    );
    expect(allowed.headers.get("access-control-allow-headers")).toContain("idempotency-key");
    expect(allowed.headers.get("vary")).toContain("Origin");

    for (const headers of [
      {
        "access-control-request-method": "PATCH",
        origin: UNTRUSTED_ORIGIN,
      },
      {
        "access-control-request-method": "TRACE",
        origin: FRONTEND_ORIGIN,
      },
      {
        "access-control-request-headers": "authorization",
        "access-control-request-method": "PATCH",
        origin: FRONTEND_ORIGIN,
      },
    ]) {
      const denied = await gateway.request(
        `${AUTH_URL}/api/v1/organizations/current`,
        { headers, method: "OPTIONS" },
        bindings,
      );
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({
        error: { code: "CROSS_ORIGIN_REQUEST_DENIED" },
      });
    }
  });

  it.each(authMutations)("blocks CSRF before the auth mutation handler: %s", async (path) => {
    const response = await gateway.request(
      `${AUTH_URL}${path}`,
      {
        body: "{}",
        headers: {
          "content-type": "application/json",
          cookie: "mindpay.session_token=untrusted-browser-cookie",
          origin: UNTRUSTED_ORIGIN,
          "sec-fetch-site": "cross-site",
        },
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CROSS_ORIGIN_REQUEST_DENIED" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects credentialed mutations when the browser omits Origin", async () => {
    for (const path of [
      "/api/auth/sign-out",
      "/api/v1/demo-workspaces",
      "/api/v1/organizations/current",
      "/api/v1/passkeys/registration/options",
    ]) {
      const response = await gateway.request(
        `${AUTH_URL}${path}`,
        {
          body: "{}",
          headers: {
            "content-type": "application/json",
            cookie: "mindpay.session_token=missing-origin-cookie",
            "sec-fetch-site": "same-origin",
          },
          method: "POST",
        },
        bindings,
      );
      expect(response.status).toBe(403);
    }
  });

  it("allows originless non-browser requests while blocking cross-site browser mutations", async () => {
    const serverRequest = await gateway.request(
      `${AUTH_URL}/api/not-configured`,
      { method: "GET" },
      bindings,
    );
    expect(serverRequest.status).toBe(404);

    const crossSiteBrowserRequest = await gateway.request(
      `${AUTH_URL}/api/auth/sign-in/email`,
      {
        body: "{}",
        headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
        method: "POST",
      },
      bindings,
    );
    expect(crossSiteBrowserRequest.status).toBe(403);
  });

  it("adds credentialed CORS headers to allowed-origin API responses", async () => {
    const response = await gateway.request(
      `${AUTH_URL}/api/not-configured`,
      { headers: { origin: FRONTEND_ORIGIN }, method: "GET" },
      bindings,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe(FRONTEND_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-expose-headers")).toBe("X-Retry-After");
  });
});
