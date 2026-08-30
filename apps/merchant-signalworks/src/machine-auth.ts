import { signalWorksMachineAuthTokenSchema } from "@mindpay/config";
import { sha256Hex } from "@mindpay/crypto";
import { z } from "zod";

export const SIGNALWORKS_GATEWAY_CREDENTIAL_ID = "machine_mindpay_gateway";
export const SIGNALWORKS_MACHINE_CREDENTIAL_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1_000;

const epochMillisecondsSchema = z.number().int().safe().nonnegative();
const machineCredentialRowSchema = z
  .object({
    created_at: epochMillisecondsSchema,
    expires_at: epochMillisecondsSchema,
    id: z.string(),
    label: z.string(),
    revoked_at: epochMillisecondsSchema.nullable(),
    token_hash: z.string().regex(/^[0-9a-f]{64}$/u),
    valid_from: epochMillisecondsSchema,
  })
  .strict();

export interface SignalWorksMachineCredential {
  readonly expiresAt: string;
  readonly id: string;
  readonly label: string;
  readonly validFrom: string;
}

export class SignalWorksMachineAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalWorksMachineAuthError";
  }
}

export async function seedSignalWorksMachineCredential(
  database: D1Database,
  bearerToken: unknown,
  now = new Date(),
): Promise<SignalWorksMachineCredential> {
  const token = signalWorksMachineAuthTokenSchema.parse(bearerToken);
  const nowEpochMs = assertDate(now).getTime();
  const tokenHash = await sha256Hex(token);
  const existing = await readCredentialById(database, SIGNALWORKS_GATEWAY_CREDENTIAL_ID);

  if (existing !== undefined) {
    if (existing.token_hash !== tokenHash) {
      throw new SignalWorksMachineAuthError(
        "Stored MindPay Gateway credential does not match the configured machine token",
      );
    }
    return toPublicCredential(existing);
  }

  await database
    .prepare(
      "INSERT INTO merchant_machine_credentials (id, label, token_hash, valid_from, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
    )
    .bind(
      SIGNALWORKS_GATEWAY_CREDENTIAL_ID,
      "MindPay Gateway",
      tokenHash,
      nowEpochMs,
      nowEpochMs + SIGNALWORKS_MACHINE_CREDENTIAL_TTL_MS,
      nowEpochMs,
    )
    .run();

  const stored = await readCredentialById(database, SIGNALWORKS_GATEWAY_CREDENTIAL_ID);
  if (stored === undefined) {
    throw new SignalWorksMachineAuthError("Machine credential seed did not persist");
  }
  return toPublicCredential(stored);
}

export async function authenticateSignalWorksMachine(
  database: D1Database,
  authorizationHeader: string | undefined,
  now: Date,
): Promise<SignalWorksMachineCredential | undefined> {
  const match = /^Bearer ([^\s]+)$/u.exec(authorizationHeader ?? "");
  const token = signalWorksMachineAuthTokenSchema.safeParse(match?.[1]);
  if (!token.success) {
    return undefined;
  }

  const nowEpochMs = assertDate(now).getTime();
  const tokenHash = await sha256Hex(token.data);
  const result = await database
    .prepare(
      "SELECT id, label, token_hash, valid_from, expires_at, revoked_at, created_at FROM merchant_machine_credentials WHERE token_hash = ? LIMIT 1",
    )
    .bind(tokenHash)
    .all();
  const row = z.array(machineCredentialRowSchema).parse(result.results)[0];
  if (
    row === undefined ||
    row.valid_from > nowEpochMs ||
    row.expires_at <= nowEpochMs ||
    (row.revoked_at !== null && row.revoked_at <= nowEpochMs)
  ) {
    return undefined;
  }
  return toPublicCredential(row);
}

async function readCredentialById(database: D1Database, id: string) {
  const result = await database
    .prepare(
      "SELECT id, label, token_hash, valid_from, expires_at, revoked_at, created_at FROM merchant_machine_credentials WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .all();
  return z.array(machineCredentialRowSchema).parse(result.results)[0];
}

function toPublicCredential(
  row: z.infer<typeof machineCredentialRowSchema>,
): SignalWorksMachineCredential {
  return Object.freeze({
    expiresAt: new Date(row.expires_at).toISOString(),
    id: row.id,
    label: row.label,
    validFrom: new Date(row.valid_from).toISOString(),
  });
}

function assertDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime()) || value.getTime() < 0) {
    throw new SignalWorksMachineAuthError("Machine credential time must be a valid date");
  }
  return value;
}
