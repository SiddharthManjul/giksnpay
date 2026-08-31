import { agentKeyEncryptionSecretSchema } from "@mindpay/config";
import { agentIdSchema, type Es256PublicJwk, es256PublicJwkSchema } from "@mindpay/contracts";
import {
  type AesGcmEnvelope,
  base64UrlToBytes,
  decryptEs256PrivateJwk,
  encryptEs256PrivateJwk,
  exportEs256PrivateJwk,
  exportEs256PublicJwk,
  generateEs256KeyPair,
  importAesGcmKey,
  importEs256PrivateJwk,
} from "@mindpay/crypto";
import { z } from "zod";

const keyIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u);

export interface AgentEncryptedSigningKey {
  readonly encryptedPrivateJwk: AesGcmEnvelope;
  readonly kid: string;
  readonly publicJwk: Es256PublicJwk;
}

export class AgentKeyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentKeyConfigurationError";
  }
}

export async function importAgentKeyEncryptionKey(secret: unknown): Promise<CryptoKey> {
  const parsed = agentKeyEncryptionSecretSchema.safeParse(secret);
  if (!parsed.success) {
    throw new AgentKeyConfigurationError("Agent key encryption secret is invalid");
  }
  return importAesGcmKey(base64UrlToBytes(parsed.data));
}

export async function createAgentEncryptedSigningKey(input: {
  readonly agentId: string;
  readonly encryptionKey: CryptoKey;
  readonly kid: string;
}): Promise<AgentEncryptedSigningKey> {
  const agentId = agentIdSchema.parse(input.agentId);
  const kid = keyIdSchema.parse(input.kid);
  const pair = await generateEs256KeyPair(true);
  const privateJwk = await exportEs256PrivateJwk(pair.privateKey);
  const publicJwk = es256PublicJwkSchema.parse(await exportEs256PublicJwk(pair.publicKey));
  const encryptedPrivateJwk = await encryptEs256PrivateJwk(
    input.encryptionKey,
    privateJwk,
    keyContext(agentId, kid),
  );
  return Object.freeze({ encryptedPrivateJwk, kid, publicJwk });
}

export async function loadAgentPrivateSigningKey(input: {
  readonly agentId: string;
  readonly encryptedPrivateJwk: unknown;
  readonly encryptionKey: CryptoKey;
  readonly kid: string;
}): Promise<CryptoKey> {
  const agentId = agentIdSchema.parse(input.agentId);
  const kid = keyIdSchema.parse(input.kid);
  const privateJwk = await decryptEs256PrivateJwk(
    input.encryptionKey,
    input.encryptedPrivateJwk,
    keyContext(agentId, kid),
  );
  return importEs256PrivateJwk(privateJwk);
}

function keyContext(agentId: string, kid: string) {
  return Object.freeze({ agentId, kid, owner: "mindpay-agent" });
}
