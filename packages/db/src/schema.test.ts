import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  account,
  agentKeys,
  agentModelCapacityLeases,
  agentModelUsageWindows,
  agentRunEvents,
  agentRunEventTypes,
  agentRunSources,
  agentRunStatuses,
  agentRuns,
  agentStatuses,
  agents,
  agentToolCallStatuses,
  agentToolCalls,
  agentVerificationStatuses,
  agentVersions,
  agentVersionTools,
  approvalChallengePurposes,
  approvalChallengeStates,
  approvalChallenges,
  auditEvents,
  consumedNonceSources,
  consumedNonces,
  demoWorkspaces,
  idempotencyStates,
  mandateKinds,
  mandateProofs,
  mandateProofTypes,
  mandateStatuses,
  mandates,
  marketplaceCacheVersions,
  merchantAdminEvents,
  merchantCatalogs,
  merchantKeys,
  merchantManifests,
  merchantOperationalStatuses,
  merchantRiskTiers,
  merchants,
  merchantVerificationStatuses,
  merchantVerifications,
  merchantVerificationTiers,
  organizationRoles,
  organizationStatuses,
  passkeyCredentialDeviceTypes,
  passkeyCredentials,
  passkeyRegistrationChallenges,
  paymentAttemptStatuses,
  paymentAttempts,
  providerEventProcessingStatuses,
  providerEvents,
  rateLimit,
  schema,
  services,
  serviceVersions,
  session,
  spendReservationStatuses,
  spendReservations,
  transactionApprovalStates,
  transactionApprovals,
  transactionStates,
  transactions,
  user,
  verification,
} from "./schema";

describe("MindPay D1 schema", () => {
  it("exports the complete foundation and marketplace table set", () => {
    expect(
      Object.values(schema)
        .map((table) => getTableConfig(table).name)
        .sort(),
    ).toEqual([
      "account",
      "agent_keys",
      "agent_model_capacity_leases",
      "agent_model_usage_windows",
      "agent_run_events",
      "agent_runs",
      "agent_tool_calls",
      "agent_version_tools",
      "agent_versions",
      "agents",
      "approval_challenges",
      "audit_events",
      "consumed_nonces",
      "demo_workspaces",
      "idempotency_records",
      "mandate_proofs",
      "mandates",
      "marketplace_cache_versions",
      "merchant_admin_events",
      "merchant_catalogs",
      "merchant_keys",
      "merchant_manifests",
      "merchant_verifications",
      "merchants",
      "organization_members",
      "organizations",
      "passkey_credentials",
      "passkey_registration_challenges",
      "payment_attempts",
      "provider_events",
      "rate_limit",
      "replay_nonces",
      "service_versions",
      "services",
      "session",
      "spend_reservations",
      "transaction_approvals",
      "transactions",
      "user",
      "verification",
    ]);
  });

  it("keeps the Better Auth core table and field names compatible", () => {
    expect(columnNames(user)).toEqual([
      "id",
      "name",
      "email",
      "email_verified",
      "image",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(session)).toEqual([
      "id",
      "user_id",
      "token",
      "expires_at",
      "ip_address",
      "user_agent",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(account)).toEqual([
      "id",
      "user_id",
      "issuer",
      "account_id",
      "provider_id",
      "access_token",
      "refresh_token",
      "access_token_expires_at",
      "refresh_token_expires_at",
      "scope",
      "id_token",
      "password",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(verification)).toEqual([
      "id",
      "identifier",
      "value",
      "expires_at",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(rateLimit)).toEqual(["id", "key", "count", "last_request"]);
  });

  it("isolates model capacity leases and token budgets from authentication rate limits", () => {
    expect(columnNames(agentModelCapacityLeases)).toEqual(["key", "lease_id", "expires_at"]);
    expect(columnNames(agentModelUsageWindows)).toEqual([
      "key",
      "used_tokens",
      "window_started_at",
    ]);
  });

  it("stores only public passkey credential material and session-bound challenges", () => {
    expect(columnNames(passkeyCredentials)).toEqual([
      "id",
      "user_id",
      "name",
      "credential_id",
      "public_key",
      "webauthn_user_id",
      "counter",
      "device_type",
      "backed_up",
      "transports",
      "aaguid",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(passkeyRegistrationChallenges)).toEqual([
      "id",
      "session_id",
      "user_id",
      "challenge_hash",
      "webauthn_user_id",
      "rp_id",
      "origin",
      "expires_at",
      "consumed_at",
      "created_at",
    ]);
    expect(columnNames(passkeyCredentials)).not.toContain("private_key");
    expect(columnNames(approvalChallenges)).toEqual([
      "id",
      "organization_id",
      "user_id",
      "session_id",
      "mandate_id",
      "credential_id",
      "transaction_id",
      "rp_id",
      "origin",
      "purpose",
      "challenge_hash",
      "payload_hash",
      "state",
      "expires_at",
      "consumed_at",
      "created_at",
    ]);
  });

  it("stores demo expiry metadata separately from permanent organizations", () => {
    expect(columnNames(demoWorkspaces)).toEqual(["organization_id", "expires_at", "created_at"]);
    expect(getTableConfig(demoWorkspaces).checks.map((constraint) => constraint.name)).toContain(
      "demo_workspaces_expiry_valid",
    );
  });

  it("freezes authorization and lifecycle values", () => {
    expect(organizationRoles).toEqual(["OWNER", "ADMIN", "BUILDER", "REVIEWER", "VIEWER"]);
    expect(organizationStatuses).toEqual(["ACTIVE", "SUSPENDED", "EXPIRED"]);
    expect(passkeyCredentialDeviceTypes).toEqual(["singleDevice", "multiDevice"]);
    expect(approvalChallengePurposes).toEqual(["MANDATE_ACTIVATION", "TRANSACTION_STEP_UP"]);
    expect(approvalChallengeStates).toEqual(["PENDING", "CONSUMED", "EXPIRED", "CANCELLED"]);
    expect(idempotencyStates).toEqual(["PENDING", "COMPLETED", "FAILED"]);
    expect(merchantOperationalStatuses).toEqual(["ACTIVE", "SUSPENDED", "REVOKED"]);
    expect(merchantVerificationStatuses).toEqual([
      "SUBMITTED",
      "DOMAIN_VERIFIED",
      "KEY_VERIFIED",
      "CATALOG_VALIDATED",
      "PAYMENT_CONFIGURATION_VERIFIED",
      "APPROVED",
      "REVIEW_REQUIRED",
      "QUARANTINED",
    ]);
    expect(merchantRiskTiers).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(merchantVerificationTiers).toEqual(["NONE", "TEST_VERIFIED"]);
    expect(agentStatuses).toEqual(["ACTIVE", "ARCHIVED"]);
    expect(agentVerificationStatuses).toEqual(["NOT_RUN", "PASSED", "FAILED"]);
    expect(agentRunSources).toEqual(["AI", "MANUAL"]);
    expect(agentRunStatuses).toEqual(["RUNNING", "SUCCEEDED", "FAILED", "PROVIDER_UNAVAILABLE"]);
    expect(agentToolCallStatuses).toEqual(["RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"]);
    expect(agentRunEventTypes).toContain("MODEL_TEXT_DELTA");
    expect(mandateKinds).toEqual(["CHECKOUT", "PAYMENT"]);
    expect(mandateStatuses).toEqual([
      "DRAFT",
      "ACTIVE",
      "SUSPENDED",
      "EXHAUSTED",
      "EXPIRED",
      "REVOKED",
    ]);
    expect(mandateProofTypes).toEqual(["WEBAUTHN_ASSERTION", "PLATFORM_JWS", "AGENT_JWS"]);
    expect(transactionApprovalStates).toEqual(["ACTIVE", "CONSUMED", "EXPIRED", "REVOKED"]);
    expect(consumedNonceSources).toContain("MERCHANT_EVENT");
    expect(spendReservationStatuses).toEqual(["RESERVED", "COMMITTED", "RELEASED", "EXPIRED"]);
    expect(paymentAttemptStatuses).toEqual([
      "CREATED",
      "PENDING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
    ]);
    expect(providerEventProcessingStatuses).toEqual([
      "RECEIVED",
      "VERIFIED",
      "PROCESSED",
      "REJECTED",
    ]);
    expect(transactionStates).toContain("PAYMENT_RECONCILING");
  });

  it("models tenant-owned mandates, approvals, replay evidence, reservations, and bounded attempts", () => {
    expect(columnNames(mandates)).toEqual([
      "id",
      "organization_id",
      "user_id",
      "agent_id",
      "agent_version_id",
      "kind",
      "status",
      "schema_version",
      "payload_json",
      "payload_hash",
      "nonce",
      "currency",
      "max_transaction_subunits",
      "budget_subunits",
      "approval_threshold_subunits",
      "spent_subunits",
      "reserved_subunits",
      "max_transactions",
      "completed_transactions",
      "max_attempts",
      "allowed_rails_json",
      "allowed_merchants_json",
      "allowed_categories_json",
      "allowed_services_json",
      "line_item_constraints_json",
      "starts_at",
      "expires_at",
      "activated_at",
      "terminal_at",
      "retention_expires_at",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(mandateProofs)).toContain("retention_expires_at");
    expect(columnNames(transactions)).toContain("organization_id");
    expect(columnNames(transactionApprovals)).toContain("proof_hash");
    expect(columnNames(consumedNonces)).toContain("organization_id");
    expect(columnNames(spendReservations)).toContain("retention_expires_at");
    expect(columnNames(paymentAttempts)).toContain("attempt_number");
    expect(columnNames(providerEvents)).toContain("provider_event_id");

    expect(
      getTableConfig(transactionApprovals).indexes.map(
        (databaseIndex) => databaseIndex.config.name,
      ),
    ).toContain("transaction_approvals_active_logical_uq");
    expect(
      getTableConfig(consumedNonces).indexes.map((databaseIndex) => databaseIndex.config.name),
    ).toContain("consumed_nonces_organization_scope_nonce_uq");
    expect(
      getTableConfig(providerEvents).indexes.map((databaseIndex) => databaseIndex.config.name),
    ).toContain("provider_events_provider_event_uq");
    expect(getTableConfig(paymentAttempts).checks.map((constraint) => constraint.name)).toContain(
      "payment_attempts_number_valid",
    );
  });

  it("models organization-scoped agents with encrypted keys and immutable version bindings", () => {
    expect(columnNames(agents)).toEqual([
      "id",
      "organization_id",
      "name",
      "slug",
      "description",
      "status",
      "current_version_id",
      "created_by",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(agentVersions)).toContain("system_policy_hash");
    expect(columnNames(agentVersions)).toContain("configuration_json");
    expect(columnNames(agentVersionTools)).toEqual([
      "agent_version_id",
      "tool_version_id",
      "scope_json",
    ]);
    expect(columnNames(agentKeys)).toContain("encrypted_private_jwk");
    expect(columnNames(agentKeys)).not.toContain("private_jwk");
    expect(getTableConfig(agentKeys).checks.map((constraint) => constraint.name)).toContain(
      "agent_keys_public_jwk_valid",
    );
  });

  it("stores canonical runs, typed tool evidence, and reconnectable event sequences", () => {
    expect(columnNames(agentRuns)).toEqual([
      "id",
      "organization_id",
      "agent_id",
      "agent_version_id",
      "user_id",
      "transaction_id",
      "source",
      "status",
      "intent_summary",
      "decision_summary",
      "proposal_json",
      "failure_code",
      "started_at",
      "completed_at",
    ]);
    expect(columnNames(agentToolCalls)).toEqual([
      "id",
      "agent_run_id",
      "tool_version_id",
      "input_json",
      "output_json",
      "input_hash",
      "output_hash",
      "status",
      "error_code",
      "latency_ms",
      "created_at",
      "completed_at",
    ]);
    expect(columnNames(agentRunEvents)).toEqual([
      "agent_run_id",
      "sequence",
      "event_type",
      "payload_json",
      "payload_hash",
      "created_at",
    ]);
  });

  it("models immutable verified publications, checks, service versions, and admin events", () => {
    expect(columnNames(merchants)).toContain("verification_status");
    expect(columnNames(merchantKeys)).not.toContain("private_jwk");
    expect(columnNames(merchantManifests)).toContain("manifest_hash");
    expect(columnNames(merchantCatalogs)).toContain("catalog_hash");
    expect(columnNames(merchantVerifications)).toContain("evidence_json");
    expect(columnNames(services)).toContain("current_version_id");
    expect(columnNames(serviceVersions)).toContain("content_hash");
    expect(columnNames(merchantAdminEvents)).toContain("request_hash");
    expect(columnNames(marketplaceCacheVersions)).toEqual([
      "namespace",
      "generation",
      "updated_at",
    ]);
  });

  it("declares audit chain checks and uniqueness at the schema boundary", () => {
    const config = getTableConfig(auditEvents);

    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      "audit_events_chain_root_valid",
      "audit_events_event_hash_valid",
      "audit_events_expires_after_occurrence",
      "audit_events_occurrence_valid",
      "audit_events_payload_hash_valid",
      "audit_events_previous_hash_valid",
      "audit_events_schema_version_valid",
      "audit_events_sequence_nonnegative",
    ]);
    expect(config.indexes.map((databaseIndex) => databaseIndex.config.name).sort()).toEqual([
      "audit_events_created_at_idx",
      "audit_events_event_hash_uq",
      "audit_events_jti_uq",
      "audit_events_transaction_sequence_uq",
    ]);
  });
});

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}
