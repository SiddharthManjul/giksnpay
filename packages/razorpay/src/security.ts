import { z } from "zod";

const signatureSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export async function createRazorpayHmacHex(
  secret: string,
  message: string | Uint8Array,
): Promise<string> {
  const secretBytes = new TextEncoder().encode(assertSecret(secret));
  const messageBytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, Uint8Array.from(messageBytes).buffer);
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyRazorpayCheckoutSignature(input: {
  readonly keySecret: string;
  readonly paymentId: string;
  readonly signature: string;
  readonly storedOrderId: string;
}): Promise<boolean> {
  const received = signatureSchema.safeParse(input.signature);
  if (!received.success) return false;
  const expected = await createRazorpayHmacHex(
    input.keySecret,
    `${input.storedOrderId}|${input.paymentId}`,
  );
  return timingSafeHexEqual(expected, received.data);
}

export async function verifyRazorpayWebhookSignature(input: {
  readonly rawBody: Uint8Array;
  readonly signature: string;
  readonly webhookSecrets: readonly string[];
}): Promise<boolean> {
  const received = signatureSchema.safeParse(input.signature);
  if (!received.success || input.webhookSecrets.length === 0) return false;
  let valid = false;
  for (const secret of input.webhookSecrets) {
    const expected = await createRazorpayHmacHex(secret, input.rawBody);
    valid = timingSafeHexEqual(expected, received.data) || valid;
  }
  return valid;
}

export function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function assertSecret(secret: string): string {
  return z
    .string()
    .regex(/^[\x21-\x7e]{16,256}$/u)
    .parse(secret);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/u.test(value)) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/gu)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
}
