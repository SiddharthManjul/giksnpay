import { ulidSchema } from "@mindpay/domain";
import { describe, expect, it } from "vitest";
import { createAuthDatabaseId, sanitizeAuthResponse } from "./auth";

describe("Gateway auth boundary", () => {
  it.each([
    ["account", "acc"],
    ["session", "ses"],
    ["user", "usr"],
    ["verification", "ver"],
  ])("creates a namespaced canonical ID for the %s model", (model, prefix) => {
    const identifier = createAuthDatabaseId({ model });

    expect(identifier.startsWith(`${prefix}_`)).toBe(true);
    expect(() => ulidSchema.parse(identifier.slice(prefix.length + 1))).not.toThrow();
  });

  it("fails closed when Better Auth requests an unregistered model", () => {
    expect(() => createAuthDatabaseId({ model: "unknown" })).toThrow(
      "Better Auth requested an unregistered ID model: unknown",
    );
  });

  it("removes session and provider credentials from JSON without dropping cookie headers", async () => {
    const response = new Response(
      JSON.stringify({
        accessToken: "provider-access-token",
        nested: {
          idToken: "provider-id-token",
          refreshToken: "provider-refresh-token",
          safe: "visible",
          sessionToken: "nested-session-token",
        },
        token: "raw-session-token",
        user: { email: "owner@mindpay.test" },
      }),
      {
        headers: {
          "content-type": "application/json",
          "set-cookie": "mindpay.session_token=opaque; HttpOnly; SameSite=Lax",
        },
      },
    );

    const sanitized = await sanitizeAuthResponse(response);

    await expect(sanitized.json()).resolves.toEqual({
      nested: { safe: "visible" },
      user: { email: "owner@mindpay.test" },
    });
    expect(sanitized.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("leaves non-JSON auth responses untouched", async () => {
    const response = new Response("redirect", {
      headers: { location: "https://mindpay.test/checkout" },
      status: 302,
    });

    await expect(sanitizeAuthResponse(response)).resolves.toBe(response);
  });
});
