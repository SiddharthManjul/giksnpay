import type { ApiErrorCode } from "@mindpay/contracts";
import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { idempotencyKeySchema } from "@mindpay/domain";
import type { Context } from "hono";
import { z } from "zod";
import { apiError, type GatewayEnvironment } from "./authorization";
import { IDEMPOTENCY_KEY_HEADER } from "./demo-workspaces";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export interface IdempotencyClaim {
  readonly key: string;
  readonly requestHash: string;
  readonly scope: string;
}

const storedMutationSchema = z
  .object({
    request_hash: z.string(),
    response_body: z.string().nullable(),
    response_status: z.number().int().nullable(),
    state: z.enum(["COMPLETED", "FAILED", "PENDING"]),
  })
  .strict();

export async function beginIdempotentMutation(
  context: Context<GatewayEnvironment>,
  operation: string,
  entityId: string,
  body: unknown,
  nowEpochMs: number,
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
  const scopeIdentityHash = await sha256CanonicalJsonHex({
    actorId,
    entityId,
    operation,
    organizationId,
  });
  const scope = `phase6:${operation}:${scopeIdentityHash}`;
  const requestHash = await sha256CanonicalJsonHex({ body, entityId, operation, organizationId });
  await context.env.DB.prepare(
    "DELETE FROM idempotency_records WHERE scope = ? AND key = ? AND expires_at <= ?",
  )
    .bind(scope, key.data, nowEpochMs)
    .run();
  const inserted = await context.env.DB.prepare(
    `INSERT OR IGNORE INTO idempotency_records
     (scope, key, request_hash, state, expires_at, created_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
  )
    .bind(scope, key.data, requestHash, nowEpochMs + IDEMPOTENCY_TTL_MS, nowEpochMs)
    .run();
  if ((inserted.meta.changes ?? 0) === 1) {
    return Object.freeze({ key: key.data, requestHash, scope });
  }

  const untrusted = await context.env.DB.prepare(
    "SELECT request_hash, response_status, response_body, state FROM idempotency_records WHERE scope = ? AND key = ?",
  )
    .bind(scope, key.data)
    .first();
  if (untrusted === null) {
    return apiError(context, 409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "The request is in progress.");
  }
  const record = storedMutationSchema.parse(untrusted);
  if (record.request_hash !== requestHash) {
    return apiError(
      context,
      409,
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used with different input.",
    );
  }
  if (record.state === "PENDING") {
    return apiError(context, 409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "The request is in progress.");
  }
  if (record.response_body === null || record.response_status === null) {
    return apiError(context, 500, "TRANSACTION_STATE_CONFLICT", "The stored response is invalid.");
  }
  return new Response(record.response_body, {
    headers: { "content-type": "application/json; charset=UTF-8" },
    status: record.response_status,
  });
}

export async function completeIdempotentMutation(
  context: Context<GatewayEnvironment>,
  claim: IdempotencyClaim,
  status: number,
  body: unknown,
  failed = false,
): Promise<Response> {
  const responseBody = JSON.stringify(body);
  const updated = await context.env.DB.prepare(
    `UPDATE idempotency_records SET response_status = ?, response_body = ?, state = ?
     WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'`,
  )
    .bind(
      status,
      responseBody,
      failed ? "FAILED" : "COMPLETED",
      claim.scope,
      claim.key,
      claim.requestHash,
    )
    .run();
  if ((updated.meta.changes ?? 0) !== 1) {
    return apiError(context, 409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "The request is in progress.");
  }
  return new Response(responseBody, {
    headers: { "content-type": "application/json; charset=UTF-8" },
    status,
  });
}

export async function failIdempotentMutation(
  context: Context<GatewayEnvironment>,
  claim: IdempotencyClaim,
  status: 400 | 403 | 404 | 409 | 500 | 502,
  code: ApiErrorCode,
  message: string,
): Promise<Response> {
  return completeIdempotentMutation(context, claim, status, { error: { code, message } }, true);
}
