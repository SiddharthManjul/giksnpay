import { MINDPAY_MCP_TOOL_NAMES, agentResponseSchema } from "@mindpay/contracts";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { ORGANIZATION_CONTEXT_HEADER } from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";
import { createGatewayApp } from "./index";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-mcp-auth-secret-with-at-least-32-characters";
const TEST_PASSWORD = "MindPay-MCP-Test-Password-2026";
const ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AA";
const NOW = new Date("2026-09-04T10:00:00.000Z");

describe("MindPay remote MCP surface", () => {
  let agentId: string;
  let bindings: GatewayAuthBindings;
  let cookie: string;
  let database: D1Database;
  let miniflare: Miniflare;
  const app = createGatewayApp({}, {}, {}, {}, {}, {}, { now: () => NOW });

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase(`mindpay-mcp-${crypto.randomUUID()}`));
    bindings = {
      AGENT_KEY_ENCRYPTION_KEY: "A".repeat(43),
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      MINDPAY_API_AUDIENCE: "https://api.mindpay.example/",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: FRONTEND_ORIGIN,
    };
    const user = await createAuthenticatedUser();
    cookie = user.cookie;
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, 'MCP Workspace', 'mcp-workspace', 'ACTIVE', ?, ?)",
        )
        .bind(ORGANIZATION_ID, NOW.getTime(), NOW.getTime()),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'OWNER', ?)",
        )
        .bind(ORGANIZATION_ID, user.id, NOW.getTime()),
    ]);
    agentId = await createPublishedAgent();
  });

  afterAll(async () => miniflare.dispose());

  it("requires an authenticated organization caller", async () => {
    const response = await rpc(
      { id: 1, jsonrpc: "2.0", method: "tools/list", params: {} },
      { authenticated: false },
    );
    expect(response.status).toBe(401);
  });

  it("discovers exactly six non-payment MCP tools", async () => {
    const response = await rpc({ id: 2, jsonrpc: "2.0", method: "tools/list", params: {} });
    const responseText = await response.text();
    expect(response.status, responseText).toBe(200);
    const body = parseMcpResponse(responseText) as {
      readonly result?: { readonly tools?: readonly { readonly name?: string }[] };
    };
    const names = body.result?.tools?.map((tool) => tool.name).sort();
    expect(names).toEqual([...MINDPAY_MCP_TOOL_NAMES].sort());
    expect(names).not.toContain("execute_payment");
  });

  it("enforces agent binding and records a rate-limited subject and immutable invocation", async () => {
    const transactionId = "ctx_01JGFJH900H8M2APVYVDZ4R6AC";
    const response = await rpc({
      id: 3,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { agentId, transactionId }, name: "get_evidence_bundle" },
    });
    const responseText = await response.text();
    expect(response.status, responseText).toBe(200);
    expect(parseMcpResponse(responseText)).toMatchObject({
      result: { isError: true },
    });
    expect(
      await database
        .prepare("SELECT tool_name, outcome, error_code FROM mcp_tool_invocations LIMIT 1")
        .first(),
    ).toMatchObject({
      error_code: "TRANSACTION_NOT_FOUND",
      outcome: "FAILED",
      tool_name: "get_evidence_bundle",
    });
    expect(
      await database.prepare("SELECT request_count FROM mcp_rate_limits LIMIT 1").first(),
    ).toMatchObject({ request_count: 1 });
    await expect(database.prepare("DELETE FROM mcp_tool_invocations").run()).rejects.toThrow(
      "MCP invocation audit is retained",
    );
  });

  async function createAuthenticatedUser() {
    const email = "mcp-owner@mindpay.test";
    const signUp = await authRequest("sign-up/email", {
      body: JSON.stringify({ email, name: "MCP Owner", password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signUp.status).toBe(200);
    const signIn = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signIn.status).toBe(200);
    const sessionCookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    const user = await database
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (sessionCookie === undefined || user === null)
      throw new Error("Authentication setup failed");
    return { cookie: sessionCookie, id: user.id };
  }

  async function createPublishedAgent() {
    const created = await apiRequest("/api/v1/agents", {
      body: JSON.stringify({
        description: "Uses only verified MindPay services under strict published tool scopes.",
        name: "MCP Procurement Agent",
        slug: "mcp-procurement-agent",
      }),
      headers: { [IDEMPOTENCY_KEY_HEADER]: "mcp-agent-create-0001" },
      method: "POST",
    });
    const createdAgent = agentResponseSchema.parse(await created.json()).agent;
    const procurementScope = {
      allowedCategories: ["business_research"],
      maximumPriceSubunits: 50_000,
    };
    const version = await apiRequest(`/api/v1/agents/${createdAgent.id}/versions`, {
      body: JSON.stringify({
        configuration: { maxOutputTokens: 512, temperature: 0 },
        modelName: "gemini-2.5-flash",
        modelProvider: "google",
        specialization: "Verified service procurement",
        systemPolicy: "Use only approved MindPay tools and never execute or authorize a payment.",
        toolBindings: [
          { scope: procurementScope, toolVersionId: "search_verified_services.v1" },
          { scope: procurementScope, toolVersionId: "get_verified_service.v1" },
          { scope: procurementScope, toolVersionId: "request_signed_offer.v1" },
          { scope: procurementScope, toolVersionId: "propose_purchase.v1" },
          { scope: {}, toolVersionId: "get_transaction_status.v1" },
          { scope: {}, toolVersionId: "get_evidence_bundle.v1" },
        ],
        version: "1.0.0",
      }),
      headers: { [IDEMPOTENCY_KEY_HEADER]: "mcp-agent-version-0001" },
      method: "POST",
    });
    const versionId = agentResponseSchema.parse(await version.json()).agent.versions[0]?.id;
    if (versionId === undefined) throw new Error("Agent version setup failed");
    const published = await apiRequest(`/api/v1/agents/${createdAgent.id}/publish`, {
      body: JSON.stringify({ versionId }),
      headers: { [IDEMPOTENCY_KEY_HEADER]: "mcp-agent-publish-0001" },
      method: "POST",
    });
    expect(published.status).toBe(200);
    return createdAgent.id;
  }

  function authRequest(route: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", "203.0.113.91");
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      app.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  function apiRequest(path: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    headers.set(ORGANIZATION_CONTEXT_HEADER, ORGANIZATION_ID);
    return Promise.resolve(app.request(`${AUTH_URL}${path}`, { ...init, headers }, bindings));
  }

  function rpc(
    body: Readonly<Record<string, unknown>>,
    options: Readonly<{ authenticated?: boolean }> = {},
  ) {
    const headers = new Headers({
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Host: "localhost",
      Origin: FRONTEND_ORIGIN,
    });
    if (options.authenticated !== false) {
      headers.set("cookie", cookie);
      headers.set(ORGANIZATION_CONTEXT_HEADER, ORGANIZATION_ID);
    }
    return Promise.resolve(
      app.request(
        `${AUTH_URL}/mcp`,
        { body: JSON.stringify(body), headers, method: "POST" },
        bindings,
      ),
    );
  }
});

function parseMcpResponse(body: string): unknown {
  if (body.trimStart().startsWith("{")) return JSON.parse(body) as unknown;
  const data = body
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice(6);
  if (data === undefined) throw new Error("MCP response did not contain a JSON result");
  return JSON.parse(data) as unknown;
}
