import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditEvents, readSignedAuditEvents, verifyStoredAuditEvents } from "./audit";
import type { GatewayAuthBindings } from "./auth";
import { createTestDatabase } from "./test-database";

const TRANSACTION_ID = "ctx_01JGFJH700H8M2APVYVDZ4R6A7";
const NOW = new Date("2026-09-05T08:00:00.000Z");

describe("Phase 9 append-only audit store", () => {
  let bindings: GatewayAuthBindings;
  let miniflare: Miniflare;

  beforeAll(async () => {
    const testDatabase = await createTestDatabase("mindpay-phase-09-audit-test");
    miniflare = testDatabase.miniflare;
    bindings = {
      AGENT_KEY_ENCRYPTION_KEY: "A".repeat(43),
      BETTER_AUTH_SECRET: "mindpay-phase-nine-test-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:8787",
      DB: testDatabase.database,
      ENVIRONMENT: "test",
      MINDPAY_API_AUDIENCE: "https://api.mindpay.example/",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: "http://localhost:3100",
    };
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("serializes concurrent appends into unique contiguous signed events", async () => {
    await appendAuditEvents(
      bindings,
      TRANSACTION_ID,
      [
        {
          actor: { id: "usr_01JGFJH000H8M2APVYVDZ4R6A0", type: "USER" },
          eventType: "USER_INTENT_RECEIVED",
          payload: { amount_subunits: 29_900, secret: "never public" },
        },
      ],
      NOW,
    );
    await Promise.all([
      appendAuditEvents(
        bindings,
        TRANSACTION_ID,
        [
          {
            actor: { id: "mindpay_policy", type: "SYSTEM" },
            eventType: "POLICY_EVALUATED",
            payload: { decision: "ALLOW" },
          },
        ],
        new Date(NOW.getTime() + 10),
      ),
      appendAuditEvents(
        bindings,
        TRANSACTION_ID,
        [
          {
            actor: { id: "mindpay_risk", type: "SYSTEM" },
            eventType: "RISK_EVALUATED",
            payload: { outcome: "ALLOW" },
          },
        ],
        new Date(NOW.getTime() + 20),
      ),
    ]);

    const events = await readSignedAuditEvents(bindings.DB, TRANSACTION_ID);
    expect(events.map(({ event }) => event.sequence)).toEqual([0, 1, 2]);
    expect(events[0]?.event.redacted_payload).toMatchObject({ secret: "[REDACTED]" });
    await expect(
      verifyStoredAuditEvents(bindings.DB, TRANSACTION_ID, NOW.getTime() + 100),
    ).resolves.toEqual({ failures: [], valid: true });
    await expect(
      bindings.DB.prepare("UPDATE audit_events SET actor_id = 'attacker' WHERE transaction_id = ?")
        .bind(TRANSACTION_ID)
        .run(),
    ).rejects.toThrow(/append-only/iu);
    await expect(
      bindings.DB.prepare("DELETE FROM audit_events WHERE transaction_id = ?")
        .bind(TRANSACTION_ID)
        .run(),
    ).rejects.toThrow(/append-only/iu);
  });
});
