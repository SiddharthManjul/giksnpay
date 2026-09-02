import {
  type Es256VerificationKey,
  importEs256PublicJwk,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { ulidSchema, utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import { sha256HexSchema } from "./cross-party";
import {
  checkoutSessionIdSchema,
  es256CanonicalSignatureSchema,
  merchantHttpsUrlSchema,
  merchantIdSchema,
  merchantSigningKeySchema,
  offerNonceSchema,
} from "./merchant";

const keyIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u, "Key ID is not canonical");

const prefixedUlid = (prefix: "evt" | "ord") =>
  z.string().superRefine((value, context) => {
    if (
      !value.startsWith(`${prefix}_`) ||
      !ulidSchema.safeParse(value.slice(prefix.length + 1)).success
    ) {
      context.addIssue({
        code: "custom",
        message: `Expected ${prefix}_ followed by a canonical ULID`,
      });
    }
  });

export const merchantOrderEventTypeSchema = z.enum([
  "CHECKOUT_CREATED",
  "CHECKOUT_UPDATED",
  "ORDER_CREATED",
  "CHECKOUT_CANCELED",
]);

export const merchantOrderEventStatusSchema = z.enum([
  "ready_for_payment",
  "completed",
  "canceled",
]);

export const merchantOrderLifecycleEventSchema = z
  .object({
    audience: merchantHttpsUrlSchema,
    checkout_session_id: checkoutSessionIdSchema,
    event_id: prefixedUlid("evt"),
    event_type: merchantOrderEventTypeSchema,
    expires_at: utcTimestampSchema,
    issued_at: utcTimestampSchema,
    issuer: merchantHttpsUrlSchema,
    kid: keyIdSchema,
    merchant_id: merchantIdSchema,
    nonce: offerNonceSchema,
    occurred_at: utcTimestampSchema,
    order_id: prefixedUlid("ord").optional(),
    schema_version: z.literal("mindpay.merchant.order-event.1"),
    state_hash: sha256HexSchema,
    status: merchantOrderEventStatusSchema,
  })
  .strict()
  .superRefine((event, context) => {
    const issuedAt = Date.parse(event.issued_at);
    if (Date.parse(event.expires_at) <= issuedAt) {
      context.addIssue({
        code: "custom",
        message: "Event expiry must follow issuance",
        path: ["expires_at"],
      });
    }
    if (Date.parse(event.occurred_at) > issuedAt) {
      context.addIssue({
        code: "custom",
        message: "Event occurrence cannot follow issuance",
        path: ["occurred_at"],
      });
    }
    if ((event.event_type === "ORDER_CREATED") !== (event.order_id !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "Only ORDER_CREATED events require an order ID",
        path: ["order_id"],
      });
    }
  })
  .readonly();

export const signedMerchantOrderLifecycleEventSchema = z
  .object({
    event: merchantOrderLifecycleEventSchema,
    signature: es256CanonicalSignatureSchema,
  })
  .strict()
  .superRefine((publication, context) => {
    if (publication.event.kid !== publication.signature.kid) {
      context.addIssue({
        code: "custom",
        message: "Event and signature key IDs must match",
        path: ["signature", "kid"],
      });
    }
  })
  .readonly();

export type MerchantOrderLifecycleEvent = z.infer<typeof merchantOrderLifecycleEventSchema>;
export type SignedMerchantOrderLifecycleEvent = z.infer<
  typeof signedMerchantOrderLifecycleEventSchema
>;

export interface MerchantOrderEventReplayStore {
  readonly claim: (nonce: string, expiresAtEpochMs: number) => Promise<boolean>;
}

export interface MerchantOrderEventVerificationInput {
  readonly body: unknown;
  readonly expectedAudience: string;
  readonly expectedIssuer: string;
  readonly expectedMerchantId: string;
  readonly replayStore: MerchantOrderEventReplayStore;
  readonly signingKeys: readonly unknown[];
}

export type MerchantOrderEventVerificationFailureReason =
  | "AUDIENCE_MISMATCH"
  | "EVENT_EXPIRED"
  | "EVENT_NOT_YET_VALID"
  | "EXPIRED_KEY"
  | "INVALID_EVENT"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_SIGNATURE"
  | "ISSUER_MISMATCH"
  | "KEY_NOT_YET_VALID"
  | "MERCHANT_MISMATCH"
  | "REPLAYED_EVENT"
  | "REVOKED_KEY"
  | "UNKNOWN_KEY";

export type MerchantOrderEventVerificationResult =
  | Readonly<{ event: MerchantOrderLifecycleEvent; valid: true }>
  | Readonly<{ reason: MerchantOrderEventVerificationFailureReason; valid: false }>;

export async function verifyMerchantOrderEvent(
  input: MerchantOrderEventVerificationInput,
  nowEpochMs = Date.now(),
): Promise<MerchantOrderEventVerificationResult> {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new RangeError("Event verification time must be safe epoch milliseconds");
  }

  const publication = signedMerchantOrderLifecycleEventSchema.safeParse(input.body);
  const expectedAudience = merchantHttpsUrlSchema.safeParse(input.expectedAudience);
  const expectedIssuer = merchantHttpsUrlSchema.safeParse(input.expectedIssuer);
  const expectedMerchantId = merchantIdSchema.safeParse(input.expectedMerchantId);
  const signingKeys = z.array(merchantSigningKeySchema).safeParse(input.signingKeys);
  if (
    !publication.success ||
    !expectedAudience.success ||
    !expectedIssuer.success ||
    !expectedMerchantId.success ||
    !signingKeys.success
  ) {
    return rejected("INVALID_EVENT");
  }

  const event = publication.data.event;
  if (event.audience !== expectedAudience.data) {
    return rejected("AUDIENCE_MISMATCH");
  }
  if (event.issuer !== expectedIssuer.data) {
    return rejected("ISSUER_MISMATCH");
  }
  if (event.merchant_id !== expectedMerchantId.data) {
    return rejected("MERCHANT_MISMATCH");
  }

  const issuedAtEpochMs = Date.parse(event.issued_at);
  const expiresAtEpochMs = Date.parse(event.expires_at);
  if (issuedAtEpochMs > nowEpochMs) {
    return rejected("EVENT_NOT_YET_VALID");
  }
  if (expiresAtEpochMs <= nowEpochMs) {
    return rejected("EVENT_EXPIRED");
  }

  const eventKey = signingKeys.data.find(
    (key) => key.kid === event.kid && key.purpose.includes("event"),
  );
  if (eventKey === undefined) {
    return rejected("UNKNOWN_KEY");
  }

  let verificationKey: Es256VerificationKey;
  try {
    verificationKey = {
      kid: eventKey.kid,
      publicKey: await importEs256PublicJwk(eventKey.public_jwk),
      validFromEpochMs: Date.parse(eventKey.valid_from),
      ...(eventKey.valid_until === undefined
        ? {}
        : { validUntilEpochMs: Date.parse(eventKey.valid_until) }),
      ...(eventKey.revoked_at === undefined
        ? {}
        : { revokedAtEpochMs: Date.parse(eventKey.revoked_at) }),
    };
  } catch {
    return rejected("INVALID_PUBLIC_KEY");
  }

  const verification = await verifyCanonicalJsonEs256(
    event,
    publication.data.signature,
    [verificationKey],
    nowEpochMs,
  );
  if (!verification.valid) {
    return rejected(verification.reason);
  }

  if (!(await input.replayStore.claim(event.nonce, expiresAtEpochMs))) {
    return rejected("REPLAYED_EVENT");
  }

  return Object.freeze({ event, valid: true });
}

function rejected(
  reason: MerchantOrderEventVerificationFailureReason,
): MerchantOrderEventVerificationResult {
  return Object.freeze({ reason, valid: false });
}
