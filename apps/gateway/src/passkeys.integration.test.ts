import {
  passkeyCredentialsResponseSchema,
  passkeyMutationResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
} from "@mindpay/contracts";
import { bytesToBase64Url, sha256Hex } from "@mindpay/crypto";
import type {
  VerifiedRegistrationResponse,
  VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { Hono } from "hono";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayAuthBindings } from "./auth";
import type { GatewayEnvironment } from "./authorization";
import { gateway } from "./index";
import { createPasskeyRoutes, PASSKEY_REGISTRATION_CHALLENGE_TTL_MS } from "./passkeys";
import { createTestDatabase } from "./test-database";

const AUTH_URL = "http://localhost:8787";
const FRONTEND_ORIGIN = "http://localhost:3000";
const SECOND_FRONTEND_ORIGIN = "http://admin.localhost:3000";
const TEST_AUTH_SECRET = "mindpay-test-auth-secret-with-at-least-32-characters";
const TEST_PASSWORD = "MindPay-Test-Password-2026";
const CREDENTIAL_PUBLIC_KEY = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

interface AuthenticatedTestUser {
  readonly cookie: string;
  readonly id: string;
}

interface ChallengeRow {
  readonly challenge_hash: string;
  readonly consumed_at: number | null;
  readonly expires_at: number;
  readonly origin: string;
  readonly rp_id: string;
  readonly session_id: string;
  readonly user_id: string;
  readonly webauthn_user_id: string;
}

describe("Gateway passkey registration and credential management", () => {
  let bindings: GatewayAuthBindings;
  let currentTime: Date;
  let database: D1Database;
  let miniflare: Miniflare;
  let owner: AuthenticatedTestUser;
  let outsider: AuthenticatedTestUser;
  let presentedChallenge: string;
  let registrationShouldVerify: boolean;
  let verifyCalls: number;
  let passkeyGateway: Hono<GatewayEnvironment>;

  beforeEach(async () => {
    ({ database, miniflare } = await createTestDatabase("mindpay-passkeys-test"));
    bindings = {
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: AUTH_URL,
      DB: database,
      ENVIRONMENT: "test",
      PASSKEY_RP_ID: "localhost",
      TRUSTED_ORIGINS: `${FRONTEND_ORIGIN},${SECOND_FRONTEND_ORIGIN}`,
    };
    currentTime = new Date();
    presentedChallenge = "";
    registrationShouldVerify = true;
    verifyCalls = 0;
    passkeyGateway = new Hono<GatewayEnvironment>();
    passkeyGateway.route(
      "/api/v1/passkeys",
      createPasskeyRoutes({
        now: () => new Date(currentTime),
        verifyRegistrationResponse: verifyRegistrationResponseStub,
      }),
    );
    owner = await createAuthenticatedUser("owner@mindpay.test", "Owner");
    outsider = await createAuthenticatedUser("outsider@mindpay.test", "Outsider");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await miniflare.dispose();
  });

  it("requires an authenticated session before creating registration options", async () => {
    const response = await passkeyGateway.request(
      `${AUTH_URL}/api/v1/passkeys/registration/options`,
      { headers: { origin: FRONTEND_ORIGIN }, method: "POST" },
      bindings,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("stores an expiring challenge hash bound to the exact session, user, RP ID, and origin", async () => {
    const options = await registrationOptions(owner);
    const session = await sessionFor(owner.id);
    const challenge = await database
      .prepare(
        "SELECT challenge_hash, consumed_at, expires_at, origin, rp_id, session_id, user_id, webauthn_user_id FROM passkey_registration_challenges WHERE id = ?",
      )
      .bind(options.challengeId)
      .first<ChallengeRow>();

    expect(challenge).not.toBeNull();
    expect(challenge).toMatchObject({
      challenge_hash: await sha256Hex(options.options.challenge),
      consumed_at: null,
      expires_at: currentTime.getTime() + PASSKEY_REGISTRATION_CHALLENGE_TTL_MS,
      origin: FRONTEND_ORIGIN,
      rp_id: "localhost",
      session_id: session.id,
      user_id: owner.id,
      webauthn_user_id: options.options.user.id,
    });
    expect(JSON.stringify(challenge)).not.toContain(options.options.challenge);
  });

  it("persists a verified public credential, consumes the challenge, and returns no proof material", async () => {
    const options = await registrationOptions(owner);
    presentedChallenge = options.options.challenge;
    const response = await verifyRegistration(owner, options.challengeId, "MacBook Touch ID");

    expect(response.status).toBe(201);
    const responseBody = passkeyMutationResponseSchema.parse(await response.json());
    expect(responseBody.passkey).toMatchObject({
      backedUp: true,
      deviceType: "multiDevice",
      name: "MacBook Touch ID",
      transports: ["internal"],
    });
    expect(JSON.stringify(responseBody)).not.toMatch(
      /credentialId|counter|publicKey|webauthnUserId/u,
    );
    expect(verifyCalls).toBe(1);

    const credential = await database
      .prepare(
        "SELECT user_id, name, credential_id, public_key, webauthn_user_id, counter, device_type, backed_up, transports, aaguid FROM passkey_credentials",
      )
      .first<Record<string, unknown>>();
    expect(credential).toMatchObject({
      aaguid: "00000000-0000-0000-0000-000000000000",
      backed_up: 1,
      counter: 0,
      credential_id: "credential_01",
      device_type: "multiDevice",
      name: "MacBook Touch ID",
      public_key: bytesToBase64Url(CREDENTIAL_PUBLIC_KEY),
      transports: '["internal"]',
      user_id: owner.id,
    });
    expect(credential?.webauthn_user_id).toBe(options.options.user.id);

    const challenge = await challengeById(options.challengeId);
    expect(challenge.consumed_at).toBe(currentTime.getTime());
    const columns = await database
      .prepare("PRAGMA table_info(passkey_credentials)")
      .all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).not.toContain("private_key");
  });

  it("rejects replay after both successful and failed verification attempts", async () => {
    const successfulOptions = await registrationOptions(owner);
    presentedChallenge = successfulOptions.options.challenge;
    expect((await verifyRegistration(owner, successfulOptions.challengeId)).status).toBe(201);
    const successfulReplay = await verifyRegistration(owner, successfulOptions.challengeId);
    expect(successfulReplay.status).toBe(400);
    await expect(successfulReplay.json()).resolves.toMatchObject({
      error: { code: "PASSKEY_CHALLENGE_INVALID" },
    });

    const failedOptions = await registrationOptions(owner);
    presentedChallenge = failedOptions.options.challenge;
    registrationShouldVerify = false;
    const failedVerification = await verifyRegistration(owner, failedOptions.challengeId);
    expect(failedVerification.status).toBe(400);
    await expect(failedVerification.json()).resolves.toMatchObject({
      error: { code: "PASSKEY_REGISTRATION_FAILED" },
    });
    expect((await verifyRegistration(owner, failedOptions.challengeId)).status).toBe(400);
    expect(verifyCalls).toBe(2);
  });

  it("does not let another session consume a challenge", async () => {
    const options = await registrationOptions(owner);
    presentedChallenge = options.options.challenge;
    const secondOwnerSession = await signInExistingUser("owner@mindpay.test", owner.id);

    const crossSessionResponse = await verifyRegistration(secondOwnerSession, options.challengeId);
    expect(crossSessionResponse.status).toBe(400);
    await expect(crossSessionResponse.json()).resolves.toMatchObject({
      error: { code: "PASSKEY_CHALLENGE_INVALID" },
    });
    expect((await challengeById(options.challengeId)).consumed_at).toBeNull();
    expect((await verifyRegistration(owner, options.challengeId)).status).toBe(201);
  });

  it("does not let another trusted origin consume a challenge", async () => {
    const options = await registrationOptions(owner);
    presentedChallenge = options.options.challenge;

    const wrongOriginResponse = await verifyRegistration(
      owner,
      options.challengeId,
      undefined,
      SECOND_FRONTEND_ORIGIN,
    );
    expect(wrongOriginResponse.status).toBe(400);
    expect((await challengeById(options.challengeId)).consumed_at).toBeNull();
    expect((await verifyRegistration(owner, options.challengeId)).status).toBe(201);
  });

  it("rejects expired challenges without invoking the WebAuthn verifier", async () => {
    const options = await registrationOptions(owner);
    presentedChallenge = options.options.challenge;
    currentTime = new Date(currentTime.getTime() + PASSKEY_REGISTRATION_CHALLENGE_TTL_MS + 1);

    const response = await verifyRegistration(owner, options.challengeId);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PASSKEY_CHALLENGE_INVALID" },
    });
    expect(verifyCalls).toBe(0);
  });

  it("prevents the same authenticator credential from being registered twice", async () => {
    const firstOptions = await registrationOptions(owner);
    presentedChallenge = firstOptions.options.challenge;
    expect((await verifyRegistration(owner, firstOptions.challengeId)).status).toBe(201);

    const secondOptions = await registrationOptions(owner);
    expect(secondOptions.options.excludeCredentials).toEqual([
      { id: "credential_01", transports: ["internal"], type: "public-key" },
    ]);
    presentedChallenge = secondOptions.options.challenge;
    const duplicateResponse = await verifyRegistration(owner, secondOptions.challengeId);
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      error: { code: "PASSKEY_ALREADY_REGISTERED" },
    });
    expect((await challengeById(secondOptions.challengeId)).consumed_at).toBe(
      currentTime.getTime(),
    );
  });

  it("lists, renames, and deletes only the authenticated user's safe credential record", async () => {
    const options = await registrationOptions(owner);
    presentedChallenge = options.options.challenge;
    const registration = passkeyMutationResponseSchema.parse(
      await (await verifyRegistration(owner, options.challengeId, "Original name")).json(),
    );
    const passkeyId = registration.passkey.id;

    const ownerList = await passkeyRequest(owner, "", { method: "GET" });
    expect(ownerList.status).toBe(200);
    const ownerListBody = passkeyCredentialsResponseSchema.parse(await ownerList.json());
    expect(ownerListBody.passkeys).toHaveLength(1);
    expect(JSON.stringify(ownerListBody)).not.toMatch(/credential_01|public_key|publicKey/u);

    const outsiderUpdate = await passkeyRequest(outsider, `/${passkeyId}`, {
      body: JSON.stringify({ name: "Stolen" }),
      method: "PATCH",
    });
    expect(outsiderUpdate.status).toBe(404);

    const update = await passkeyRequest(owner, `/${passkeyId}`, {
      body: JSON.stringify({ name: "Renamed passkey" }),
      method: "PATCH",
    });
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      passkey: { id: passkeyId, name: "Renamed passkey" },
    });

    expect((await passkeyRequest(outsider, `/${passkeyId}`, { method: "DELETE" })).status).toBe(
      404,
    );
    expect((await passkeyRequest(owner, `/${passkeyId}`, { method: "DELETE" })).status).toBe(200);
    const emptyList = passkeyCredentialsResponseSchema.parse(
      await (await passkeyRequest(owner, "", { method: "GET" })).json(),
    );
    expect(emptyList.passkeys).toEqual([]);
  });

  async function createAuthenticatedUser(
    email: string,
    label: string,
  ): Promise<AuthenticatedTestUser> {
    const signUpResponse = await authRequest("sign-up/email", {
      body: JSON.stringify({ email, name: `${label} User`, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signUpResponse.status).toBe(200);
    const signInResponse = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signInResponse.status).toBe(200);
    const cookie = signInResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) {
      throw new Error(`Better Auth did not issue a cookie for ${label}`);
    }
    const user = await database
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (user === null) {
      throw new Error(`Better Auth did not persist the ${label} user`);
    }
    return { cookie, id: user.id };
  }

  async function signInExistingUser(email: string, userId: string): Promise<AuthenticatedTestUser> {
    const signInResponse = await authRequest("sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signInResponse.status).toBe(200);
    const cookie = signInResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) {
      throw new Error(`Better Auth did not issue a second cookie for ${email}`);
    }
    return { cookie, id: userId };
  }

  function authRequest(route: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    headers.set("origin", FRONTEND_ORIGIN);
    return Promise.resolve(
      gateway.request(`${AUTH_URL}/api/auth/${route}`, { ...init, headers }, bindings),
    );
  }

  async function registrationOptions(user: AuthenticatedTestUser, origin = FRONTEND_ORIGIN) {
    const response = await passkeyRequest(
      user,
      "/registration/options",
      { method: "POST" },
      origin,
    );
    expect(response.status).toBe(201);
    return passkeyRegistrationOptionsResponseSchema.parse(await response.json());
  }

  function verifyRegistration(
    user: AuthenticatedTestUser,
    challengeId: string,
    name?: string,
    origin = FRONTEND_ORIGIN,
  ): Promise<Response> {
    return passkeyRequest(
      user,
      "/registration/verify",
      {
        body: JSON.stringify({
          challengeId,
          ...(name === undefined ? {} : { name }),
          response: registrationResponse(),
        }),
        method: "POST",
      },
      origin,
    );
  }

  function passkeyRequest(
    user: AuthenticatedTestUser,
    path: string,
    init: RequestInit,
    origin = FRONTEND_ORIGIN,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", user.cookie);
    headers.set("origin", origin);
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return Promise.resolve(
      passkeyGateway.request(`${AUTH_URL}/api/v1/passkeys${path}`, { ...init, headers }, bindings),
    );
  }

  function registrationResponse() {
    return {
      clientExtensionResults: {},
      id: "credential_01",
      rawId: "credential_01",
      response: {
        attestationObject: "attestation_01",
        clientDataJSON: "client_data_01",
        transports: ["internal"],
      },
      type: "public-key",
    } as const;
  }

  async function verifyRegistrationResponseStub(
    options: VerifyRegistrationResponseOpts,
  ): Promise<VerifiedRegistrationResponse> {
    verifyCalls += 1;
    const matchesChallenge =
      typeof options.expectedChallenge === "string"
        ? options.expectedChallenge === presentedChallenge
        : await options.expectedChallenge(presentedChallenge);
    expect(matchesChallenge).toBe(true);
    const acceptsMutatedChallenge =
      typeof options.expectedChallenge === "string"
        ? options.expectedChallenge === `${presentedChallenge}x`
        : await options.expectedChallenge(`${presentedChallenge}x`);
    expect(acceptsMutatedChallenge).toBe(false);
    expect(options.expectedOrigin).toBe(FRONTEND_ORIGIN);
    expect(options.expectedRPID).toBe("localhost");
    if (!registrationShouldVerify) {
      return { verified: false };
    }
    return {
      registrationInfo: {
        aaguid: "00000000-0000-0000-0000-000000000000",
        attestationObject: new Uint8Array([9, 8, 7]),
        credential: {
          counter: 0,
          id: options.response.id,
          publicKey: CREDENTIAL_PUBLIC_KEY,
          transports: ["internal"],
        },
        credentialBackedUp: true,
        credentialDeviceType: "multiDevice",
        credentialType: "public-key",
        fmt: "none",
        origin: FRONTEND_ORIGIN,
        rpID: "localhost",
        userVerified: true,
      },
      verified: true,
    };
  }

  async function sessionFor(userId: string): Promise<{ readonly id: string }> {
    const session = await database
      .prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(userId)
      .first<{ id: string }>();
    if (session === null) {
      throw new Error(`Missing session for ${userId}`);
    }
    return session;
  }

  async function challengeById(challengeId: string): Promise<ChallengeRow> {
    const challenge = await database
      .prepare(
        "SELECT challenge_hash, consumed_at, expires_at, origin, rp_id, session_id, user_id, webauthn_user_id FROM passkey_registration_challenges WHERE id = ?",
      )
      .bind(challengeId)
      .first<ChallengeRow>();
    if (challenge === null) {
      throw new Error(`Missing challenge ${challengeId}`);
    }
    return challenge;
  }
});
