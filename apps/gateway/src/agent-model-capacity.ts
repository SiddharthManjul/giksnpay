import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { createUlid } from "@mindpay/domain";

export const AGENT_MODEL_MAX_OUTPUT_TOKENS = 2_048;
export const AGENT_MODEL_EXPLANATION_MAX_OUTPUT_TOKENS = 1_024;
export const AGENT_MODEL_DEADLINE_MS = 45_000;
export const AGENT_MODEL_USER_TOKEN_BUDGET_PER_MINUTE = 6_144;
export const AGENT_MODEL_ORGANIZATION_TOKEN_BUDGET_PER_MINUTE = 12_288;

const MODEL_CAPACITY_LEASE_MS = 2 * AGENT_MODEL_DEADLINE_MS;
const MODEL_BUDGET_WINDOW_MS = 60_000;
const MODEL_BUDGET_RETENTION_MS = 5 * MODEL_BUDGET_WINDOW_MS;

export interface AgentModelCapacity {
  readonly abortSignal: AbortSignal;
  readonly explanationMaxOutputTokens: number;
  readonly initialMaxOutputTokens: number;
  release(): Promise<void>;
}

interface AcquireAgentModelCapacityInput {
  readonly database: D1Database;
  readonly nowEpochMs: number;
  readonly organizationId: string;
  readonly requestedMaxOutputTokens: number;
  readonly timeoutMs?: number;
  readonly userId: string;
}

export async function acquireAgentModelCapacity(
  input: AcquireAgentModelCapacityInput,
): Promise<AgentModelCapacity | null> {
  const initialMaxOutputTokens = Math.min(
    assertRequestedMaxOutputTokens(input.requestedMaxOutputTokens),
    AGENT_MODEL_MAX_OUTPUT_TOKENS,
  );
  const explanationMaxOutputTokens = Math.min(
    initialMaxOutputTokens,
    AGENT_MODEL_EXPLANATION_MAX_OUTPUT_TOKENS,
  );
  const reservedOutputTokens = initialMaxOutputTokens + explanationMaxOutputTokens;
  const timeoutMs = assertTimeout(input.timeoutMs ?? AGENT_MODEL_DEADLINE_MS);
  const userScopeHash = await sha256CanonicalJsonHex({ userId: input.userId });
  const userLeaseKey = `mindpay:model:concurrency:user:${userScopeHash}`;
  const organizationLeaseKey = `mindpay:model:concurrency:organization:${input.organizationId}`;
  const userLeaseId = `model_${createUlid(input.nowEpochMs)}`;
  const organizationLeaseId = `model_${createUlid(input.nowEpochMs)}`;
  const leaseExpiresAt = input.nowEpochMs + MODEL_CAPACITY_LEASE_MS;
  const userLeaseAcquired = await acquireLease(
    input.database,
    userLeaseKey,
    userLeaseId,
    input.nowEpochMs,
    leaseExpiresAt,
  );
  if (!userLeaseAcquired) return null;
  let organizationLeaseAcquired: boolean;
  try {
    organizationLeaseAcquired = await acquireLease(
      input.database,
      organizationLeaseKey,
      organizationLeaseId,
      input.nowEpochMs,
      leaseExpiresAt,
    );
  } catch (error) {
    await releaseLeases(
      input.database,
      userLeaseId,
      userLeaseKey,
      organizationLeaseId,
      organizationLeaseKey,
    ).catch(() => undefined);
    throw error;
  }
  if (!organizationLeaseAcquired) {
    await releaseLeases(
      input.database,
      userLeaseId,
      userLeaseKey,
      organizationLeaseId,
      organizationLeaseKey,
    );
    return null;
  }

  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await releaseLeases(
      input.database,
      userLeaseId,
      userLeaseKey,
      organizationLeaseId,
      organizationLeaseKey,
    );
  };

  try {
    await input.database
      .prepare("DELETE FROM agent_model_usage_windows WHERE window_started_at < ?")
      .bind(input.nowEpochMs - MODEL_BUDGET_RETENTION_MS)
      .run();
    const windowStartedAt =
      Math.floor(input.nowEpochMs / MODEL_BUDGET_WINDOW_MS) * MODEL_BUDGET_WINDOW_MS;
    const userAllowed = await reserveTokenBudget(
      input.database,
      `mindpay:model:budget:user:${userScopeHash}:${windowStartedAt}`,
      reservedOutputTokens,
      AGENT_MODEL_USER_TOKEN_BUDGET_PER_MINUTE,
      windowStartedAt,
    );
    if (!userAllowed) {
      await release();
      return null;
    }
    const organizationAllowed = await reserveTokenBudget(
      input.database,
      `mindpay:model:budget:organization:${input.organizationId}:${windowStartedAt}`,
      reservedOutputTokens,
      AGENT_MODEL_ORGANIZATION_TOKEN_BUDGET_PER_MINUTE,
      windowStartedAt,
    );
    if (!organizationAllowed) {
      await release();
      return null;
    }

    return Object.freeze({
      abortSignal: AbortSignal.timeout(timeoutMs),
      explanationMaxOutputTokens,
      initialMaxOutputTokens,
      release,
    });
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}

async function acquireLease(
  database: D1Database,
  key: string,
  leaseId: string,
  nowEpochMs: number,
  leaseExpiresAt: number,
): Promise<boolean> {
  const row = await database
    .prepare(
      `INSERT INTO agent_model_capacity_leases (key, lease_id, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         lease_id = excluded.lease_id,
         expires_at = excluded.expires_at
       WHERE agent_model_capacity_leases.expires_at <= ?
       RETURNING lease_id`,
    )
    .bind(key, leaseId, leaseExpiresAt, nowEpochMs)
    .first<{ lease_id: string }>();
  return row?.lease_id === leaseId;
}

async function releaseLeases(
  database: D1Database,
  userLeaseId: string,
  userLeaseKey: string,
  organizationLeaseId: string,
  organizationLeaseKey: string,
): Promise<void> {
  await database
    .prepare(
      `DELETE FROM agent_model_capacity_leases
       WHERE (lease_id = ? AND key = ?) OR (lease_id = ? AND key = ?)`,
    )
    .bind(userLeaseId, userLeaseKey, organizationLeaseId, organizationLeaseKey)
    .run();
}

async function reserveTokenBudget(
  database: D1Database,
  key: string,
  requestedTokens: number,
  limit: number,
  windowStartedAt: number,
): Promise<boolean> {
  const row = await database
    .prepare(
      `INSERT INTO agent_model_usage_windows (key, used_tokens, window_started_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         used_tokens = agent_model_usage_windows.used_tokens + excluded.used_tokens
       WHERE agent_model_usage_windows.used_tokens + excluded.used_tokens <= ?
       RETURNING used_tokens`,
    )
    .bind(key, requestedTokens, windowStartedAt, limit)
    .first<{ used_tokens: number }>();
  return row !== null;
}

function assertRequestedMaxOutputTokens(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("The requested model output-token limit is invalid");
  }
  return value;
}

function assertTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MODEL_CAPACITY_LEASE_MS) {
    throw new Error("The model deadline is invalid");
  }
  return value;
}
