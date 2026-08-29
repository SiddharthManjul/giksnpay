import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { gateway } from "./index";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-test-auth-secret-with-at-least-32-characters";
const TEST_EMAIL = "owner@mindpay.test";
const TEST_PASSWORD = "MindPay-Test-Password-2026";
const CHANGED_PASSWORD = "MindPay-Changed-Password-2026";
const DEFAULT_CLIENT_IP = "203.0.113.10";

interface SessionRow {
  readonly created_at: number;
  readonly expires_at: number;
  readonly id: string;
  readonly token: string;
  readonly updated_at: number;
}

interface RateLimitRow {
  readonly count: number;
  readonly id: string;
  readonly key: string;
  readonly last_request: number;
}

describe("Gateway Better Auth lifecycle", () => {
  let database: D1Database;
  let miniflare: Miniflare;
  let bindings: GatewayAuthBindings;

  beforeEach(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-auth-test"));
    bindings = {
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: FRONTEND_ORIGIN,
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await miniflare.dispose();
  });

  it("signs in, refreshes, signs out, and rejects the invalidated session", async () => {
    const capturedLogs: string[] = [];
    for (const method of ["debug", "error", "info", "log", "warn"] as const) {
      vi.spyOn(console, method).mockImplementation((...values: unknown[]) => {
        capturedLogs.push(values.map(formatLogValue).join(" "));
      });
    }

    const signUpResponse = await authRequest("sign-up/email", {
      body: JSON.stringify({
        email: TEST_EMAIL,
        name: "MindPay Owner",
        password: TEST_PASSWORD,
      }),
      method: "POST",
    });
    expect(signUpResponse.status).toBe(200);

    const signInResponse = await authRequest("sign-in/email", {
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signInResponse.status).toBe(200);
    const responseCookie = signInResponse.headers.get("set-cookie");
    expect(responseCookie).toContain("HttpOnly");
    expect(responseCookie).toContain("SameSite=Lax");
    expect(responseCookie).not.toContain("Secure");
    const cookie = responseCookie?.split(";", 1)[0];
    expect(cookie).toBeTruthy();

    const signInBody = await signInResponse.clone().json();
    expect(hasSensitiveAuthKey(signInBody)).toBe(false);

    const initialSession = await database
      .prepare("SELECT id, token, created_at, updated_at, expires_at FROM session")
      .first<SessionRow>();
    expect(initialSession).not.toBeNull();
    if (initialSession === null || cookie === undefined) {
      throw new Error("Better Auth did not create the expected session");
    }
    expect(initialSession.id).toMatch(/^ses_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(await signInResponse.clone().text()).not.toContain(initialSession.token);

    const sessionResponse = await authRequest("get-session", {
      headers: { cookie },
      method: "GET",
    });
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody).toMatchObject({ user: { email: TEST_EMAIL } });
    expect(hasSensitiveAuthKey(sessionBody)).toBe(false);

    const staleTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1_000;
    const expiringTimestamp = Date.now() + 5 * 24 * 60 * 60 * 1_000;
    await database
      .prepare("UPDATE session SET created_at = ?, updated_at = ?, expires_at = ? WHERE id = ?")
      .bind(staleTimestamp, staleTimestamp, expiringTimestamp, initialSession.id)
      .run();

    const refreshResponse = await authRequest("get-session", {
      headers: { cookie },
      method: "GET",
    });
    expect(refreshResponse.status).toBe(200);
    const refreshedSession = await database
      .prepare("SELECT id, token, created_at, updated_at, expires_at FROM session WHERE id = ?")
      .bind(initialSession.id)
      .first<SessionRow>();
    expect(refreshedSession?.updated_at).toBeGreaterThan(staleTimestamp);
    expect(refreshedSession?.expires_at).toBeGreaterThan(expiringTimestamp);

    const signOutResponse = await authRequest("sign-out", {
      headers: { cookie },
      method: "POST",
    });
    expect(signOutResponse.status).toBe(200);
    await expect(
      database.prepare("SELECT count(*) AS count FROM session").first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });

    const invalidatedSessionResponse = await authRequest("get-session", {
      headers: { cookie },
      method: "GET",
    });
    expect(invalidatedSessionResponse.status).toBe(200);
    await expect(invalidatedSessionResponse.json()).resolves.toBeNull();

    const combinedLogs = capturedLogs.join("\n");
    expect(combinedLogs).not.toContain(TEST_AUTH_SECRET);
    expect(combinedLogs).not.toContain(initialSession.token);
  });

  it("never adopts an attacker-provided session cookie during sign-in", async () => {
    await signUp(TEST_EMAIL);
    const fixedCookie = "mindpay.session_token=attacker-fixed-session-token";
    const response = await authRequest("sign-in/email", {
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      headers: { cookie: fixedCookie },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const issuedCookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    expect(issuedCookie).toBeTruthy();
    expect(issuedCookie).not.toBe(fixedCookie);
    expect(issuedCookie).not.toContain("attacker-fixed-session-token");
    await expect(
      database
        .prepare("SELECT count(*) AS count FROM session WHERE token = ?")
        .bind("attacker-fixed-session-token")
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });

  it("makes password-change requests non-replayable by rotating the credential and session", async () => {
    const cookie = await signUpAndSignIn(TEST_EMAIL);
    const changeRequest = {
      body: JSON.stringify({
        currentPassword: TEST_PASSWORD,
        newPassword: CHANGED_PASSWORD,
        revokeOtherSessions: true,
      }),
      headers: { cookie },
      method: "POST",
    } as const;

    const firstChange = await authRequest("change-password", changeRequest);
    expect(firstChange.status).toBe(200);
    expect(hasSensitiveAuthKey(await firstChange.json())).toBe(false);

    const replay = await authRequest("change-password", changeRequest);
    expect(replay.status).toBe(401);

    const oldPasswordSignIn = await authRequest("sign-in/email", {
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      headers: { "cf-connecting-ip": "203.0.113.11" },
      method: "POST",
    });
    expect(oldPasswordSignIn.status).toBe(401);

    const newPasswordSignIn = await authRequest("sign-in/email", {
      body: JSON.stringify({ email: TEST_EMAIL, password: CHANGED_PASSWORD }),
      headers: { "cf-connecting-ip": "203.0.113.12" },
      method: "POST",
    });
    expect(newPasswordSignIn.status).toBe(200);
  });

  it("rate limits credential attacks atomically in D1 using only Cloudflare's client IP", async () => {
    await signUp(TEST_EMAIL);
    const attackerIp = "198.51.100.40";

    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, attempt) =>
        authRequest("sign-in/email", {
          body: JSON.stringify({ email: TEST_EMAIL, password: "incorrect-password-value" }),
          headers: {
            "cf-connecting-ip": attackerIp,
            "x-forwarded-for": `192.0.2.${attempt + 1}`,
          },
          method: "POST",
        }),
      ),
    );
    expect(attempts.map((response) => response.status).sort()).toEqual([
      401, 401, 401, 401, 401, 429, 429, 429, 429, 429, 429, 429,
    ]);
    expect(attempts.find((response) => response.status === 429)?.headers.get("x-retry-after")).toBe(
      "60",
    );

    const blocked = await authRequest("sign-in/email", {
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      headers: {
        "cf-connecting-ip": attackerIp,
        "x-forwarded-for": "192.0.2.250",
      },
      method: "POST",
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("access-control-allow-origin")).toBe(FRONTEND_ORIGIN);
    expect(blocked.headers.get("access-control-allow-credentials")).toBe("true");

    const rows = await database
      .prepare("SELECT id, key, count, last_request FROM rate_limit WHERE count = 5")
      .all<RateLimitRow>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.id).toMatch(/^rtl_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(rows.results[0]?.last_request).toBeGreaterThan(0);
    expect(rows.results[0]?.key).toBe(`${attackerIp}|/sign-in/email`);

    const independentClient = await authRequest("sign-in/email", {
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      headers: { "cf-connecting-ip": "198.51.100.41" },
      method: "POST",
    });
    expect(independentClient.status).toBe(200);
  });

  it("uses secure, host-only cookies for HTTPS deployments", async () => {
    const secureBindings: GatewayAuthBindings = {
      ...bindings,
      BETTER_AUTH_URL: "https://api.mindpay.test",
      ENVIRONMENT: "production",
      PASSKEY_RP_ID: "mindpay.test",
      TRUSTED_ORIGINS: "https://app.mindpay.test",
    };
    await signUp("secure@mindpay.test", secureBindings);
    const response = await authRequest(
      "sign-in/email",
      {
        body: JSON.stringify({ email: "secure@mindpay.test", password: TEST_PASSWORD }),
        method: "POST",
      },
      secureBindings,
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  async function signUp(
    email: string,
    requestBindings: GatewayAuthBindings = bindings,
  ): Promise<void> {
    const response = await authRequest(
      "sign-up/email",
      {
        body: JSON.stringify({ email, name: "MindPay Owner", password: TEST_PASSWORD }),
        method: "POST",
      },
      requestBindings,
    );
    expect(response.status).toBe(200);
  }

  async function signUpAndSignIn(email: string): Promise<string> {
    await signUp(email);
    const response = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) {
      throw new Error("Better Auth did not issue the expected session cookie");
    }
    return cookie;
  }

  function authRequest(
    route: string,
    init: Omit<RequestInit, "headers"> & {
      readonly headers?: Readonly<Record<string, string>>;
    },
    requestBindings: GatewayAuthBindings = bindings,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("cf-connecting-ip")) {
      headers.set("cf-connecting-ip", DEFAULT_CLIENT_IP);
    }
    if (!headers.has("origin")) {
      headers.set("origin", requestBindings.TRUSTED_ORIGINS.split(",", 1)[0] ?? FRONTEND_ORIGIN);
    }
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    return Promise.resolve(
      gateway.request(
        `${requestBindings.BETTER_AUTH_URL}/api/auth/${route}`,
        { ...init, headers },
        requestBindings,
      ),
    );
  }
});

function hasSensitiveAuthKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasSensitiveAuthKey);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      ["accessToken", "idToken", "refreshToken", "sessionToken", "token"].includes(key) ||
      hasSensitiveAuthKey(nestedValue),
  );
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
