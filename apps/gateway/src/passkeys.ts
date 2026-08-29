import { parseGatewayAuthEnvironment } from "@mindpay/config";
import {
  authenticatorTransportSchema,
  deletePasskeyResponseSchema,
  passkeyCredentialIdSchema,
  passkeyCredentialSchema,
  passkeyCredentialsResponseSchema,
  passkeyMutationResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
  updatePasskeyRequestSchema,
  verifyPasskeyRegistrationRequestSchema,
} from "@mindpay/contracts";
import { bytesToBase64Url, hexToBytes, sha256Hex, timingSafeEqual } from "@mindpay/crypto";
import {
  createMindPayDatabase,
  passkeyCredentials,
  passkeyRegistrationChallenges,
} from "@mindpay/db";
import { createUlid, utcTimestampFromDate } from "@mindpay/domain";
import {
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  resourceNotFound,
} from "./authorization";

export const PASSKEY_REGISTRATION_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
export const MAX_PASSKEYS_PER_USER = 32;

interface PasskeyRouteDependencies {
  readonly generateRegistrationOptions?: typeof generateRegistrationOptions;
  readonly now?: () => Date;
  readonly verifyRegistrationResponse?: typeof verifyRegistrationResponse;
}

export function createPasskeyRoutes(dependencies: PasskeyRouteDependencies = {}) {
  const generateOptions = dependencies.generateRegistrationOptions ?? generateRegistrationOptions;
  const now = dependencies.now ?? (() => new Date());
  const verifyResponse = dependencies.verifyRegistrationResponse ?? verifyRegistrationResponse;
  const routes = new Hono<GatewayEnvironment>();

  routes.use("*", requireAuthentication);

  routes.post("/registration/options", async (context) => {
    const environment = passkeyEnvironment(context.env);
    const origin = trustedRequestOrigin(context.req.raw, environment.TRUSTED_ORIGINS);
    if (origin === undefined) {
      return invalidChallenge(context);
    }

    const principal = context.get("principal");
    const database = createMindPayDatabase(context.env.DB);
    const existingPasskeys = await database
      .select({
        credentialId: passkeyCredentials.credentialId,
        transports: passkeyCredentials.transports,
      })
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, principal.id));
    if (existingPasskeys.length >= MAX_PASSKEYS_PER_USER) {
      return apiError(
        context,
        409,
        "PASSKEY_LIMIT_REACHED",
        "The account has reached its passkey limit.",
      );
    }
    const webauthnUserIdBytes = crypto.getRandomValues(new Uint8Array(32));
    const options = await generateOptions({
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: parseTransports(passkey.transports),
      })),
      rpID: environment.PASSKEY_RP_ID,
      rpName: "MindPay",
      timeout: PASSKEY_REGISTRATION_CHALLENGE_TTL_MS,
      userDisplayName: principal.name,
      userID: webauthnUserIdBytes,
      userName: principal.email,
    });
    const createdAt = now();
    const challengeId = `pkr_${createUlid(createdAt.getTime())}`;

    await database.insert(passkeyRegistrationChallenges).values({
      challengeHash: await sha256Hex(options.challenge),
      consumedAt: null,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + PASSKEY_REGISTRATION_CHALLENGE_TTL_MS),
      id: challengeId,
      origin,
      rpId: environment.PASSKEY_RP_ID,
      sessionId: principal.sessionId,
      userId: principal.id,
      webauthnUserId: bytesToBase64Url(webauthnUserIdBytes),
    });

    return context.json(
      passkeyRegistrationOptionsResponseSchema.parse({ challengeId, options }),
      201,
    );
  });

  routes.post("/registration/verify", async (context) => {
    const request = verifyPasskeyRegistrationRequestSchema.safeParse(
      await readJsonBody(context.req.raw),
    );
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The passkey registration is invalid.");
    }

    const environment = passkeyEnvironment(context.env);
    const origin = trustedRequestOrigin(context.req.raw, environment.TRUSTED_ORIGINS);
    if (origin === undefined) {
      return invalidChallenge(context);
    }

    const principal = context.get("principal");
    const database = createMindPayDatabase(context.env.DB);
    const consumedAt = now();
    const consumedChallenges = await database
      .update(passkeyRegistrationChallenges)
      .set({ consumedAt })
      .where(
        and(
          eq(passkeyRegistrationChallenges.id, request.data.challengeId),
          eq(passkeyRegistrationChallenges.sessionId, principal.sessionId),
          eq(passkeyRegistrationChallenges.userId, principal.id),
          eq(passkeyRegistrationChallenges.origin, origin),
          eq(passkeyRegistrationChallenges.rpId, environment.PASSKEY_RP_ID),
          isNull(passkeyRegistrationChallenges.consumedAt),
          gt(passkeyRegistrationChallenges.expiresAt, consumedAt),
        ),
      )
      .returning({
        challengeHash: passkeyRegistrationChallenges.challengeHash,
        rpId: passkeyRegistrationChallenges.rpId,
        webauthnUserId: passkeyRegistrationChallenges.webauthnUserId,
      });
    const challenge = consumedChallenges[0];
    if (challenge === undefined) {
      return invalidChallenge(context);
    }

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyResponse({
        expectedChallenge: async (receivedChallenge) =>
          timingSafeEqual(
            hexToBytes(await sha256Hex(receivedChallenge)),
            hexToBytes(challenge.challengeHash),
          ),
        expectedOrigin: origin,
        expectedRPID: challenge.rpId,
        requireUserVerification: true,
        response: request.data.response as RegistrationResponseJSON,
      });
    } catch {
      return registrationFailed(context);
    }

    if (!verification.verified || !verification.registrationInfo.userVerified) {
      return registrationFailed(context);
    }

    const { registrationInfo } = verification;
    if (
      !Number.isSafeInteger(registrationInfo.credential.counter) ||
      registrationInfo.credential.counter < 0
    ) {
      return registrationFailed(context);
    }

    const transports = parseTransports(
      registrationInfo.credential.transports ?? request.data.response.response.transports ?? [],
    );
    const createdAt = now();
    const passkey = {
      backedUp: registrationInfo.credentialBackedUp,
      createdAt,
      deviceType: registrationInfo.credentialDeviceType,
      id: `pkc_${createUlid(createdAt.getTime())}`,
      name: request.data.name ?? null,
      transports,
    } as const;

    try {
      await database.insert(passkeyCredentials).values({
        aaguid: registrationInfo.aaguid,
        backedUp: passkey.backedUp,
        counter: registrationInfo.credential.counter,
        createdAt,
        credentialId: registrationInfo.credential.id,
        deviceType: passkey.deviceType,
        id: passkey.id,
        name: passkey.name,
        publicKey: bytesToBase64Url(registrationInfo.credential.publicKey),
        transports,
        updatedAt: createdAt,
        userId: principal.id,
        webauthnUserId: challenge.webauthnUserId,
      });
    } catch (error) {
      if (isDuplicateCredentialError(error)) {
        return apiError(
          context,
          409,
          "PASSKEY_ALREADY_REGISTERED",
          "This authenticator is already registered.",
        );
      }
      throw error;
    }

    return context.json(
      passkeyMutationResponseSchema.parse({ passkey: serializePasskey(passkey) }),
      201,
    );
  });

  routes.get("/", async (context) => {
    const principal = context.get("principal");
    const database = createMindPayDatabase(context.env.DB);
    const passkeys = await database
      .select({
        backedUp: passkeyCredentials.backedUp,
        createdAt: passkeyCredentials.createdAt,
        deviceType: passkeyCredentials.deviceType,
        id: passkeyCredentials.id,
        name: passkeyCredentials.name,
        transports: passkeyCredentials.transports,
      })
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, principal.id))
      .orderBy(asc(passkeyCredentials.createdAt), asc(passkeyCredentials.id));

    return context.json(
      passkeyCredentialsResponseSchema.parse({ passkeys: passkeys.map(serializePasskey) }),
    );
  });

  routes.patch("/:passkeyId", async (context) => {
    if (
      trustedRequestOrigin(context.req.raw, passkeyEnvironment(context.env).TRUSTED_ORIGINS) ===
      undefined
    ) {
      return apiError(context, 400, "INVALID_REQUEST", "The passkey update is invalid.");
    }
    const passkeyId = passkeyCredentialIdSchema.safeParse(context.req.param("passkeyId"));
    const request = updatePasskeyRequestSchema.safeParse(await readJsonBody(context.req.raw));
    if (!passkeyId.success || !request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The passkey update is invalid.");
    }

    const principal = context.get("principal");
    const database = createMindPayDatabase(context.env.DB);
    const updatedAt = now();
    const updatedPasskeys = await database
      .update(passkeyCredentials)
      .set({ name: request.data.name, updatedAt })
      .where(
        and(eq(passkeyCredentials.id, passkeyId.data), eq(passkeyCredentials.userId, principal.id)),
      )
      .returning({
        backedUp: passkeyCredentials.backedUp,
        createdAt: passkeyCredentials.createdAt,
        deviceType: passkeyCredentials.deviceType,
        id: passkeyCredentials.id,
        name: passkeyCredentials.name,
        transports: passkeyCredentials.transports,
      });
    const updatedPasskey = updatedPasskeys[0];
    if (updatedPasskey === undefined) {
      return resourceNotFound(context);
    }

    return context.json(
      passkeyMutationResponseSchema.parse({ passkey: serializePasskey(updatedPasskey) }),
    );
  });

  routes.delete("/:passkeyId", async (context) => {
    if (
      trustedRequestOrigin(context.req.raw, passkeyEnvironment(context.env).TRUSTED_ORIGINS) ===
      undefined
    ) {
      return apiError(context, 400, "INVALID_REQUEST", "The passkey deletion is invalid.");
    }
    const passkeyId = passkeyCredentialIdSchema.safeParse(context.req.param("passkeyId"));
    if (!passkeyId.success) {
      return resourceNotFound(context);
    }

    const principal = context.get("principal");
    const database = createMindPayDatabase(context.env.DB);
    const deletedPasskeys = await database
      .delete(passkeyCredentials)
      .where(
        and(eq(passkeyCredentials.id, passkeyId.data), eq(passkeyCredentials.userId, principal.id)),
      )
      .returning({ id: passkeyCredentials.id });
    if (deletedPasskeys.length !== 1) {
      return resourceNotFound(context);
    }

    return context.json(deletePasskeyResponseSchema.parse({ deleted: true }));
  });

  return routes;
}

export const passkeyRoutes = createPasskeyRoutes();

function passkeyEnvironment(bindings: GatewayEnvironment["Bindings"]) {
  return parseGatewayAuthEnvironment({
    BETTER_AUTH_SECRET: bindings.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: bindings.BETTER_AUTH_URL,
    ENVIRONMENT: bindings.ENVIRONMENT,
    PASSKEY_RP_ID: bindings.PASSKEY_RP_ID,
    TRUSTED_ORIGINS: bindings.TRUSTED_ORIGINS,
  });
}

function trustedRequestOrigin(
  request: Request,
  trustedOrigins: readonly string[],
): string | undefined {
  const header = request.headers.get("origin");
  if (header === null) {
    return undefined;
  }
  try {
    const origin = new URL(header).origin;
    if (origin !== header || !trustedOrigins.includes(origin)) {
      return undefined;
    }
    return origin;
  } catch {
    return undefined;
  }
}

function parseTransports(transports: readonly string[]) {
  return authenticatorTransportSchema
    .array()
    .max(authenticatorTransportSchema.options.length)
    .refine((values) => new Set(values).size === values.length)
    .parse(transports);
}

function serializePasskey(passkey: {
  readonly backedUp: boolean;
  readonly createdAt: Date;
  readonly deviceType: "multiDevice" | "singleDevice";
  readonly id: string;
  readonly name: string | null;
  readonly transports: readonly string[];
}) {
  return passkeyCredentialSchema.parse({
    backedUp: passkey.backedUp,
    createdAt: utcTimestampFromDate(passkey.createdAt),
    deviceType: passkey.deviceType,
    id: passkey.id,
    name: passkey.name,
    transports: parseTransports(passkey.transports),
  });
}

function invalidChallenge(context: Parameters<typeof apiError>[0]) {
  return apiError(
    context,
    400,
    "PASSKEY_CHALLENGE_INVALID",
    "The passkey registration challenge is invalid or expired.",
  );
}

function registrationFailed(context: Parameters<typeof apiError>[0]) {
  return apiError(
    context,
    400,
    "PASSKEY_REGISTRATION_FAILED",
    "The authenticator registration could not be verified.",
  );
}

function isDuplicateCredentialError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if (
      current instanceof Error &&
      (current.message.includes("passkey_credentials_credential_id_uq") ||
        current.message.includes("UNIQUE constraint failed: passkey_credentials.credential_id"))
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
