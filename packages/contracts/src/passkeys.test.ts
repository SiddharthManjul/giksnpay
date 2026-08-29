import { describe, expect, it } from "vitest";
import {
  passkeyCredentialSchema,
  passkeyRegistrationOptionsResponseSchema,
  passkeyRegistrationResponseJsonSchema,
  verifyPasskeyRegistrationRequestSchema,
} from "./passkeys";

const credentialResponse = {
  clientExtensionResults: {},
  id: "credential_123",
  rawId: "credential_123",
  response: {
    attestationObject: "attestation_123",
    clientDataJSON: "client_data_123",
    transports: ["internal"],
  },
  type: "public-key",
} as const;

describe("passkey API contracts", () => {
  it("accepts bounded WebAuthn registration JSON and rejects mismatched credential IDs", () => {
    expect(passkeyRegistrationResponseJsonSchema.parse(credentialResponse)).toEqual(
      credentialResponse,
    );
    expect(() =>
      passkeyRegistrationResponseJsonSchema.parse({ ...credentialResponse, rawId: "different" }),
    ).toThrow(/must match/);
  });

  it("rejects unknown registration request fields and malformed challenge IDs", () => {
    const request = {
      challengeId: "pkr_01JGFJH900H8M2APVYVDZ4R6AA",
      name: "MacBook Touch ID",
      response: credentialResponse,
    };

    expect(verifyPasskeyRegistrationRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      verifyPasskeyRegistrationRequestSchema.parse({ ...request, privateKey: "forbidden" }),
    ).toThrow();
    expect(() =>
      verifyPasskeyRegistrationRequestSchema.parse({ ...request, challengeId: "challenge-1" }),
    ).toThrow();
  });

  it("publishes registration options with required resident credentials and user verification", () => {
    expect(
      passkeyRegistrationOptionsResponseSchema.parse({
        challengeId: "pkr_01JGFJH900H8M2APVYVDZ4R6AA",
        options: {
          attestation: "none",
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          challenge: "challenge_123",
          excludeCredentials: [],
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          rp: { id: "mindpay.test", name: "MindPay" },
          timeout: 300_000,
          user: {
            displayName: "MindPay Owner",
            id: "opaque_user_123",
            name: "owner_at_mindpay_test",
          },
        },
      }),
    ).toMatchObject({
      options: {
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      },
    });
  });

  it("keeps public key bytes, credential IDs, counters, and user handles out of management responses", () => {
    const passkey = passkeyCredentialSchema.parse({
      backedUp: true,
      createdAt: "2026-08-29T12:00:00.000Z",
      deviceType: "multiDevice",
      id: "pkc_01JGFJH900H8M2APVYVDZ4R6AA",
      name: "Synced passkey",
      transports: ["hybrid", "internal"],
    });

    expect(Object.keys(passkey).sort()).toEqual([
      "backedUp",
      "createdAt",
      "deviceType",
      "id",
      "name",
      "transports",
    ]);
  });
});
