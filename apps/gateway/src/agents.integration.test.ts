import { importAgentKeyEncryptionKey, loadAgentPrivateSigningKey } from "@mindpay/agent-runtime";
import { agentResponseSchema } from "@mindpay/contracts";
import { AesGcmDecryptionError } from "@mindpay/crypto";
import type { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import { ORGANIZATION_CONTEXT_HEADER } from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";
import { createGatewayApp } from "./index";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const TEST_AUTH_SECRET = "mindpay-agent-auth-secret-with-at-least-32-characters";
const TEST_KEY_SECRET = "A".repeat(43);
const TEST_PASSWORD = "MindPay-Agent-Test-Password-2026";
const PRIMARY_ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AA";
const FOREIGN_ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AB";
const FIXED_NOW = new Date("2026-08-30T12:00:00.000Z");

interface TestUser {
  readonly cookie: string;
  readonly id: string;
}

describe("Gateway organization-scoped agent administration", () => {
  let bindings: GatewayAuthBindings;
  let builder: TestUser;
  let database: D1Database;
  let miniflare: Miniflare;
  let outsider: TestUser;
  let owner: TestUser;
  let viewer: TestUser;
  const app = createGatewayApp({}, { now: () => new Date(FIXED_NOW) });

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-agent-test"));
    bindings = {
      AGENT_KEY_ENCRYPTION_KEY: TEST_KEY_SECRET,
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: FRONTEND_ORIGIN,
    };
    owner = await createAuthenticatedUser("agent-owner@mindpay.test", "Agent Owner", 81);
    builder = await createAuthenticatedUser("agent-builder@mindpay.test", "Agent Builder", 82);
    viewer = await createAuthenticatedUser("agent-viewer@mindpay.test", "Agent Viewer", 83);
    outsider = await createAuthenticatedUser("agent-outsider@mindpay.test", "Agent Outsider", 84);
    const createdAt = FIXED_NOW.getTime();
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, 'Agent Workspace', 'agent-workspace', 'ACTIVE', ?, ?)",
        )
        .bind(PRIMARY_ORGANIZATION_ID, createdAt, createdAt),
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, 'Foreign Workspace', 'foreign-agent-workspace', 'ACTIVE', ?, ?)",
        )
        .bind(FOREIGN_ORGANIZATION_ID, createdAt, createdAt),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'OWNER', ?)",
        )
        .bind(PRIMARY_ORGANIZATION_ID, owner.id, createdAt),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'BUILDER', ?)",
        )
        .bind(PRIMARY_ORGANIZATION_ID, builder.id, createdAt),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'VIEWER', ?)",
        )
        .bind(PRIMARY_ORGANIZATION_ID, viewer.id, createdAt),
      database
        .prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'OWNER', ?)",
        )
        .bind(FOREIGN_ORGANIZATION_ID, outsider.id, createdAt),
    ]);
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an encrypted signing identity without exposing private material", async () => {
    const capturedLogs: string[] = [];
    for (const method of ["debug", "error", "info", "log", "warn"] as const) {
      vi.spyOn(console, method).mockImplementation((...values: unknown[]) => {
        capturedLogs.push(values.map(formatLogValue).join(" "));
      });
    }
    const request = {
      description: "Researches verified services within an approved user budget.",
      name: "Procurement Researcher",
      slug: "procurement-researcher",
    };
    const created = await mutation(builder, "/api/v1/agents", "agent-create-key-0001", request);
    expect(created.status).toBe(201);
    const createdText = await created.text();
    expect(createdText).not.toContain("encryptedPrivateJwk");
    expect(createdText).not.toContain("ciphertext");
    expect(createdText).not.toContain('"d"');
    const response = agentResponseSchema.parse(JSON.parse(createdText) as unknown);

    const stored = await database
      .prepare(
        "SELECT public_jwk, encrypted_private_jwk FROM agent_keys WHERE agent_id = ? AND kid = ?",
      )
      .bind(response.agent.id, response.agent.key.kid)
      .first<{ encrypted_private_jwk: string; public_jwk: string }>();
    expect(stored).not.toBeNull();
    if (stored === null) throw new Error("Agent key was not persisted");
    expect(JSON.parse(stored.public_jwk)).not.toHaveProperty("d");
    expect(JSON.parse(stored.encrypted_private_jwk)).toMatchObject({
      algorithm: "A256GCM",
      version: 1,
    });
    const storedCiphertext = zodCiphertext(stored.encrypted_private_jwk);
    expect(capturedLogs.join("\n")).not.toContain(storedCiphertext);

    const encryptionKey = await importAgentKeyEncryptionKey(TEST_KEY_SECRET);
    const privateKey = await loadAgentPrivateSigningKey({
      agentId: response.agent.id,
      encryptedPrivateJwk: JSON.parse(stored.encrypted_private_jwk) as unknown,
      encryptionKey,
      kid: response.agent.key.kid,
    });
    expect(privateKey.extractable).toBe(false);
    const wrongKey = await importAgentKeyEncryptionKey(`${"A".repeat(42)}Q`);
    await expect(
      loadAgentPrivateSigningKey({
        agentId: response.agent.id,
        encryptedPrivateJwk: JSON.parse(stored.encrypted_private_jwk) as unknown,
        encryptionKey: wrongKey,
        kid: response.agent.key.kid,
      }),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);

    const replay = await mutation(builder, "/api/v1/agents", "agent-create-key-0001", request);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(response);
    const conflict = await mutation(builder, "/api/v1/agents", "agent-create-key-0001", {
      ...request,
      name: "Changed Name",
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("publishes a version once and freezes its policy, configuration, and tool bindings", async () => {
    const listed = await apiRequest(viewer, "/api/v1/agents", { method: "GET" });
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { agents: { id: string }[] };
    const agentId = listBody.agents[0]?.id;
    if (agentId === undefined) throw new Error("The agent creation test did not persist an agent");

    const versionCreation = await mutation(
      builder,
      `/api/v1/agents/${agentId}/versions`,
      "agent-version-key-0002",
      {
        configuration: { maxOutputTokens: 2048, temperature: 0.2 },
        modelName: "gpt_5",
        modelProvider: "openai",
        specialization: "Verified service procurement",
        systemPolicy: "Use only approved MindPay tools and never initiate a payment.",
        toolBindings: [
          {
            scope: {
              allowedCategories: ["business_research"],
              maximumPriceSubunits: 40_000,
            },
            toolVersionId: "search_verified_services.v1",
          },
          {
            scope: {
              allowedCategories: ["business_research"],
              maximumPriceSubunits: 40_000,
            },
            toolVersionId: "get_verified_service.v1",
          },
          {
            scope: {
              allowedCategories: ["business_research"],
              maximumPriceSubunits: 40_000,
            },
            toolVersionId: "request_signed_offer.v1",
          },
          {
            scope: {
              allowedCategories: ["business_research"],
              maximumPriceSubunits: 40_000,
            },
            toolVersionId: "propose_purchase.v1",
          },
        ],
        version: "1.0.0",
      },
    );
    expect(versionCreation.status).toBe(201);
    const versionResponse = agentResponseSchema.parse(await versionCreation.json());
    const versionId = versionResponse.agent.versions[0]?.id;
    if (versionId === undefined) throw new Error("Agent version was not created");
    const published = await mutation(
      builder,
      `/api/v1/agents/${agentId}/publish`,
      "agent-publish-key-0003",
      { versionId },
    );
    expect(published.status).toBe(200);
    const publication = agentResponseSchema.parse(await published.json());
    expect(publication.agent.currentVersionId).toBe(versionId);
    expect(publication.agent.versions[0]?.publishedAt).toBe(FIXED_NOW.toISOString());
    expect(
      publication.agent.versions[0]?.toolBindings.map((binding) => binding.toolVersionId),
    ).toEqual([
      "get_verified_service.v1",
      "propose_purchase.v1",
      "request_signed_offer.v1",
      "search_verified_services.v1",
    ]);

    await expect(
      database
        .prepare("UPDATE agent_versions SET system_policy = ? WHERE id = ?")
        .bind("This modified policy must be rejected by the database.", versionId)
        .run(),
    ).rejects.toThrow("published agent versions are immutable");
    await expect(
      database.prepare("DELETE FROM agent_versions WHERE id = ?").bind(versionId).run(),
    ).rejects.toThrow("published agent versions are immutable");
    await expect(
      database
        .prepare(
          "INSERT INTO agent_version_tools (agent_version_id, tool_version_id, scope_json) VALUES (?, 'get_transaction_status.v1', '{}')",
        )
        .bind(versionId)
        .run(),
    ).rejects.toThrow("published agent tool bindings are immutable");
    await expect(
      database
        .prepare(
          "UPDATE agent_version_tools SET scope_json = '{}' WHERE agent_version_id = ? AND tool_version_id = 'search_verified_services.v1'",
        )
        .bind(versionId)
        .run(),
    ).rejects.toThrow("published agent tool bindings are immutable");
    await expect(
      database
        .prepare(
          "DELETE FROM agent_version_tools WHERE agent_version_id = ? AND tool_version_id = 'search_verified_services.v1'",
        )
        .bind(versionId)
        .run(),
    ).rejects.toThrow("published agent tool bindings are immutable");
  });

  it("enforces organization isolation, read/write capabilities, and configured encryption", async () => {
    const primaryList = await apiRequest(viewer, "/api/v1/agents", { method: "GET" });
    expect(primaryList.status).toBe(200);
    const primaryBody = (await primaryList.json()) as { agents: { id: string }[] };
    const agentId = primaryBody.agents[0]?.id;
    if (agentId === undefined) throw new Error("Expected a primary organization agent");
    const foreignRead = await apiRequest(
      outsider,
      `/api/v1/agents/${agentId}`,
      { method: "GET" },
      FOREIGN_ORGANIZATION_ID,
    );
    expect(foreignRead.status).toBe(404);

    const deniedWrite = await mutation(viewer, "/api/v1/agents", "agent-viewer-key-0004", {
      description: "A viewer must not be able to create this agent.",
      name: "Denied Agent",
      slug: "denied-agent",
    });
    expect(deniedWrite.status).toBe(403);

    const unavailable = await mutation(
      builder,
      "/api/v1/agents",
      "agent-invalid-key-0005",
      {
        description: "This write must fail before any agent data is stored.",
        name: "Unconfigured Agent",
        slug: "unconfigured-agent",
      },
      PRIMARY_ORGANIZATION_ID,
      { ...bindings, AGENT_KEY_ENCRYPTION_KEY: "invalid" },
    );
    expect(unavailable.status).toBe(500);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "AGENT_KEY_CONFIGURATION_INVALID" },
    });
    await expect(
      database
        .prepare("SELECT count(*) AS count FROM agents WHERE slug = 'unconfigured-agent'")
        .first(),
    ).resolves.toEqual({ count: 0 });
  });

  async function createAuthenticatedUser(
    email: string,
    name: string,
    clientSuffix: number,
  ): Promise<TestUser> {
    const signUp = await authRequest(
      "sign-up/email",
      { body: JSON.stringify({ email, name, password: TEST_PASSWORD }), method: "POST" },
      clientSuffix,
    );
    expect(signUp.status).toBe(200);
    const signIn = await authRequest(
      "sign-in/email",
      { body: JSON.stringify({ email, password: TEST_PASSWORD }), method: "POST" },
      clientSuffix,
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    const user = await database
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (cookie === undefined || user === null) throw new Error("Authentication setup failed");
    return { cookie, id: user.id };
  }

  function authRequest(route: string, init: RequestInit, clientSuffix: number) {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", `203.0.113.${clientSuffix}`);
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      app.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  function apiRequest(
    user: TestUser,
    path: string,
    init: RequestInit,
    organizationId = PRIMARY_ORGANIZATION_ID,
    requestBindings = bindings,
  ) {
    const headers = new Headers(init.headers);
    headers.set("cookie", user.cookie);
    headers.set("origin", FRONTEND_ORIGIN);
    headers.set(ORGANIZATION_CONTEXT_HEADER, organizationId);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    return Promise.resolve(
      app.request(`${AUTH_URL}${path}`, { ...init, headers }, requestBindings),
    );
  }

  function mutation(
    user: TestUser,
    path: string,
    idempotencyKey: string,
    body: unknown,
    organizationId = PRIMARY_ORGANIZATION_ID,
    requestBindings = bindings,
  ) {
    return apiRequest(
      user,
      path,
      {
        body: JSON.stringify(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        method: "POST",
      },
      organizationId,
      requestBindings,
    );
  }
});

function zodCiphertext(envelope: string): string {
  const parsed = JSON.parse(envelope) as { ciphertext?: unknown };
  if (typeof parsed.ciphertext !== "string") throw new Error("Stored key envelope is invalid");
  return parsed.ciphertext;
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
