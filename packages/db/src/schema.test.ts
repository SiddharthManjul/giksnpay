import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  account,
  approvalChallengePurposes,
  approvalChallengeStates,
  auditEvents,
  demoWorkspaces,
  idempotencyStates,
  marketplaceCacheVersions,
  merchantAdminEvents,
  merchantCatalogs,
  merchantKeys,
  merchantManifests,
  merchantOperationalStatuses,
  merchantRiskTiers,
  merchants,
  merchantVerificationStatuses,
  merchantVerificationTiers,
  merchantVerifications,
  organizationRoles,
  organizationStatuses,
  passkeyCredentialDeviceTypes,
  passkeyCredentials,
  passkeyRegistrationChallenges,
  rateLimit,
  schema,
  services,
  serviceVersions,
  session,
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
      "approval_challenges",
      "audit_events",
      "demo_workspaces",
      "idempotency_records",
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
      "rate_limit",
      "replay_nonces",
      "service_versions",
      "services",
      "session",
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
