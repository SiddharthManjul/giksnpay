import {
  apiErrorResponseSchema,
  createOrganizationAccess,
  provisionDemoWorkspaceRequestSchema,
  provisionDemoWorkspaceResponseSchema,
} from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createMindPayDatabase, idempotencyRecords } from "@mindpay/db";
import { createUlid, idempotencyKeySchema, utcTimestampFromDate } from "@mindpay/domain";
import { and, eq, lte } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { apiError, type GatewayEnvironment, requireAuthentication } from "./authorization";

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const DEMO_WORKSPACE_TTL_MS = 24 * 60 * 60 * 1_000;

const DEMO_WORKSPACE_IDEMPOTENCY_SCOPE = "demo-workspace:provision";
const DEFAULT_DEMO_WORKSPACE_NAME = "MindPay Demo Workspace";

interface DemoWorkspaceRouteDependencies {
  readonly now?: () => Date;
  readonly wait?: (durationMs: number) => Promise<void>;
}

export function createDemoWorkspaceRoutes(dependencies: DemoWorkspaceRouteDependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const wait = dependencies.wait ?? waitFor;
  const routes = new Hono<GatewayEnvironment>();

  routes.use("*", requireAuthentication);
  routes.post("/", async (context) => {
    const request = provisionDemoWorkspaceRequestSchema.safeParse(
      await readOptionalJsonBody(context.req.raw),
    );
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The demo workspace request is invalid.");
    }

    const idempotencyKey = idempotencyKeySchema.safeParse(
      context.req.header(IDEMPOTENCY_KEY_HEADER),
    );
    if (!idempotencyKey.success) {
      return apiError(
        context,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        `A valid ${IDEMPOTENCY_KEY_HEADER} header is required.`,
      );
    }

    const principal = context.get("principal");
    const createdAt = now();
    const scope = `${DEMO_WORKSPACE_IDEMPOTENCY_SCOPE}:${principal.id}`;
    const requestHash = await sha256CanonicalJsonHex({
      operation: DEMO_WORKSPACE_IDEMPOTENCY_SCOPE,
      request: request.data,
      userId: principal.id,
    });
    const database = createMindPayDatabase(context.env.DB);

    await database
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.key, idempotencyKey.data),
          lte(idempotencyRecords.expiresAt, createdAt),
        ),
      );

    const claimed = await database
      .insert(idempotencyRecords)
      .values({
        createdAt,
        expiresAt: new Date(createdAt.getTime() + DEMO_WORKSPACE_TTL_MS),
        key: idempotencyKey.data,
        requestHash,
        scope,
        state: "PENDING",
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyRecords.key });

    if (claimed.length === 0) {
      return replayIdempotentResponse(context, scope, idempotencyKey.data, requestHash, wait);
    }

    const organizationUlid = createUlid(createdAt.getTime());
    const organizationId = `org_${organizationUlid}`;
    const expiresAt = new Date(createdAt.getTime() + DEMO_WORKSPACE_TTL_MS);
    const response = provisionDemoWorkspaceResponseSchema.parse({
      workspace: {
        access: createOrganizationAccess("OWNER"),
        createdAt: utcTimestampFromDate(createdAt),
        expiresAt: utcTimestampFromDate(expiresAt),
        organization: {
          id: organizationId,
          name: request.data.name ?? DEFAULT_DEMO_WORKSPACE_NAME,
          slug: `demo-${organizationUlid.toLowerCase()}`,
          status: "ACTIVE",
        },
      },
    });

    try {
      await context.env.DB.batch([
        context.env.DB.prepare(
          "INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)",
        ).bind(
          response.workspace.organization.id,
          response.workspace.organization.name,
          response.workspace.organization.slug,
          createdAt.getTime(),
          createdAt.getTime(),
        ),
        context.env.DB.prepare(
          "INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'OWNER', ?)",
        ).bind(response.workspace.organization.id, principal.id, createdAt.getTime()),
        context.env.DB.prepare(
          "INSERT INTO demo_workspaces (organization_id, expires_at, created_at) VALUES (?, ?, ?)",
        ).bind(response.workspace.organization.id, expiresAt.getTime(), createdAt.getTime()),
        context.env.DB.prepare(
          "UPDATE idempotency_records SET response_status = 201, response_body = ?, state = 'COMPLETED' WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'",
        ).bind(JSON.stringify(response), scope, idempotencyKey.data, requestHash),
      ]);
    } catch {
      const failure = provisioningFailure();
      await database
        .update(idempotencyRecords)
        .set({ responseBody: failure, responseStatus: 500, state: "FAILED" })
        .where(
          and(
            eq(idempotencyRecords.scope, scope),
            eq(idempotencyRecords.key, idempotencyKey.data),
            eq(idempotencyRecords.requestHash, requestHash),
            eq(idempotencyRecords.state, "PENDING"),
          ),
        );
      return context.json(failure, 500);
    }

    return context.json(response, 201);
  });

  return routes;
}

export const demoWorkspaceRoutes = createDemoWorkspaceRoutes();

async function replayIdempotentResponse(
  context: Context<GatewayEnvironment>,
  scope: string,
  key: string,
  requestHash: string,
  wait: (durationMs: number) => Promise<void>,
) {
  const database = createMindPayDatabase(context.env.DB);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await wait(attempt * 5);
    }
    const [record] = await database
      .select()
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.scope, scope), eq(idempotencyRecords.key, key)))
      .limit(1);

    if (record === undefined) {
      continue;
    }
    if (record.requestHash !== requestHash) {
      return apiError(
        context,
        409,
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with a different request.",
      );
    }
    if (record.state === "PENDING") {
      continue;
    }
    if (record.state === "FAILED") {
      return context.json(apiErrorResponseSchema.parse(record.responseBody), 500);
    }

    return context.json(provisionDemoWorkspaceResponseSchema.parse(record.responseBody), 201);
  }

  return apiError(
    context,
    409,
    "IDEMPOTENCY_REQUEST_IN_PROGRESS",
    "The idempotent request is still in progress.",
  );
}

function provisioningFailure() {
  return apiErrorResponseSchema.parse({
    error: {
      code: "DEMO_WORKSPACE_PROVISIONING_FAILED",
      message: "The demo workspace could not be provisioned.",
    },
  });
}

async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function waitFor(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
