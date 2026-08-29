import { readFile } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { gateway } from "./index";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-test-auth-secret-with-at-least-32-characters";
const TEST_EMAIL = "owner@mindpay.test";
const TEST_PASSWORD = "MindPay-Test-Password-2026";

interface SessionRow {
  readonly created_at: number;
  readonly expires_at: number;
  readonly id: string;
  readonly token: string;
  readonly updated_at: number;
}

describe("Gateway Better Auth lifecycle", () => {
  let database: D1Database;
  let miniflare: Miniflare;
  let bindings: GatewayAuthBindings;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-08-28",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: { DB: "mindpay-auth-test" },
        modules: true,
        script: "export default { fetch() { return new Response('ok'); } }",
      }),
    );
    database = (await miniflare.getD1Database("DB")) as unknown as D1Database;
    const migration = await readFile(
      new URL("../../../packages/db/migrations/0000_phase_02_foundation.sql", import.meta.url),
      "utf8",
    );
    await database.batch(
      migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0)
        .map((statement) => database.prepare(statement)),
    );
    bindings = {
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
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

  function authRequest(
    route: string,
    init: Omit<RequestInit, "headers"> & {
      readonly headers?: Readonly<Record<string, string>>;
    },
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("origin", FRONTEND_ORIGIN);
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    return Promise.resolve(
      gateway.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
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
