import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AGENT_MODEL_MAX_OUTPUT_TOKENS,
  AGENT_MODEL_ORGANIZATION_TOKEN_BUDGET_PER_MINUTE,
  AGENT_MODEL_USER_TOKEN_BUDGET_PER_MINUTE,
  acquireAgentModelCapacity,
} from "./agent-model-capacity";
import { createTestDatabase } from "./test-database";

const NOW = Date.parse("2026-09-02T08:00:00.000Z");

describe("agent model capacity guard", () => {
  let database: D1Database;
  let miniflare: Miniflare;

  beforeAll(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-agent-model-capacity-test"));
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("enforces one active model run per organization and releases the lease", async () => {
    const competing = await Promise.all([
      acquire("org_capacity_1", "usr_capacity_1", 512),
      acquire("org_capacity_1", "usr_capacity_2", 512),
    ]);
    expect(competing.filter((capacity) => capacity !== null)).toHaveLength(1);
    expect(competing.filter((capacity) => capacity === null)).toHaveLength(1);

    const active = competing.find((capacity) => capacity !== null);
    const activeUserId = competing[0] === active ? "usr_capacity_1" : "usr_capacity_2";
    await active?.release();
    const afterRelease = await acquire("org_capacity_1", "usr_capacity_2", 512);
    expect(afterRelease).not.toBeNull();
    await afterRelease?.release();

    const perUser = await acquire("org_capacity_2", activeUserId, 512);
    expect(perUser).not.toBeNull();
    const sameUserOtherOrganization = await acquire("org_capacity_3", activeUserId, 512);
    expect(sameUserOtherOrganization).toBeNull();
    await perUser?.release();
  });

  it("reserves bounded user and organization output-token budgets atomically", async () => {
    const perRunReservation = AGENT_MODEL_MAX_OUTPUT_TOKENS + 1_024;
    expect(AGENT_MODEL_USER_TOKEN_BUDGET_PER_MINUTE).toBe(perRunReservation * 2);
    expect(AGENT_MODEL_ORGANIZATION_TOKEN_BUDGET_PER_MINUTE).toBe(perRunReservation * 4);

    const first = await acquire("org_budget_1", "usr_budget_1", 32_768);
    expect(first).toMatchObject({
      explanationMaxOutputTokens: 1_024,
      initialMaxOutputTokens: AGENT_MODEL_MAX_OUTPUT_TOKENS,
    });
    await first?.release();
    const second = await acquire("org_budget_1", "usr_budget_1", 32_768);
    expect(second).not.toBeNull();
    await second?.release();
    const denied = await acquire("org_budget_1", "usr_budget_1", 32_768);
    expect(denied).toBeNull();
  });

  it("provides a server-owned abort deadline", async () => {
    const capacity = await acquireAgentModelCapacity({
      database,
      nowEpochMs: NOW,
      organizationId: "org_deadline_1",
      requestedMaxOutputTokens: 512,
      timeoutMs: 5,
      userId: "usr_deadline_1",
    });
    expect(capacity).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(capacity?.abortSignal.aborted).toBe(true);
    await capacity?.release();
  });

  function acquire(organizationId: string, userId: string, requestedMaxOutputTokens: number) {
    return acquireAgentModelCapacity({
      database,
      nowEpochMs: NOW,
      organizationId,
      requestedMaxOutputTokens,
      userId,
    });
  }
});
