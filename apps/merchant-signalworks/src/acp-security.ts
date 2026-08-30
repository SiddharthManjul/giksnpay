import { sha256CanonicalJsonHex } from "@mindpay/crypto";
import { ACP_VERSION, assertAcpSchema } from "@mindpay/protocol-acp";
import { z } from "zod";
import { type SignalWorksMachineCredential, authenticateSignalWorksMachine } from "./machine-auth";

export const ACP_API_VERSION_HEADER = "API-Version";
export const ACP_IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const ACP_REQUEST_ID_HEADER = "Request-Id";
export const ACP_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

const boundedHeaderSchema = z.string().min(1).max(255);
const responseHeadersSchema = z.record(z.string(), z.string());
const epochMillisecondsSchema = z.number().int().safe().nonnegative();
const idempotencyRowSchema = z
  .object({
    created_at: epochMillisecondsSchema,
    expires_at: epochMillisecondsSchema,
    key: z.string(),
    request_hash: z.string().regex(/^[0-9a-f]{64}$/u),
    request_id: z.string(),
    response_body: z.string().nullable(),
    response_headers: z.string().nullable(),
    response_status: z.number().int().min(100).max(599).nullable(),
    scope: z.string(),
    state: z.enum(["PENDING", "COMPLETED"]),
  })
  .strict();

export interface AcpRequestSecurity {
  readonly credential: SignalWorksMachineCredential;
  readonly idempotencyKey?: string;
  readonly requestId: string;
}

export interface AcpProtocolResponse {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

export type AcpSecurityResult =
  | Readonly<{ response: AcpProtocolResponse; success: false }>
  | Readonly<{ security: AcpRequestSecurity; success: true }>;

export type AcpIdempotencyClaim =
  | Readonly<{ requestHash: string; scope: string; success: true }>
  | Readonly<{ response: AcpProtocolResponse; success: false }>;

export async function validateAcpRequestSecurity(input: {
  readonly database: D1Database;
  readonly headers: Headers;
  readonly mutation: boolean;
  readonly now: Date;
}): Promise<AcpSecurityResult> {
  const credential = await authenticateSignalWorksMachine(
    input.database,
    input.headers.get("Authorization") ?? undefined,
    input.now,
  );
  if (credential === undefined) {
    return failed(
      protocolError(401, "authentication_required", "A valid bearer credential is required."),
    );
  }

  const apiVersion = input.headers.get(ACP_API_VERSION_HEADER);
  if (apiVersion !== ACP_VERSION) {
    return failed(
      protocolError(
        400,
        "unsupported_api_version",
        "The requested ACP API version is not supported.",
        {
          supported_versions: [ACP_VERSION],
        },
      ),
    );
  }

  const requestId = boundedHeaderSchema.safeParse(input.headers.get(ACP_REQUEST_ID_HEADER));
  if (!requestId.success) {
    return failed(protocolError(400, "request_id_required", "Request-Id header is required."));
  }

  if (!input.mutation) {
    return { security: { credential, requestId: requestId.data }, success: true };
  }

  const idempotencyKey = boundedHeaderSchema.safeParse(
    input.headers.get(ACP_IDEMPOTENCY_KEY_HEADER),
  );
  if (!idempotencyKey.success) {
    return failed(
      protocolError(400, "idempotency_key_required", "Idempotency-Key header is required."),
    );
  }
  return {
    security: { credential, idempotencyKey: idempotencyKey.data, requestId: requestId.data },
    success: true,
  };
}

export async function claimAcpIdempotency(input: {
  readonly body: unknown;
  readonly database: D1Database;
  readonly method: "POST";
  readonly now: Date;
  readonly path: string;
  readonly security: AcpRequestSecurity;
}): Promise<AcpIdempotencyClaim> {
  const idempotencyKey = input.security.idempotencyKey;
  if (idempotencyKey === undefined) {
    throw new TypeError("Mutation security context is missing an idempotency key");
  }
  const nowEpochMs = input.now.getTime();
  const scope = `${input.security.credential.id}:${input.method}:${input.path}`;
  const requestHash = await sha256CanonicalJsonHex({
    body: input.body,
    credentialId: input.security.credential.id,
    method: input.method,
    path: input.path,
  });

  await input.database
    .prepare(
      "DELETE FROM merchant_idempotency_records WHERE scope = ? AND key = ? AND expires_at <= ?",
    )
    .bind(scope, idempotencyKey, nowEpochMs)
    .run();
  const claimed = await input.database
    .prepare(
      "INSERT INTO merchant_idempotency_records (scope, key, request_id, request_hash, state, response_status, response_body, response_headers, created_at, expires_at) VALUES (?, ?, ?, ?, 'PENDING', NULL, NULL, NULL, ?, ?) ON CONFLICT(scope, key) DO NOTHING",
    )
    .bind(
      scope,
      idempotencyKey,
      input.security.requestId,
      requestHash,
      nowEpochMs,
      nowEpochMs + ACP_IDEMPOTENCY_TTL_MS,
    )
    .run();
  if (claimed.meta.changes === 1) {
    return { requestHash, scope, success: true };
  }

  const result = await input.database
    .prepare(
      "SELECT scope, key, request_id, request_hash, state, response_status, response_body, response_headers, created_at, expires_at FROM merchant_idempotency_records WHERE scope = ? AND key = ? LIMIT 1",
    )
    .bind(scope, idempotencyKey)
    .all();
  const stored = z.array(idempotencyRowSchema).parse(result.results)[0];
  if (stored === undefined) {
    return failedClaim(
      protocolError(409, "idempotency_in_flight", "The idempotent request is still in progress.", {
        headers: { "Retry-After": "1" },
      }),
    );
  }
  if (stored.request_hash !== requestHash) {
    return failedClaim(
      protocolError(
        409,
        "idempotency_conflict",
        "Idempotency-Key has already been used with a different request body.",
      ),
    );
  }
  if (
    stored.state === "COMPLETED" &&
    stored.response_body !== null &&
    stored.response_headers !== null &&
    stored.response_status !== null
  ) {
    const body = parseJson(stored.response_body, z.unknown());
    validateStoredAcpResponse(body, stored.response_status);
    return failedClaim({
      body,
      headers: {
        ...parseJson(stored.response_headers, responseHeadersSchema),
        "Idempotent-Replayed": "true",
      },
      status: stored.response_status,
    });
  }
  return failedClaim(
    protocolError(409, "idempotency_in_flight", "The idempotent request is still in progress.", {
      headers: { "Retry-After": "1" },
    }),
  );
}

function validateStoredAcpResponse(body: unknown, status: number): void {
  if (status >= 400) {
    assertAcpSchema("checkoutError", body);
    return;
  }
  assertAcpSchema("checkoutSession", body);
  if (body.status === "completed") {
    assertAcpSchema("checkoutSessionWithOrder", body);
  }
}

export function prepareAcpIdempotencyCompletion(
  database: D1Database,
  claim: Extract<AcpIdempotencyClaim, { success: true }>,
  key: string,
  response: AcpProtocolResponse,
): D1PreparedStatement {
  return database
    .prepare(
      "UPDATE merchant_idempotency_records SET state = 'COMPLETED', response_status = ?, response_body = ?, response_headers = ? WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING'",
    )
    .bind(
      response.status,
      JSON.stringify(response.body),
      JSON.stringify(response.headers),
      claim.scope,
      key,
      claim.requestHash,
    );
}

export function prepareAcpIdempotencyCompletionForCheckout(
  database: D1Database,
  claim: Extract<AcpIdempotencyClaim, { success: true }>,
  key: string,
  response: AcpProtocolResponse,
  checkout: {
    readonly acpSignature: string;
    readonly id: string;
    readonly revision: number;
  },
): D1PreparedStatement {
  return database
    .prepare(
      "UPDATE merchant_idempotency_records SET state = 'COMPLETED', response_status = ?, response_body = ?, response_headers = ? WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'PENDING' AND EXISTS (SELECT 1 FROM merchant_checkout_sessions WHERE id = ? AND revision = ? AND acp_signature = ?)",
    )
    .bind(
      response.status,
      JSON.stringify(response.body),
      JSON.stringify(response.headers),
      claim.scope,
      key,
      claim.requestHash,
      checkout.id,
      checkout.revision,
      checkout.acpSignature,
    );
}

export async function completeAcpIdempotency(
  database: D1Database,
  claim: Extract<AcpIdempotencyClaim, { success: true }>,
  key: string,
  response: AcpProtocolResponse,
): Promise<void> {
  await prepareAcpIdempotencyCompletion(database, claim, key, response).run();
}

export function protocolError(
  status: number,
  code: string,
  message: string,
  options: {
    readonly headers?: Readonly<Record<string, string>>;
    readonly supported_versions?: readonly string[];
  } = {},
): AcpProtocolResponse {
  const body = {
    code,
    message,
    ...(options.supported_versions === undefined
      ? {}
      : { supported_versions: [...options.supported_versions] }),
    type: status >= 500 ? "processing_error" : "invalid_request",
  };
  assertAcpSchema("checkoutError", body);
  return {
    body,
    headers: {
      "API-Version": ACP_VERSION,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=UTF-8",
      "X-Content-Type-Options": "nosniff",
      ...options.headers,
    },
    status,
  };
}

export function acpResponse(response: AcpProtocolResponse): Response {
  return new Response(JSON.stringify(response.body), {
    headers: response.headers,
    status: response.status,
  });
}

function failed(response: AcpProtocolResponse): AcpSecurityResult {
  return { response, success: false };
}

function failedClaim(response: AcpProtocolResponse): AcpIdempotencyClaim {
  return { response, success: false };
}

function parseJson<T>(serialized: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(serialized) as unknown);
  } catch {
    throw new TypeError("SignalWorks idempotency record contains malformed JSON");
  }
}
