import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AcpSchemaName } from "./validation";
import { assertAcpSchema, validateAcpSchema } from "./validation";

const snapshotRoot = fileURLToPath(new URL("../../../protocol/acp/2026-04-17/", import.meta.url));

interface ConformanceCase {
  example: string;
  file: string;
  schema: AcpSchemaName;
}

const mappedConformanceCases: readonly ConformanceCase[] = [
  {
    file: "examples/examples.agentic_checkout.json",
    example: "create_checkout_session_request",
    schema: "checkoutSessionCreateRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "create_checkout_session_request_with_first_touch_attribution",
    schema: "checkoutSessionCreateRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "create_checkout_session_response",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "update_checkout_session_request",
    schema: "checkoutSessionUpdateRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "update_checkout_session_response",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "complete_checkout_session_request",
    schema: "checkoutSessionCompleteRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "complete_checkout_session_request_seller_backed",
    schema: "checkoutSessionCompleteRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "complete_checkout_session_request_with_last_touch_attribution",
    schema: "checkoutSessionCompleteRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "complete_checkout_session_response",
    schema: "checkoutSessionWithOrder",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "get_checkout_session_response",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "cancel_checkout_session_request",
    schema: "cancelSessionRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "cancel_checkout_session_request_timing_deferred",
    schema: "cancelSessionRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "cancel_checkout_session_response",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "checkout_session_authentication_required",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "checkout_session_with_out_of_stock",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "checkout_session_with_payment_declined",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "complete_session_with_authentication_result_request",
    schema: "checkoutSessionCompleteRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "complete_session_with_denied_authentication_request",
    schema: "checkoutSessionCompleteRequest",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "authentication_result_example",
    schema: "authenticationResult",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "authentication_result_denied_example",
    schema: "authenticationResult",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "authentication_result_frictionless_example",
    schema: "authenticationResult",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "discovery_response_full",
    schema: "discoveryResponse",
  },
  {
    file: "examples/examples.agentic_checkout.json",
    example: "discovery_response_minimal",
    schema: "discoveryResponse",
  },
  ...[
    "error_400_idempotency_key_required",
    "error_400_invalid_item",
    "error_400_requires_3ds",
    "error_409_idempotency_in_flight",
    "error_422_idempotency_conflict",
  ].map((example) => ({
    example,
    file: "examples/examples.agentic_checkout.json",
    schema: "checkoutError" as const,
  })),
  {
    file: "examples/examples.multi_item_checkout.json",
    example: "create_multi_item_checkout_request",
    schema: "checkoutSessionCreateRequest",
  },
  {
    file: "examples/examples.multi_item_checkout.json",
    example: "create_multi_item_checkout_response",
    schema: "checkoutSession",
  },
  {
    file: "examples/examples.delegate_payment.json",
    example: "delegate_payment_request",
    schema: "delegatePaymentRequest",
  },
  {
    file: "examples/examples.delegate_payment.json",
    example: "delegate_payment_success_response",
    schema: "delegatePaymentResponse",
  },
  ...[
    "delegate_payment_error_idempotency_conflict",
    "delegate_payment_error_idempotency_in_flight",
    "delegate_payment_error_idempotency_key_required",
    "delegate_payment_error_invalid_card",
    "delegate_payment_error_rate_limit",
  ].map((example) => ({
    example,
    file: "examples/examples.delegate_payment.json",
    schema: "delegatePaymentError" as const,
  })),
  ...[
    "create_authentication_session_request_minimal",
    "create_authentication_session_request_with_channel_and_acquirer_details",
  ].map((example) => ({
    example,
    file: "examples/examples.delegate_authentication.json",
    schema: "delegateAuthenticationCreateRequest" as const,
  })),
  ...[
    "authenticate_request_fingerprint_success",
    "authenticate_request_fingerprint_timeout",
    "authenticate_request_fingerprint_unavailable",
    "authenticate_request_with_deferred_channel",
  ].map((example) => ({
    example,
    file: "examples/examples.delegate_authentication.json",
    schema: "delegateAuthenticationAuthenticateRequest" as const,
  })),
  ...[
    "create_authentication_session_response_fingerprint_required",
    "create_authentication_session_response_not_supported",
    "create_authentication_session_response_pending",
  ].map((example) => ({
    example,
    file: "examples/examples.delegate_authentication.json",
    schema: "delegateAuthenticationSession" as const,
  })),
  ...[
    "authenticate_response_challenge_required",
    "authenticate_response_expired",
    "authenticate_response_frictionless_attempted",
    "authenticate_response_frictionless_authenticated",
    "authenticate_response_not_authenticated",
    "authenticate_response_rejected",
    "retrieve_session_response_attempted",
    "retrieve_session_response_authenticated",
    "retrieve_session_response_challenge_abandoned",
    "retrieve_session_response_expired",
    "retrieve_session_response_not_authenticated",
    "retrieve_session_response_rejected",
  ].map((example) => ({
    example,
    file: "examples/examples.delegate_authentication.json",
    schema: "delegateAuthenticationSessionWithResult" as const,
  })),
  ...["error_idempotency_conflict", "error_invalid_card"].map((example) => ({
    example,
    file: "examples/examples.delegate_authentication.json",
    schema: "delegateAuthenticationError" as const,
  })),
  {
    file: "examples/examples.feed.json",
    example: "create_feed_request_minimal",
    schema: "feedCreateRequest",
  },
  {
    file: "examples/examples.feed.json",
    example: "create_feed_response",
    schema: "feedMetadata",
  },
  {
    file: "examples/examples.feed.json",
    example: "get_feed_response",
    schema: "feedMetadata",
  },
  {
    file: "examples/examples.feed.json",
    example: "get_products_response",
    schema: "feedProductsResponse",
  },
  {
    file: "examples/examples.feed.json",
    example: "upsert_products_request_single_product",
    schema: "feedUpsertProductsRequest",
  },
  ...["feed_error_invalid_request", "feed_error_not_found"].map((example) => ({
    example,
    file: "examples/examples.feed.json",
    schema: "feedError" as const,
  })),
];

const knownUpstreamMismatchExamples = new Set([
  "examples/examples.agentic_checkout.json#authentication_result_denied_example",
  "examples/examples.multi_item_checkout.json#create_multi_item_checkout_request",
  "examples/examples.multi_item_checkout.json#create_multi_item_checkout_response",
  "examples/examples.delegate_authentication.json#retrieve_session_response_attempted",
  "examples/examples.delegate_authentication.json#retrieve_session_response_authenticated",
  "examples/examples.delegate_authentication.json#retrieve_session_response_challenge_abandoned",
  "examples/examples.delegate_authentication.json#retrieve_session_response_not_authenticated",
  "examples/examples.delegate_authentication.json#retrieve_session_response_rejected",
]);

const conformanceCases = mappedConformanceCases.filter(
  ({ example, file }) => !knownUpstreamMismatchExamples.has(`${file}#${example}`),
);
const knownUpstreamMismatchCases = mappedConformanceCases.filter(({ example, file }) =>
  knownUpstreamMismatchExamples.has(`${file}#${example}`),
);

describe("ACP 2026-04-17 conformance", () => {
  it.each(conformanceCases)("validates $file#$example as $schema", ({ example, file, schema }) => {
    const fixture = loadFixture(file, example);
    const result = validateAcpSchema(schema, fixture);

    expect(result).toEqual({ success: true });
  });

  it.each(knownUpstreamMismatchCases)(
    "preserves the known upstream mismatch $file#$example",
    ({ example, file, schema }) => {
      const fixture = loadFixture(file, example);

      expect(validateAcpSchema(schema, fixture).success).toBe(false);
    },
  );

  it("rejects malformed checkout examples", () => {
    const fixture = loadFixture(
      "examples/examples.agentic_checkout.json",
      "create_checkout_session_request",
    );
    const record = requireRecord(fixture);
    const { currency: _currency, ...missingCurrency } = record;

    expect(validateAcpSchema("checkoutSessionCreateRequest", missingCurrency).success).toBe(false);
    expect(
      validateAcpSchema("checkoutSessionCreateRequest", { ...record, unexpected: true }).success,
    ).toBe(false);
  });

  it("rejects malformed delegated payment and feed examples", () => {
    const payment = requireRecord(
      loadFixture("examples/examples.delegate_payment.json", "delegate_payment_request"),
    );
    const { payment_method: _paymentMethod, ...missingPaymentMethod } = payment;
    const feed = requireRecord(
      loadFixture("examples/examples.feed.json", "create_feed_request_minimal"),
    );

    expect(validateAcpSchema("delegatePaymentRequest", missingPaymentMethod).success).toBe(false);
    expect(validateAcpSchema("feedCreateRequest", { ...feed, target_country: 91 }).success).toBe(
      false,
    );
  });

  it("narrows and asserts values only after schema validation", () => {
    const fixture = loadFixture(
      "examples/examples.agentic_checkout.json",
      "create_checkout_session_request",
    );

    expect(() => assertAcpSchema("checkoutSessionCreateRequest", fixture)).not.toThrow();
    expect(() => assertAcpSchema("checkoutSessionCreateRequest", {})).toThrow(
      /Invalid ACP checkoutSessionCreateRequest/u,
    );
  });
});

function loadFixture(file: string, example: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(`${snapshotRoot}${file}`, "utf8"));
  const fixtures = requireRecord(parsed);
  if (!(example in fixtures)) {
    throw new Error(`Missing ACP fixture: ${file}#${example}`);
  }
  return fixtures[example];
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected an object fixture");
  }
  return value as Record<string, unknown>;
}
