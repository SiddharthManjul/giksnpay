import { passkeyRegistrationOptionsResponseSchema } from "@mindpay/contracts";
import { z } from "zod";

const authenticationOptionsSchema = z
  .object({
    allowCredentials: z.array(
      z
        .object({
          id: z.string(),
          transports: z.array(z.string()).optional(),
          type: z.literal("public-key"),
        })
        .passthrough(),
    ),
    challenge: z.string(),
    rpId: z.string().optional(),
    timeout: z.number().optional(),
    userVerification: z.enum(["discouraged", "preferred", "required"]).optional(),
  })
  .passthrough();

export const mandateChallengeResponseSchema = z
  .object({ challengeId: z.string(), options: authenticationOptionsSchema })
  .strict();

export async function createPasskeyCredential(untrusted: unknown) {
  const { options } = passkeyRegistrationOptionsResponseSchema.parse(untrusted);
  const publicKey: PublicKeyCredentialCreationOptions = {
    attestation: options.attestation,
    authenticatorSelection: {
      residentKey: options.authenticatorSelection.residentKey,
      userVerification: options.authenticatorSelection.userVerification,
    },
    challenge: fromBase64Url(options.challenge),
    excludeCredentials: options.excludeCredentials.map((entry) => ({
      ...(entry.transports === undefined
        ? {}
        : { transports: [...entry.transports] as AuthenticatorTransport[] }),
      id: fromBase64Url(entry.id),
      type: entry.type,
    })),
    pubKeyCredParams: options.pubKeyCredParams.map((entry) => ({ ...entry })),
    rp: { ...options.rp },
    timeout: options.timeout,
    user: { ...options.user, id: fromBase64Url(options.user.id) },
  };
  const credential = await navigator.credentials.create({
    publicKey,
  });
  if (
    !(credential instanceof PublicKeyCredential) ||
    !(credential.response instanceof AuthenticatorAttestationResponse)
  ) {
    throw new Error("The authenticator did not return a registration credential.");
  }
  return {
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    response: {
      attestationObject: toBase64Url(credential.response.attestationObject),
      clientDataJSON: toBase64Url(credential.response.clientDataJSON),
      transports: credential.response.getTransports(),
    },
    type: "public-key" as const,
  };
}

export async function getPasskeyAssertion(untrusted: unknown) {
  const options = authenticationOptionsSchema.parse(untrusted);
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...(options.rpId === undefined ? {} : { rpId: options.rpId }),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.userVerification === undefined
      ? {}
      : { userVerification: options.userVerification }),
    allowCredentials: options.allowCredentials.map((entry) => ({
      id: fromBase64Url(entry.id),
      ...(entry.transports === undefined
        ? {}
        : { transports: entry.transports as AuthenticatorTransport[] }),
      type: entry.type,
    })),
    challenge: fromBase64Url(options.challenge),
  };
  const credential = await navigator.credentials.get({
    publicKey,
  });
  if (
    !(credential instanceof PublicKeyCredential) ||
    !(credential.response instanceof AuthenticatorAssertionResponse)
  ) {
    throw new Error("The authenticator did not return an approval assertion.");
  }
  return {
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    response: {
      authenticatorData: toBase64Url(credential.response.authenticatorData),
      clientDataJSON: toBase64Url(credential.response.clientDataJSON),
      signature: toBase64Url(credential.response.signature),
      userHandle:
        credential.response.userHandle === null
          ? null
          : toBase64Url(credential.response.userHandle),
    },
    type: "public-key" as const,
  };
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
