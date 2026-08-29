import { meResponseSchema, provisionDemoWorkspaceResponseSchema } from "@mindpay/contracts";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { ORGANIZATION_CONTEXT_HEADER } from "./authorization";
import { DEMO_WORKSPACE_TTL_MS, IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";
import { gateway } from "./index";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-test-auth-secret-with-at-least-32-characters";
const TEST_PASSWORD = "MindPay-Test-Password-2026";

interface AuthenticatedTestUser {
  readonly cookie: string;
  readonly id: string;
}

interface DemoWorkspaceRow {
  readonly created_at: number;
  readonly expires_at: number;
  readonly id: string;
  readonly role: string;
}

describe("Gateway demo workspace provisioning", () => {
  let bindings: GatewayAuthBindings;
  let database: D1Database;
  let firstUser: AuthenticatedTestUser;
  let miniflare: Miniflare;
  let secondUser: AuthenticatedTestUser;

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-demo-workspaces-test"));
    bindings = {
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: FRONTEND_ORIGIN,
    };
    firstUser = await createAuthenticatedUser("first-demo@mindpay.test", "First", "203.0.113.60");
    secondUser = await createAuthenticatedUser(
      "second-demo@mindpay.test",
      "Second",
      "203.0.113.61",
    );
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("atomically creates an organization, owner membership, and 24-hour expiry metadata", async () => {
    const response = await provision(firstUser, "demo-provision-key-0001", {
      name: "Judge Workspace",
    });
    expect(response.status).toBe(201);
    const body = provisionDemoWorkspaceResponseSchema.parse(await response.json());
    expect(body.workspace).toMatchObject({
      access: { role: "OWNER" },
      organization: { name: "Judge Workspace", status: "ACTIVE" },
    });
    expect(Date.parse(body.workspace.expiresAt) - Date.parse(body.workspace.createdAt)).toBe(
      DEMO_WORKSPACE_TTL_MS,
    );

    const stored = await database
      .prepare(
        "SELECT o.id, m.role, d.created_at, d.expires_at FROM organizations o JOIN organization_members m ON m.organization_id = o.id JOIN demo_workspaces d ON d.organization_id = o.id WHERE o.id = ? AND m.user_id = ?",
      )
      .bind(body.workspace.organization.id, firstUser.id)
      .first<DemoWorkspaceRow>();
    expect(stored).toEqual({
      created_at: Date.parse(body.workspace.createdAt),
      expires_at: Date.parse(body.workspace.expiresAt),
      id: body.workspace.organization.id,
      role: "OWNER",
    });
  });

  it("returns the exact stored workspace for a repeated idempotency key", async () => {
    const key = "demo-provision-key-0002";
    const first = await provision(firstUser, key, { name: "Idempotent Demo" });
    const firstBody = provisionDemoWorkspaceResponseSchema.parse(await first.json());
    const replay = await provision(firstUser, key, { name: "Idempotent Demo" });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(firstBody);
    await expect(
      database
        .prepare("SELECT count(*) AS count FROM organizations WHERE id = ?")
        .bind(firstBody.workspace.organization.id)
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 1 });
    await expect(
      database
        .prepare(
          "SELECT state, response_status FROM idempotency_records WHERE key = ? AND scope = ?",
        )
        .bind(key, `demo-workspace:provision:${firstUser.id}`)
        .first<{ response_status: number; state: string }>(),
    ).resolves.toEqual({ response_status: 201, state: "COMPLETED" });
  });

  it("converges concurrent repeats on one stored workspace", async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        provision(firstUser, "demo-provision-key-concurrent-0006", {
          name: "Concurrent Demo",
        }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201, 201]);
    const bodies = await Promise.all(
      responses.map(async (response) =>
        provisionDemoWorkspaceResponseSchema.parse(await response.json()),
      ),
    );
    expect(new Set(bodies.map((body) => body.workspace.organization.id)).size).toBe(1);

    const organizationId = bodies[0]?.workspace.organization.id;
    if (organizationId === undefined) {
      throw new Error("Concurrent provisioning returned no workspace");
    }
    await expect(
      database
        .prepare("SELECT count(*) AS count FROM organizations WHERE id = ?")
        .bind(organizationId)
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 1 });
  });

  it("rejects reuse of an idempotency key with different input", async () => {
    const key = "demo-provision-key-0003";
    expect((await provision(firstUser, key, { name: "Original Demo" })).status).toBe(201);
    const conflict = await provision(firstUser, key, { name: "Changed Demo" });

    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("requires a canonical idempotency key", async () => {
    for (const key of [undefined, "short"] as const) {
      const response = await provision(firstUser, key, {});
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "IDEMPOTENCY_KEY_REQUIRED" },
      });
    }
  });

  it("scopes the same idempotency key independently per user and prevents cross-user access", async () => {
    const key = "demo-provision-key-shared-0004";
    const firstBody = provisionDemoWorkspaceResponseSchema.parse(
      await (await provision(firstUser, key, { name: "First Isolated Demo" })).json(),
    );
    const secondBody = provisionDemoWorkspaceResponseSchema.parse(
      await (await provision(secondUser, key, { name: "Second Isolated Demo" })).json(),
    );
    expect(firstBody.workspace.organization.id).not.toBe(secondBody.workspace.organization.id);

    const crossRead = await organizationRequest(
      firstUser,
      secondBody.workspace.organization.id,
      "/api/v1/organizations/current",
      { method: "GET" },
    );
    expect(crossRead.status).toBe(404);

    const crossMutation = await organizationRequest(
      firstUser,
      secondBody.workspace.organization.id,
      "/api/v1/organizations/current",
      { body: JSON.stringify({ name: "Cross-user mutation" }), method: "PATCH" },
    );
    expect(crossMutation.status).toBe(404);

    const secondRead = await organizationRequest(
      secondUser,
      secondBody.workspace.organization.id,
      "/api/v1/organizations/current",
      { method: "GET" },
    );
    expect(secondRead.status).toBe(200);
    await expect(secondRead.json()).resolves.toMatchObject({
      organization: { name: "Second Isolated Demo" },
    });
  });

  it("removes an expired demo from discovery and authorization without deleting its record", async () => {
    const body = provisionDemoWorkspaceResponseSchema.parse(
      await (
        await provision(firstUser, "demo-provision-key-0005", { name: "Expiring Demo" })
      ).json(),
    );
    await database
      .prepare("UPDATE demo_workspaces SET expires_at = ? WHERE organization_id = ?")
      .bind(Date.now() - 1, body.workspace.organization.id)
      .run();

    const me = await apiRequest(firstUser, "/api/v1/me", { method: "GET" });
    expect(me.status).toBe(200);
    const meBody = meResponseSchema.parse(await me.json());
    expect(meBody.organizations.map((entry) => entry.organization.id)).not.toContain(
      body.workspace.organization.id,
    );

    const expiredRead = await organizationRequest(
      firstUser,
      body.workspace.organization.id,
      "/api/v1/organizations/current",
      { method: "GET" },
    );
    expect(expiredRead.status).toBe(404);
    await expect(
      database
        .prepare("SELECT count(*) AS count FROM organizations WHERE id = ?")
        .bind(body.workspace.organization.id)
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 1 });
  });

  async function createAuthenticatedUser(
    email: string,
    label: string,
    clientIp: string,
  ): Promise<AuthenticatedTestUser> {
    const signUp = await authRequest("sign-up/email", clientIp, {
      body: JSON.stringify({ email, name: `${label} Demo User`, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signUp.status).toBe(200);
    const signIn = await authRequest("sign-in/email", clientIp, {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    const user = await database.prepare("SELECT id FROM user WHERE email = ?").bind(email).first<{
      id: string;
    }>();
    if (cookie === undefined || user === null) {
      throw new Error(`Better Auth did not create the ${label} demo user`);
    }
    return { cookie, id: user.id };
  }

  function authRequest(route: string, clientIp: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", clientIp);
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      gateway.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  function provision(
    user: AuthenticatedTestUser,
    key: string | undefined,
    body: Readonly<Record<string, unknown>>,
  ): Promise<Response> {
    const headers = new Headers({
      "content-type": "application/json",
      cookie: user.cookie,
      origin: FRONTEND_ORIGIN,
    });
    if (key !== undefined) {
      headers.set(IDEMPOTENCY_KEY_HEADER, key);
    }
    return Promise.resolve(
      gateway.request(
        `${AUTH_URL}/api/v1/demo-workspaces`,
        { body: JSON.stringify(body), headers, method: "POST" },
        bindings,
      ),
    );
  }

  function organizationRequest(
    user: AuthenticatedTestUser,
    organizationId: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set(ORGANIZATION_CONTEXT_HEADER, organizationId);
    return apiRequest(user, path, { ...init, headers });
  }

  function apiRequest(
    user: AuthenticatedTestUser,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", user.cookie);
    headers.set("origin", FRONTEND_ORIGIN);
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return Promise.resolve(gateway.request(`${AUTH_URL}${path}`, { ...init, headers }, bindings));
  }
});
