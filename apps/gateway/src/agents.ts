import {
  AgentKeyConfigurationError,
  createAgentEncryptedSigningKey,
  importAgentKeyEncryptionKey,
} from "@mindpay/agent-runtime";
import {
  type Agent,
  agentConfigurationSchema,
  agentIdSchema,
  agentResponseSchema,
  agentsResponseSchema,
  agentToolBindingSchema,
  apiErrorResponseSchema,
  createAgentRequestSchema,
  createAgentVersionRequestSchema,
  publishAgentVersionRequestSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex, sha256Hex } from "@mindpay/crypto";
import { createUlid, idempotencyKeySchema, utcTimestampFromDate } from "@mindpay/domain";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
  resourceNotFound,
} from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

type AgentMutation = "CREATE_AGENT" | "CREATE_VERSION" | "PUBLISH_VERSION";

interface AgentRouteDependencies {
  readonly now?: () => Date;
}

interface IdempotencyClaim {
  readonly key: string;
  readonly requestHash: string;
  readonly scope: string;
}

const agentRowSchema = z
  .object({
    created_at: z.number().int().nonnegative(),
    created_by: z.string(),
    current_version_id: z.string().nullable(),
    description: z.string(),
    id: z.string(),
    name: z.string(),
    organization_id: z.string(),
    slug: z.string(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    updated_at: z.number().int().nonnegative(),
  })
  .strict();

const agentKeyRowSchema = z
  .object({
    agent_id: z.string(),
    id: z.string(),
    kid: z.string(),
    public_jwk: z.string(),
    revoked_at: z.number().int().nonnegative().nullable(),
    valid_from: z.number().int().nonnegative(),
  })
  .strict();

const agentVersionRowSchema = z
  .object({
    agent_id: z.string(),
    configuration_json: z.string(),
    created_at: z.number().int().nonnegative(),
    id: z.string(),
    model_name: z.string(),
    model_provider: z.string(),
    published_at: z.number().int().nonnegative().nullable(),
    specialization: z.string(),
    system_policy: z.string(),
    system_policy_hash: z.string(),
    verification_status: z.enum(["NOT_RUN", "PASSED", "FAILED"]),
    version: z.string(),
  })
  .strict();

const agentVersionToolRowSchema = z
  .object({
    agent_version_id: z.string(),
    scope_json: z.string(),
    tool_version_id: z.string(),
  })
  .strict();

const idempotencyRowSchema = z
  .object({
    request_hash: z.string(),
    response_body: z.string().nullable(),
    response_status: z.number().int().nullable(),
    state: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  })
  .strict();

export function createAgentRoutes(dependencies: AgentRouteDependencies = {}) {
  const routes = new Hono<GatewayEnvironment>();
  const now = dependencies.now ?? (() => new Date());
  routes.use("*", requireAuthentication);

  routes.get("/", requireOrganizationCapability("agent:read"), async (context) => {
    const organizationId = context.get("organizationAuthorization").organization.id;
    const agents = await readAgents(context.env.DB, organizationId);
    return context.json(agentsResponseSchema.parse({ agents }));
  });

  routes.post("/", requireOrganizationCapability("agent:write"), async (context) => {
    const request = createAgentRequestSchema.safeParse(await readJsonBody(context.req.raw));
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The agent request is invalid.");
    }

    let encryptionKey: CryptoKey;
    try {
      encryptionKey = await importAgentKeyEncryptionKey(context.env.AGENT_KEY_ENCRYPTION_KEY);
    } catch (error) {
      if (!(error instanceof AgentKeyConfigurationError)) throw error;
      return apiError(
        context,
        500,
        "AGENT_KEY_CONFIGURATION_INVALID",
        "Agent signing key encryption is not configured.",
      );
    }

    const claim = await beginMutation(context, "CREATE_AGENT", "new", request.data, 201);
    if (claim instanceof Response) return claim;

    const createdAt = now();
    const agentUlid = createUlid(createdAt.getTime());
    const agentId = `agt_${agentUlid}`;
    const keyId = `aky_${createUlid(createdAt.getTime())}`;
    const kid = `agent.${agentUlid.toLowerCase()}.signing.1`;
    let signingKey: Awaited<ReturnType<typeof createAgentEncryptedSigningKey>>;
    try {
      signingKey = await createAgentEncryptedSigningKey({ agentId, encryptionKey, kid });
    } catch {
      return failMutation(
        context,
        claim,
        500,
        "AGENT_KEY_CONFIGURATION_INVALID",
        "Agent signing key creation failed.",
      );
    }

    const organizationId = context.get("organizationAuthorization").organization.id;
    const principalId = context.get("principal").id;
    const response = agentResponseSchema.parse({
      agent: {
        createdAt: utcTimestampFromDate(createdAt),
        createdBy: principalId,
        currentVersionId: null,
        description: request.data.description,
        id: agentId,
        key: {
          id: keyId,
          kid,
          publicJwk: signingKey.publicJwk,
          revokedAt: null,
          validFrom: utcTimestampFromDate(createdAt),
        },
        name: request.data.name,
        organizationId,
        slug: request.data.slug,
        status: "ACTIVE",
        updatedAt: utcTimestampFromDate(createdAt),
        versions: [],
      },
    });

    try {
      await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT INTO agents
             (id, organization_id, name, slug, description, status, current_version_id,
              created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', NULL, ?, ?, ?)`,
        ).bind(
          agentId,
          organizationId,
          request.data.name,
          request.data.slug,
          request.data.description,
          principalId,
          createdAt.getTime(),
          createdAt.getTime(),
        ),
        context.env.DB.prepare(
          `INSERT INTO agent_keys
             (id, agent_id, kid, public_jwk, encrypted_private_jwk, valid_from, revoked_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        ).bind(
          keyId,
          agentId,
          kid,
          JSON.stringify(signingKey.publicJwk),
          JSON.stringify(signingKey.encryptedPrivateJwk),
          createdAt.getTime(),
          createdAt.getTime(),
        ),
        completeMutationStatement(context, claim, response, 201),
      ]);
    } catch {
      const conflict = await context.env.DB.prepare(
        "SELECT id FROM agents WHERE organization_id = ? AND lower(slug) = lower(?) LIMIT 1",
      )
        .bind(organizationId, request.data.slug)
        .first();
      return failMutation(
        context,
        claim,
        conflict === null ? 500 : 409,
        conflict === null ? "AGENT_STATE_CONFLICT" : "AGENT_ALREADY_EXISTS",
        conflict === null
          ? "The agent could not be created."
          : "An agent with this slug already exists in the organization.",
      );
    }
    return context.json(response, 201);
  });

  routes.get("/:agentId", requireOrganizationCapability("agent:read"), async (context) => {
    const agentId = agentIdSchema.safeParse(context.req.param("agentId"));
    if (!agentId.success) return resourceNotFound(context);
    const organizationId = context.get("organizationAuthorization").organization.id;
    const [agent] = await readAgents(context.env.DB, organizationId, agentId.data);
    if (agent === undefined) return resourceNotFound(context);
    return context.json(agentResponseSchema.parse({ agent }));
  });

  routes.post(
    "/:agentId/versions",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const agentId = agentIdSchema.safeParse(context.req.param("agentId"));
      if (!agentId.success) return resourceNotFound(context);
      const request = createAgentVersionRequestSchema.safeParse(
        await readJsonBody(context.req.raw),
      );
      if (!request.success) {
        return apiError(context, 400, "INVALID_REQUEST", "The agent version request is invalid.");
      }
      const organizationId = context.get("organizationAuthorization").organization.id;
      const [agent] = await readAgents(context.env.DB, organizationId, agentId.data);
      if (agent === undefined) return resourceNotFound(context);
      if (agent.status !== "ACTIVE") {
        return apiError(
          context,
          409,
          "AGENT_STATE_CONFLICT",
          "Archived agents cannot receive new versions.",
        );
      }

      const claim = await beginMutation(context, "CREATE_VERSION", agentId.data, request.data, 201);
      if (claim instanceof Response) return claim;
      const createdAt = now();
      const versionId = `agv_${createUlid(createdAt.getTime())}`;
      const version = {
        agentId: agent.id,
        configuration: request.data.configuration,
        createdAt: utcTimestampFromDate(createdAt),
        id: versionId,
        modelName: request.data.modelName,
        modelProvider: request.data.modelProvider,
        publishedAt: null,
        specialization: request.data.specialization,
        systemPolicy: request.data.systemPolicy,
        systemPolicyHash: await sha256Hex(request.data.systemPolicy),
        toolBindings: request.data.toolBindings,
        verificationStatus: "NOT_RUN" as const,
        version: request.data.version,
      };
      const response = agentResponseSchema.parse({
        agent: {
          ...agent,
          updatedAt: utcTimestampFromDate(createdAt),
          versions: [...agent.versions, version],
        },
      });
      try {
        await context.env.DB.batch([
          context.env.DB.prepare(
            `INSERT INTO agent_versions
               (id, agent_id, version, model_provider, model_name, system_policy,
                system_policy_hash, specialization, configuration_json, verification_status,
                published_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_RUN', NULL, ?)`,
          ).bind(
            versionId,
            agent.id,
            request.data.version,
            request.data.modelProvider,
            request.data.modelName,
            request.data.systemPolicy,
            version.systemPolicyHash,
            request.data.specialization,
            JSON.stringify(request.data.configuration),
            createdAt.getTime(),
          ),
          ...request.data.toolBindings.map((binding) =>
            context.env.DB.prepare(
              "INSERT INTO agent_version_tools (agent_version_id, tool_version_id, scope_json) VALUES (?, ?, ?)",
            ).bind(versionId, binding.toolVersionId, JSON.stringify(binding.scope)),
          ),
          context.env.DB.prepare(
            "UPDATE agents SET updated_at = ? WHERE id = ? AND organization_id = ?",
          ).bind(createdAt.getTime(), agent.id, organizationId),
          completeMutationStatement(context, claim, response, 201),
        ]);
      } catch {
        return failMutation(
          context,
          claim,
          409,
          "AGENT_VERSION_CONFLICT",
          "This agent version already exists or the agent changed.",
        );
      }
      return context.json(response, 201);
    },
  );

  routes.post(
    "/:agentId/publish",
    requireOrganizationCapability("agent:write"),
    async (context) => {
      const agentId = agentIdSchema.safeParse(context.req.param("agentId"));
      if (!agentId.success) return resourceNotFound(context);
      const request = publishAgentVersionRequestSchema.safeParse(
        await readJsonBody(context.req.raw),
      );
      if (!request.success) {
        return apiError(context, 400, "INVALID_REQUEST", "The publication request is invalid.");
      }
      const organizationId = context.get("organizationAuthorization").organization.id;
      const [agent] = await readAgents(context.env.DB, organizationId, agentId.data);
      if (agent === undefined) return resourceNotFound(context);
      const selectedVersion = agent.versions.find(
        (version) => version.id === request.data.versionId,
      );
      if (selectedVersion === undefined) return resourceNotFound(context);
      if (agent.status !== "ACTIVE") {
        return apiError(
          context,
          409,
          "AGENT_STATE_CONFLICT",
          "Archived agents cannot be published.",
        );
      }

      const claim = await beginMutation(
        context,
        "PUBLISH_VERSION",
        agentId.data,
        request.data,
        200,
      );
      if (claim instanceof Response) return claim;
      const publishedAt = now();
      const timestamp = utcTimestampFromDate(publishedAt);
      const response = agentResponseSchema.parse({
        agent: {
          ...agent,
          currentVersionId: selectedVersion.id,
          updatedAt: timestamp,
          versions: agent.versions.map((version) =>
            version.id === selectedVersion.id && version.publishedAt === null
              ? { ...version, publishedAt: timestamp }
              : version,
          ),
        },
      });
      try {
        await context.env.DB.batch([
          context.env.DB.prepare(
            "UPDATE agent_versions SET published_at = ? WHERE id = ? AND agent_id = ? AND published_at IS NULL",
          ).bind(publishedAt.getTime(), selectedVersion.id, agent.id),
          context.env.DB.prepare(
            "UPDATE agents SET current_version_id = ?, updated_at = ? WHERE id = ? AND organization_id = ?",
          ).bind(selectedVersion.id, publishedAt.getTime(), agent.id, organizationId),
          completeMutationStatement(context, claim, response, 200),
        ]);
      } catch {
        return failMutation(
          context,
          claim,
          409,
          "AGENT_STATE_CONFLICT",
          "The agent version could not be published.",
        );
      }
      return context.json(response);
    },
  );

  return routes;
}

async function readAgents(database: D1Database, organizationId: string, agentId?: string) {
  const agentFilter = agentId === undefined ? "" : " AND id = ?";
  const bindings = agentId === undefined ? [organizationId] : [organizationId, agentId];
  const agentResult = await database
    .prepare(
      `SELECT id, organization_id, name, slug, description, status, current_version_id,
       created_by, created_at, updated_at FROM agents
       WHERE organization_id = ?${agentFilter} ORDER BY lower(name), id`,
    )
    .bind(...bindings)
    .all();
  const rows = agentResult.results.map((row) => agentRowSchema.parse(row));
  if (rows.length === 0) return [];

  const joinedFilter = agentId === undefined ? "" : " AND a.id = ?";
  const [keyResult, versionResult, toolResult] = await Promise.all([
    database
      .prepare(
        `SELECT k.agent_id, k.id, k.kid, k.public_jwk, k.valid_from, k.revoked_at
         FROM agent_keys k JOIN agents a ON a.id = k.agent_id
         WHERE a.organization_id = ? AND k.revoked_at IS NULL${joinedFilter}
         ORDER BY k.valid_from DESC, k.id DESC`,
      )
      .bind(...bindings)
      .all(),
    database
      .prepare(
        `SELECT v.id, v.agent_id, v.version, v.model_provider, v.model_name, v.system_policy,
         v.system_policy_hash, v.specialization, v.configuration_json, v.verification_status,
         v.published_at, v.created_at FROM agent_versions v JOIN agents a ON a.id = v.agent_id
         WHERE a.organization_id = ?${joinedFilter} ORDER BY v.created_at, v.id`,
      )
      .bind(...bindings)
      .all(),
    database
      .prepare(
        `SELECT t.agent_version_id, t.tool_version_id, t.scope_json
         FROM agent_version_tools t JOIN agent_versions v ON v.id = t.agent_version_id
         JOIN agents a ON a.id = v.agent_id
         WHERE a.organization_id = ?${joinedFilter} ORDER BY t.tool_version_id`,
      )
      .bind(...bindings)
      .all(),
  ]);

  const keys = new Map<string, z.infer<typeof agentKeyRowSchema>>();
  for (const untrusted of keyResult.results) {
    const key = agentKeyRowSchema.parse(untrusted);
    if (!keys.has(key.agent_id)) keys.set(key.agent_id, key);
  }
  const tools = new Map<string, z.infer<typeof agentVersionToolRowSchema>[]>();
  for (const untrusted of toolResult.results) {
    const tool = agentVersionToolRowSchema.parse(untrusted);
    const bindingsForVersion = tools.get(tool.agent_version_id) ?? [];
    bindingsForVersion.push(tool);
    tools.set(tool.agent_version_id, bindingsForVersion);
  }
  const versions = new Map<string, Agent["versions"]>();
  for (const untrusted of versionResult.results) {
    const version = agentVersionRowSchema.parse(untrusted);
    const agentVersions = versions.get(version.agent_id) ?? [];
    versions.set(version.agent_id, [
      ...agentVersions,
      {
        agentId: version.agent_id,
        configuration: parseConfiguration(version.configuration_json),
        createdAt: timestamp(version.created_at),
        id: version.id,
        modelName: version.model_name,
        modelProvider: version.model_provider,
        publishedAt: version.published_at === null ? null : timestamp(version.published_at),
        specialization: version.specialization,
        systemPolicy: version.system_policy,
        systemPolicyHash: version.system_policy_hash,
        toolBindings: (tools.get(version.id) ?? []).map((tool) =>
          agentToolBindingSchema.parse({
            scope: parseJson(tool.scope_json),
            toolVersionId: tool.tool_version_id,
          }),
        ),
        verificationStatus: version.verification_status,
        version: version.version,
      },
    ]);
  }

  return rows.map((row) => {
    const key = keys.get(row.id);
    if (key === undefined) throw new Error("Agent has no active signing key");
    return agentResponseSchema.parse({
      agent: {
        createdAt: timestamp(row.created_at),
        createdBy: row.created_by,
        currentVersionId: row.current_version_id,
        description: row.description,
        id: row.id,
        key: {
          id: key.id,
          kid: key.kid,
          publicJwk: parseJson(key.public_jwk),
          revokedAt: key.revoked_at === null ? null : timestamp(key.revoked_at),
          validFrom: timestamp(key.valid_from),
        },
        name: row.name,
        organizationId: row.organization_id,
        slug: row.slug,
        status: row.status,
        updatedAt: timestamp(row.updated_at),
        versions: versions.get(row.id) ?? [],
      },
    }).agent;
  });
}

async function beginMutation(
  context: Context<GatewayEnvironment>,
  operation: AgentMutation,
  entityId: string,
  body: unknown,
  successStatus: 200 | 201,
): Promise<IdempotencyClaim | Response> {
  const key = idempotencyKeySchema.safeParse(context.req.header(IDEMPOTENCY_KEY_HEADER));
  if (!key.success) {
    return apiError(
      context,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      `A valid ${IDEMPOTENCY_KEY_HEADER} header is required.`,
    );
  }
  const organizationId = context.get("organizationAuthorization").organization.id;
  const actorId = context.get("principal").id;
  const scope = `agent:${operation.toLowerCase()}:${organizationId}:${actorId}:${entityId}`;
  const requestHash = await sha256CanonicalJsonHex({ body, entityId, operation, organizationId });
  const now = Date.now();
  await context.env.DB.prepare(
    "DELETE FROM idempotency_records WHERE scope = ? AND key = ? AND expires_at <= ?",
  )
    .bind(scope, key.data, now)
    .run();
  const inserted = await context.env.DB.prepare(
    `INSERT OR IGNORE INTO idempotency_records
     (scope, key, request_hash, state, expires_at, created_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
  )
    .bind(scope, key.data, requestHash, now + IDEMPOTENCY_TTL_MS, now)
    .run();
  if ((inserted.meta.changes ?? 0) > 0) return { key: key.data, requestHash, scope };

  const record = await context.env.DB.prepare(
    "SELECT request_hash, response_status, response_body, state FROM idempotency_records WHERE scope = ? AND key = ?",
  )
    .bind(scope, key.data)
    .first();
  if (record === null) {
    return apiError(
      context,
      409,
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "The idempotent request is still in progress.",
    );
  }
  const parsed = idempotencyRowSchema.parse(record);
  if (parsed.request_hash !== requestHash) {
    return apiError(
      context,
      409,
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used with a different request.",
    );
  }
  if (parsed.state === "PENDING") {
    return apiError(
      context,
      409,
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "The idempotent request is still in progress.",
    );
  }
  if (parsed.response_body === null || parsed.response_status === null) {
    return apiError(context, 500, "AGENT_STATE_CONFLICT", "The stored agent response is invalid.");
  }
  const storedBody = JSON.parse(parsed.response_body) as unknown;
  if (parsed.state === "FAILED") {
    return context.json(
      apiErrorResponseSchema.parse(storedBody),
      parsed.response_status as 409 | 500,
    );
  }
  return context.json(agentResponseSchema.parse(storedBody), successStatus);
}

function completeMutationStatement(
  context: Context<GatewayEnvironment>,
  claim: IdempotencyClaim,
  response: ReturnType<typeof agentResponseSchema.parse>,
  status: 200 | 201,
) {
  return context.env.DB.prepare(
    `UPDATE idempotency_records SET response_status = ?, response_body = ?, state = 'COMPLETED'
     WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'`,
  ).bind(status, JSON.stringify(response), claim.scope, claim.key, claim.requestHash);
}

async function failMutation(
  context: Context<GatewayEnvironment>,
  claim: IdempotencyClaim,
  status: 409 | 500,
  code:
    | "AGENT_ALREADY_EXISTS"
    | "AGENT_KEY_CONFIGURATION_INVALID"
    | "AGENT_STATE_CONFLICT"
    | "AGENT_VERSION_CONFLICT",
  message: string,
) {
  const response = apiErrorResponseSchema.parse({ error: { code, message } });
  await context.env.DB.prepare(
    `UPDATE idempotency_records SET response_status = ?, response_body = ?, state = 'FAILED'
     WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'`,
  )
    .bind(status, JSON.stringify(response), claim.scope, claim.key, claim.requestHash)
    .run();
  return context.json(response, status);
}

function timestamp(epochMs: number) {
  return utcTimestampFromDate(new Date(epochMs));
}

function parseJson(value: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  return z.record(z.string(), z.unknown()).parse(parsed);
}

function parseConfiguration(value: string) {
  return agentConfigurationSchema.parse(JSON.parse(value) as unknown);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
