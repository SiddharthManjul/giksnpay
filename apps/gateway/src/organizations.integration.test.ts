import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { ORGANIZATION_CONTEXT_HEADER } from "./authorization";
import { gateway } from "./index";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-organization-auth-test-secret-32-characters";
const TEST_PASSWORD = "MindPay-Organization-Test-2026";
const PRIMARY_ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AA";
const FOREIGN_ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AB";
const MISSING_ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AC";
const MISSING_USER_ID = "usr_01JGFJH900H8M2APVYVDZ4R6AD";

const testUsers = {
  ADMIN: "admin@mindpay.test",
  BUILDER: "builder@mindpay.test",
  OUTSIDER: "outsider@mindpay.test",
  OWNER: "owner@mindpay.test",
  REVIEWER: "reviewer@mindpay.test",
  VIEWER: "viewer@mindpay.test",
} as const;

type TestUser = keyof typeof testUsers;

interface AuthenticatedTestUser {
  readonly cookie: string;
  readonly id: string;
}

describe("Gateway organization authorization", () => {
  let database: D1Database;
  let miniflare: Miniflare;
  let bindings: GatewayAuthBindings;
  const authenticatedUsers = new Map<TestUser, AuthenticatedTestUser>();

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-organization-test"));
    bindings = {
      AGENT_KEY_ENCRYPTION_KEY: "A".repeat(43),
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: FRONTEND_ORIGIN,
    };

    for (const [role, email] of Object.entries(testUsers) as [TestUser, string][]) {
      authenticatedUsers.set(role, await createAuthenticatedUser(email, role));
    }

    const now = Date.now();
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)",
        )
        .bind(PRIMARY_ORGANIZATION_ID, "Primary Workspace", "primary-workspace", now, now),
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)",
        )
        .bind(FOREIGN_ORGANIZATION_ID, "Foreign Workspace", "foreign-workspace", now, now),
      ...(["OWNER", "ADMIN", "BUILDER", "REVIEWER", "VIEWER"] as const).map((role) =>
        database
          .prepare(
            "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
          )
          .bind(PRIMARY_ORGANIZATION_ID, getAuthenticatedUser(role).id, role, now),
      ),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'OWNER', ?)",
        )
        .bind(FOREIGN_ORGANIZATION_ID, getAuthenticatedUser("OUTSIDER").id, now),
    ]);
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("requires an authenticated session before returning user tenancy", async () => {
    const response = await gateway.request(`${AUTH_URL}/api/v1/me`, undefined, bindings);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "A valid authenticated session is required.",
      },
    });
  });

  it("returns the authenticated user's active organizations and exact capabilities", async () => {
    const response = await apiRequest("BUILDER", "/api/v1/me", { method: "GET" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      organizations: [
        {
          access: {
            capabilities: [
              "organization:read",
              "member:read",
              "agent:read",
              "agent:write",
              "merchant:submit",
            ],
            role: "BUILDER",
          },
          organization: { id: PRIMARY_ORGANIZATION_ID },
        },
      ],
      user: { email: testUsers.BUILDER },
    });
  });

  it("allows an owner to update the organization but preserves the last owner", async () => {
    const updateResponse = await apiRequest("OWNER", "/api/v1/organizations/current", {
      body: JSON.stringify({ name: "Owner Updated Workspace" }),
      method: "PATCH",
    });
    expect(updateResponse.status).toBe(200);

    const promoteResponse = await apiRequest(
      "OWNER",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("REVIEWER").id}`,
      { body: JSON.stringify({ role: "ADMIN" }), method: "PATCH" },
    );
    expect(promoteResponse.status).toBe(200);
    const restoreResponse = await apiRequest(
      "OWNER",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("REVIEWER").id}`,
      { body: JSON.stringify({ role: "REVIEWER" }), method: "PATCH" },
    );
    expect(restoreResponse.status).toBe(200);

    const demoteResponse = await apiRequest(
      "OWNER",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("OWNER").id}`,
      { body: JSON.stringify({ role: "VIEWER" }), method: "PATCH" },
    );
    expect(demoteResponse.status).toBe(409);
    await expect(demoteResponse.json()).resolves.toMatchObject({
      error: { code: "LAST_OWNER_REQUIRED" },
    });
  });

  it("allows an admin to update the organization but not grant privileged roles", async () => {
    const updateResponse = await apiRequest("ADMIN", "/api/v1/organizations/current", {
      body: JSON.stringify({ name: "Admin Updated Workspace" }),
      method: "PATCH",
    });
    expect(updateResponse.status).toBe(200);

    const assignResponse = await apiRequest(
      "ADMIN",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("BUILDER").id}`,
      { body: JSON.stringify({ role: "VIEWER" }), method: "PATCH" },
    );
    expect(assignResponse.status).toBe(200);
    const restoreResponse = await apiRequest(
      "ADMIN",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("BUILDER").id}`,
      { body: JSON.stringify({ role: "BUILDER" }), method: "PATCH" },
    );
    expect(restoreResponse.status).toBe(200);

    const promoteResponse = await apiRequest(
      "ADMIN",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("VIEWER").id}`,
      { body: JSON.stringify({ role: "OWNER" }), method: "PATCH" },
    );
    expect(promoteResponse.status).toBe(403);
    await expect(promoteResponse.json()).resolves.toMatchObject({
      error: { code: "ROLE_ASSIGNMENT_DENIED" },
    });
  });

  it("allows a builder to read members but not update organization settings", async () => {
    const membersResponse = await apiRequest("BUILDER", "/api/v1/organizations/current/members", {
      method: "GET",
    });
    expect(membersResponse.status).toBe(200);

    const updateResponse = await apiRequest("BUILDER", "/api/v1/organizations/current", {
      body: JSON.stringify({ name: "Builder Mutation" }),
      method: "PATCH",
    });
    expect(updateResponse.status).toBe(403);
  });

  it("allows a reviewer to read members but not change their roles", async () => {
    const membersResponse = await apiRequest("REVIEWER", "/api/v1/organizations/current/members", {
      method: "GET",
    });
    expect(membersResponse.status).toBe(200);

    const updateResponse = await apiRequest(
      "REVIEWER",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("VIEWER").id}`,
      { body: JSON.stringify({ role: "REVIEWER" }), method: "PATCH" },
    );
    expect(updateResponse.status).toBe(403);
  });

  it("allows a viewer to read the organization but not mutate it", async () => {
    const readResponse = await apiRequest("VIEWER", "/api/v1/organizations/current", {
      method: "GET",
    });
    expect(readResponse.status).toBe(200);

    const updateResponse = await apiRequest("VIEWER", "/api/v1/organizations/current", {
      body: JSON.stringify({ name: "Viewer Mutation" }),
      method: "PATCH",
    });
    expect(updateResponse.status).toBe(403);
  });

  it("does not reveal whether an inaccessible organization exists", async () => {
    const crossOrganization = await apiRequest(
      "OUTSIDER",
      "/api/v1/organizations/current",
      { method: "GET" },
      PRIMARY_ORGANIZATION_ID,
    );
    const missingOrganization = await apiRequest(
      "OWNER",
      "/api/v1/organizations/current",
      { method: "GET" },
      MISSING_ORGANIZATION_ID,
    );

    expect(crossOrganization.status).toBe(404);
    expect(missingOrganization.status).toBe(404);
    expect(await crossOrganization.json()).toEqual(await missingOrganization.json());
  });

  it("does not reveal users that are outside the authorized organization", async () => {
    const foreignUser = await apiRequest(
      "OWNER",
      `/api/v1/organizations/current/members/${getAuthenticatedUser("OUTSIDER").id}`,
      { body: JSON.stringify({ role: "VIEWER" }), method: "PATCH" },
    );
    const missingUser = await apiRequest(
      "OWNER",
      `/api/v1/organizations/current/members/${MISSING_USER_ID}`,
      { body: JSON.stringify({ role: "VIEWER" }), method: "PATCH" },
    );

    expect(foreignUser.status).toBe(404);
    expect(missingUser.status).toBe(404);
    expect(await foreignUser.json()).toEqual(await missingUser.json());
  });

  async function createAuthenticatedUser(
    email: string,
    label: string,
  ): Promise<AuthenticatedTestUser> {
    const clientIp = `203.0.113.${authenticatedUsers.size + 10}`;
    const signUpResponse = await authRequest("sign-up/email", {
      body: JSON.stringify({ email, name: `${label} User`, password: TEST_PASSWORD }),
      headers: { "cf-connecting-ip": clientIp },
      method: "POST",
    });
    expect(signUpResponse.status).toBe(200);

    const signInResponse = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      headers: { "cf-connecting-ip": clientIp },
      method: "POST",
    });
    expect(signInResponse.status).toBe(200);
    const cookie = signInResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) {
      throw new Error(`Better Auth did not issue a cookie for ${label}`);
    }

    const userRow = await database
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (userRow === null) {
      throw new Error(`Better Auth did not persist the ${label} user`);
    }

    return { cookie, id: userRow.id };
  }

  function getAuthenticatedUser(user: TestUser): AuthenticatedTestUser {
    const authenticatedUser = authenticatedUsers.get(user);
    if (authenticatedUser === undefined) {
      throw new Error(`Missing authenticated ${user} fixture`);
    }
    return authenticatedUser;
  }

  function authRequest(route: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      gateway.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  function apiRequest(
    user: TestUser,
    path: string,
    init: RequestInit,
    organizationId = PRIMARY_ORGANIZATION_ID,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", getAuthenticatedUser(user).cookie);
    headers.set(ORGANIZATION_CONTEXT_HEADER, organizationId);
    headers.set("origin", FRONTEND_ORIGIN);
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return Promise.resolve(gateway.request(`${AUTH_URL}${path}`, { ...init, headers }, bindings));
  }
});
