import { AesGcmDecryptionError, signCanonicalJsonEs256 } from "@mindpay/crypto";
import { describe, expect, it } from "vitest";
import {
  AgentKeyConfigurationError,
  createAgentEncryptedSigningKey,
  importAgentKeyEncryptionKey,
  loadAgentPrivateSigningKey,
} from "./signing-keys";

const AGENT_ID = "agt_01JGFJH900H8M2APVYVDZ4R6AA";
const KID = "agent.research.2026-01";

describe("agent encrypted signing keys", () => {
  it("encrypts private material and loads a non-extractable signing key", async () => {
    const encryptionKey = await importAgentKeyEncryptionKey("A".repeat(43));
    const stored = await createAgentEncryptedSigningKey({
      agentId: AGENT_ID,
      encryptionKey,
      kid: KID,
    });
    expect(stored.publicJwk).not.toHaveProperty("d");
    expect(JSON.stringify(stored.encryptedPrivateJwk)).not.toContain('"d"');
    const privateKey = await loadAgentPrivateSigningKey({
      agentId: AGENT_ID,
      encryptedPrivateJwk: stored.encryptedPrivateJwk,
      encryptionKey,
      kid: KID,
    });
    expect(privateKey.extractable).toBe(false);
    await expect(
      signCanonicalJsonEs256(
        { purpose: "agent-key-test" },
        { kid: KID, privateKey, validFromEpochMs: 0 },
        1,
      ),
    ).resolves.toMatchObject({ alg: "ES256", kid: KID });
  });

  it("fails closed for missing configuration, the wrong secret, or changed ownership context", async () => {
    await expect(importAgentKeyEncryptionKey("short")).rejects.toBeInstanceOf(
      AgentKeyConfigurationError,
    );
    const encryptionKey = await importAgentKeyEncryptionKey("A".repeat(43));
    const wrongKey = await importAgentKeyEncryptionKey(`${"A".repeat(42)}Q`);
    const stored = await createAgentEncryptedSigningKey({
      agentId: AGENT_ID,
      encryptionKey,
      kid: KID,
    });
    await expect(
      loadAgentPrivateSigningKey({
        agentId: AGENT_ID,
        encryptedPrivateJwk: stored.encryptedPrivateJwk,
        encryptionKey: wrongKey,
        kid: KID,
      }),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
    await expect(
      loadAgentPrivateSigningKey({
        agentId: "agt_01JGFJH900H8M2APVYVDZ4R6AB",
        encryptedPrivateJwk: stored.encryptedPrivateJwk,
        encryptionKey,
        kid: KID,
      }),
    ).rejects.toBeInstanceOf(AesGcmDecryptionError);
  });
});
