import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(packageRoot, "wrangler.jsonc");
const databaseName = "mindpay";
const temporaryRoot = mkdtempSync(join(tmpdir(), "mindpay-d1-verification-"));
const firstDatabase = join(temporaryRoot, "first");
const secondDatabase = join(temporaryRoot, "second");
const migrationsRoot = join(packageRoot, "migrations");

const expectedTables = [
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
];

const expectedTriggers = [
  "agent_run_events_contiguous_sequence",
  "agent_run_events_no_delete",
  "agent_run_events_no_update",
  "agent_runs_identity_immutable",
  "agent_runs_no_delete",
  "agent_runs_require_published_version",
  "agent_runs_terminal_no_update",
  "agent_tool_calls_identity_immutable",
  "agent_tool_calls_no_delete",
  "agent_tool_calls_require_bound_tool",
  "agent_tool_calls_terminal_no_update",
  "agent_version_tools_no_delete_when_published",
  "agent_version_tools_no_insert_when_published",
  "agent_version_tools_no_update_when_published",
  "agent_versions_no_delete_when_published",
  "agent_versions_no_update_when_published",
  "agents_current_version_valid_on_insert",
  "agents_current_version_valid_on_update",
  "approval_challenges_context_immutable",
  "approval_challenges_require_webauthn_binding",
  "audit_events_no_delete",
  "audit_events_no_update",
  "consumed_nonces_no_update",
  "consumed_nonces_require_tenant_binding",
  "consumed_nonces_retention_guard",
  "mandate_proofs_no_update",
  "mandate_proofs_require_tenant_binding",
  "mandate_proofs_retention_guard",
  "mandates_identity_immutable",
  "mandates_require_tenant_binding",
  "mandates_retention_guard",
  "merchant_admin_events_no_delete",
  "merchant_admin_events_no_update",
  "merchant_admin_events_require_current_mutation",
  "merchant_catalogs_no_delete",
  "merchant_catalogs_no_update",
  "merchant_manifests_no_delete",
  "merchant_manifests_no_update",
  "merchant_verifications_no_delete",
  "merchant_verifications_no_update",
  "organization_members_preserve_owner_on_delete",
  "organization_members_preserve_owner_on_update",
  "payment_attempts_identity_immutable",
  "payment_attempts_require_tenant_binding",
  "payment_attempts_retention_guard",
  "provider_events_identity_immutable",
  "provider_events_require_tenant_binding",
  "provider_events_retention_guard",
  "service_versions_no_delete",
  "service_versions_no_update",
  "spend_reservations_commit_budget",
  "spend_reservations_identity_immutable",
  "spend_reservations_release_budget",
  "spend_reservations_require_tenant_binding",
  "spend_reservations_reserve_budget",
  "spend_reservations_retention_guard",
  "spend_reservations_terminal_once",
  "transaction_approvals_identity_immutable",
  "transaction_approvals_require_tenant_binding",
  "transaction_approvals_retention_guard",
  "transactions_identity_immutable",
  "transactions_require_tenant_binding",
  "transactions_retention_guard",
];
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const createdAt = 1_788_000_000_000;
const expiresAt = createdAt + 300_000;
const mandateExpiresAt = createdAt + 86_400_000;
const retentionExpiresAt = 4_102_444_800_000;

try {
  verifyDrizzleMetadata();
  applyMigrations(firstDatabase);
  applyMigrations(firstDatabase);
  applyMigrations(secondDatabase);

  const firstSchema = readSchema(firstDatabase);
  const secondSchema = readSchema(secondDatabase);
  assertEqual(firstSchema, secondSchema, "Fresh databases did not reproduce the same schema");

  const tableNames = firstSchema
    .filter((entry) => entry.type === "table")
    .map((entry) => entry.name)
    .sort();
  const triggerNames = firstSchema
    .filter((entry) => entry.type === "trigger")
    .map((entry) => entry.name)
    .sort();

  assertEqual(tableNames, expectedTables, "Unexpected migrated table set");
  assertEqual(triggerNames, expectedTriggers, "Database integrity triggers are missing");

  const migrationCount = query(firstDatabase, "SELECT count(*) AS count FROM d1_migrations");
  assert(migrationCount[0]?.count === 13, "Every migration must be recorded exactly once");

  seedIntegrityRecords(firstDatabase);
  verifyUniqueness(firstDatabase);
  verifyOwnerIntegrity(firstDatabase);
  verifyChecks(firstDatabase);
  verifyAgentIntegrity(firstDatabase);
  verifyMandatePersistence(firstDatabase);
  verifyAgentRunIntegrity(firstDatabase);
  verifyAuditImmutability(firstDatabase);

  const auditCount = query(firstDatabase, "SELECT count(*) AS count FROM audit_events");
  assert(auditCount[0]?.count === 1, "Rejected audit mutations changed the audit stream");

  process.stdout.write(
    `D1 migration verification passed: ${tableNames.length} tables, ${triggerNames.length} integrity triggers, reproducible schema.\n`,
  );
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}

function verifyDrizzleMetadata() {
  const migrationTags = readdirSync(migrationsRoot)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, -4))
    .sort();
  const journal = JSON.parse(readFileSync(join(migrationsRoot, "meta", "_journal.json"), "utf8"));
  const journalTags = journal.entries.map((entry) => entry.tag).sort();
  assertEqual(
    journalTags,
    migrationTags,
    "Drizzle journal entries do not match the reviewed SQL migrations",
  );
  const latestPrefix = migrationTags.at(-1)?.split("_")[0];
  assert(latestPrefix !== undefined, "At least one SQL migration is required");
  assert(
    readdirSync(join(migrationsRoot, "meta")).includes(`${latestPrefix}_snapshot.json`),
    `Drizzle snapshot ${latestPrefix}_snapshot.json is missing for the latest migration`,
  );
}

function applyMigrations(persistTo) {
  runWrangler([
    "d1",
    "migrations",
    "apply",
    databaseName,
    "--local",
    "--persist-to",
    persistTo,
    "--config",
    configPath,
  ]);
}

function readSchema(persistTo) {
  return query(
    persistTo,
    "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA', 'd1_migrations') ORDER BY type, name",
  );
}

function seedIntegrityRecords(persistTo) {
  execute(
    persistTo,
    [
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('usr_01JGFJH900H8M2APVYVDZ4R6AA', 'Demo Owner', 'owner@mindpay.test', 1, ${createdAt}, ${createdAt})`,
      `INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES ('ses_01JGFJH900H8M2APVYVDZ4R6AB', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', '${"s".repeat(32)}', ${expiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO account (id, user_id, issuer, account_id, provider_id, created_at, updated_at) VALUES ('acc_01JGFJH900H8M2APVYVDZ4R6AC', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'local:credential', 'owner@mindpay.test', 'credential', ${createdAt}, ${createdAt})`,
      `INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('ver_01JGFJH900H8M2APVYVDZ4R6AD', 'owner@mindpay.test', 'opaque-verification-value', ${expiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO rate_limit (id, key, count, last_request) VALUES ('rtl_01JGFJH900H8M2APVYVDZ4R6AP', '203.0.113.10|/sign-in/email', 1, ${createdAt})`,
      `INSERT INTO passkey_credentials (id, user_id, name, credential_id, public_key, webauthn_user_id, counter, device_type, backed_up, transports, aaguid, created_at, updated_at) VALUES ('pkc_01JGFJH900H8M2APVYVDZ4R6AM', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'Demo passkey', 'credential-demo-1', 'public-key-only', 'webauthn-user-demo', 0, 'singleDevice', 0, '["internal"]', '00000000-0000-0000-0000-000000000000', ${createdAt}, ${createdAt})`,
      `INSERT INTO passkey_registration_challenges (id, session_id, user_id, challenge_hash, webauthn_user_id, rp_id, origin, expires_at, consumed_at, created_at) VALUES ('pkr_01JGFJH900H8M2APVYVDZ4R6AN', 'ses_01JGFJH900H8M2APVYVDZ4R6AB', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', '${hashA}', 'webauthn-user-demo', 'mindpay.test', 'https://mindpay.test', ${expiresAt}, NULL, ${createdAt})`,
      `INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES ('org_01JGFJH900H8M2APVYVDZ4R6AE', 'Demo Workspace', 'demo-workspace', 'ACTIVE', ${createdAt}, ${createdAt})`,
      `INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES ('org_role_check', 'Role Check', 'role-check', 'ACTIVE', ${createdAt}, ${createdAt})`,
      `INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES ('org_01JGFJH900H8M2APVYVDZ4R6AE', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'OWNER', ${createdAt})`,
      `INSERT INTO demo_workspaces (organization_id, expires_at, created_at) VALUES ('org_01JGFJH900H8M2APVYVDZ4R6AE', ${expiresAt}, ${createdAt})`,
      `INSERT INTO replay_nonces (id, scope, nonce, subject_id, payload_hash, expires_at, consumed_at, created_at) VALUES ('rpl_01JGFJH900H8M2APVYVDZ4R6AF', 'merchant-event', 'nonce-demo-0001', 'merchant_demo', '${hashA}', ${expiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO approval_challenges (id, organization_id, user_id, transaction_id, purpose, challenge_hash, payload_hash, state, expires_at, consumed_at, created_at) VALUES ('chl_01JGFJH900H8M2APVYVDZ4R6AG', 'org_01JGFJH900H8M2APVYVDZ4R6AE', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'ctx_01JGFJH900H8M2APVYVDZ4R6AH', 'TRANSACTION_STEP_UP', '${hashB}', '${hashC}', 'PENDING', ${expiresAt}, NULL, ${createdAt})`,
      `INSERT INTO idempotency_records (scope, key, request_hash, response_status, response_body, state, expires_at, created_at) VALUES ('checkout:create', 'idem_01JGFJH900H8M2APVYVDZ4R6AI', '${hashA}', NULL, NULL, 'PENDING', ${expiresAt}, ${createdAt})`,
      `INSERT INTO audit_events (id, transaction_id, sequence, schema_version, event_type, actor_type, actor_id, issuer, audience, jti, payload_json, payload_hash, previous_event_hash, event_hash, signature, kid, occurred_at, expires_at, created_at) VALUES ('evt_01JGFJH900H8M2APVYVDZ4R6AJ', 'ctx_01JGFJH900H8M2APVYVDZ4R6AH', 0, 'mindpay.audit.event.1', 'USER_INTENT_RECEIVED', 'USER', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'https://api.mindpay.test/', 'https://mindpay.test/', 'evt_01JGFJH900H8M2APVYVDZ4R6AJ', '{"intent":"test"}', '${hashA}', NULL, '${hashB}', 'opaque-signature', 'mindpay-test-key', ${createdAt}, ${expiresAt}, ${createdAt})`,
    ].join("; "),
  );
}

function verifyUniqueness(persistTo) {
  expectFailure(
    persistTo,
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('usr_duplicate', 'Duplicate', 'OWNER@MINDPAY.TEST', 1, ${createdAt}, ${createdAt})`,
    "user_email_uq",
  );
  expectFailure(
    persistTo,
    `INSERT INTO account (id, user_id, issuer, account_id, provider_id, created_at, updated_at) VALUES ('acc_duplicate', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'local:credential', 'owner@mindpay.test', 'credential', ${createdAt}, ${createdAt})`,
    "UNIQUE constraint failed: account.issuer, account.account_id",
  );
  expectFailure(
    persistTo,
    `INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES ('ses_duplicate', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', '${"s".repeat(32)}', ${expiresAt}, ${createdAt}, ${createdAt})`,
    "UNIQUE constraint failed: session.token",
  );
  expectFailure(
    persistTo,
    `INSERT INTO rate_limit (id, key, count, last_request) VALUES ('rtl_duplicate', '203.0.113.10|/sign-in/email', 2, ${createdAt})`,
    "UNIQUE constraint failed: rate_limit.key",
  );
  expectFailure(
    persistTo,
    `INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, webauthn_user_id, counter, device_type, backed_up, transports, aaguid, created_at, updated_at) VALUES ('pkc_duplicate', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'credential-demo-1', 'other-public-key', 'other-webauthn-user', 0, 'singleDevice', 0, '[]', '00000000-0000-0000-0000-000000000000', ${createdAt}, ${createdAt})`,
    "UNIQUE constraint failed: passkey_credentials.credential_id",
  );
  expectFailure(
    persistTo,
    `INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES ('org_duplicate', 'Duplicate Workspace', 'demo-workspace', 'ACTIVE', ${createdAt}, ${createdAt})`,
    "organizations_slug_uq",
  );
  expectFailure(
    persistTo,
    `INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES ('org_01JGFJH900H8M2APVYVDZ4R6AE', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'ADMIN', ${createdAt})`,
    "UNIQUE constraint failed: organization_members.organization_id, organization_members.user_id",
  );
  expectFailure(
    persistTo,
    `INSERT INTO demo_workspaces (organization_id, expires_at, created_at) VALUES ('org_01JGFJH900H8M2APVYVDZ4R6AE', ${expiresAt}, ${createdAt})`,
    "UNIQUE constraint failed: demo_workspaces.organization_id",
  );
  expectFailure(
    persistTo,
    `INSERT INTO replay_nonces (id, scope, nonce, payload_hash, expires_at, consumed_at, created_at) VALUES ('rpl_duplicate', 'merchant-event', 'nonce-demo-0001', '${hashA}', ${expiresAt}, ${createdAt}, ${createdAt})`,
    "UNIQUE constraint failed: replay_nonces.scope, replay_nonces.nonce",
  );
  expectFailure(
    persistTo,
    `INSERT INTO approval_challenges (id, organization_id, user_id, purpose, challenge_hash, payload_hash, state, expires_at, created_at) VALUES ('chl_duplicate', 'org_01JGFJH900H8M2APVYVDZ4R6AE', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'MANDATE_ACTIVATION', '${hashB}', '${hashC}', 'PENDING', ${expiresAt}, ${createdAt})`,
    "UNIQUE constraint failed: approval_challenges.challenge_hash",
  );
  expectFailure(
    persistTo,
    `INSERT INTO idempotency_records (scope, key, request_hash, state, expires_at, created_at) VALUES ('checkout:create', 'idem_01JGFJH900H8M2APVYVDZ4R6AI', '${hashB}', 'PENDING', ${expiresAt}, ${createdAt})`,
    "UNIQUE constraint failed",
  );
  expectFailure(
    persistTo,
    `INSERT INTO audit_events (id, transaction_id, sequence, schema_version, event_type, actor_type, actor_id, issuer, audience, jti, payload_json, payload_hash, previous_event_hash, event_hash, signature, kid, occurred_at, expires_at, created_at) VALUES ('evt_duplicate', 'ctx_01JGFJH900H8M2APVYVDZ4R6AH', 0, 'mindpay.audit.event.1', 'POLICY_EVALUATED', 'SYSTEM', 'mindpay_policy', 'https://api.mindpay.test/', 'https://mindpay.test/', 'evt_duplicate', '{}', '${hashB}', NULL, '${hashC}', 'opaque-signature', 'mindpay-test-key', ${createdAt}, ${expiresAt}, ${createdAt})`,
    "UNIQUE constraint failed: audit_events.transaction_id, audit_events.sequence",
  );
}

function verifyOwnerIntegrity(persistTo) {
  expectFailure(
    persistTo,
    "UPDATE organization_members SET role = 'VIEWER' WHERE organization_id = 'org_01JGFJH900H8M2APVYVDZ4R6AE' AND user_id = 'usr_01JGFJH900H8M2APVYVDZ4R6AA'",
    "organization requires at least one owner",
  );
  expectFailure(
    persistTo,
    "DELETE FROM organization_members WHERE organization_id = 'org_01JGFJH900H8M2APVYVDZ4R6AE' AND user_id = 'usr_01JGFJH900H8M2APVYVDZ4R6AA'",
    "organization requires at least one owner",
  );

  execute(
    persistTo,
    [
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('usr_01JGFJH900H8M2APVYVDZ4R6AL', 'Second Owner', 'second-owner@mindpay.test', 1, ${createdAt}, ${createdAt})`,
      `INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES ('org_01JGFJH900H8M2APVYVDZ4R6AE', 'usr_01JGFJH900H8M2APVYVDZ4R6AL', 'OWNER', ${createdAt})`,
      "UPDATE organization_members SET role = 'VIEWER' WHERE organization_id = 'org_01JGFJH900H8M2APVYVDZ4R6AE' AND user_id = 'usr_01JGFJH900H8M2APVYVDZ4R6AA'",
    ].join("; "),
  );

  const ownerCount = query(
    persistTo,
    "SELECT count(*) AS count FROM organization_members WHERE organization_id = 'org_01JGFJH900H8M2APVYVDZ4R6AE' AND role = 'OWNER'",
  );
  assert(ownerCount[0]?.count === 1, "A permitted owner transfer left an invalid owner count");
}

function verifyChecks(persistTo) {
  expectFailure(
    persistTo,
    `INSERT INTO demo_workspaces (organization_id, expires_at, created_at) VALUES ('org_role_check', ${createdAt}, ${createdAt})`,
    "demo_workspaces_expiry_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO rate_limit (id, key, count, last_request) VALUES ('rtl_invalid', '203.0.113.11|/sign-in/email', 0, ${createdAt})`,
    "rate_limit_count_positive",
  );
  expectFailure(
    persistTo,
    `INSERT INTO passkey_registration_challenges (id, session_id, user_id, challenge_hash, webauthn_user_id, rp_id, origin, expires_at, created_at) VALUES ('pkr_invalid', 'ses_01JGFJH900H8M2APVYVDZ4R6AB', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'NOT-A-SHA256', 'webauthn-user-demo', 'mindpay.test', 'https://mindpay.test', ${expiresAt}, ${createdAt})`,
    "passkey_registration_challenges_hash_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO replay_nonces (id, scope, nonce, payload_hash, expires_at, consumed_at, created_at) VALUES ('rpl_invalid', 'merchant-event', 'nonce-demo-0002', 'NOT-A-SHA256', ${expiresAt}, ${createdAt}, ${createdAt})`,
    "replay_nonces_payload_hash_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO approval_challenges (id, organization_id, user_id, purpose, challenge_hash, payload_hash, state, expires_at, consumed_at, created_at) VALUES ('chl_invalid', 'org_01JGFJH900H8M2APVYVDZ4R6AE', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'TRANSACTION_STEP_UP', '${hashC}', '${hashA}', 'CONSUMED', ${expiresAt}, NULL, ${createdAt})`,
    "approval_challenges_consumption_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES ('org_role_check', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'SUPER_ADMIN', ${createdAt})`,
    "organization_members_role_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO idempotency_records (scope, key, request_hash, response_status, response_body, state, expires_at, created_at) VALUES ('checkout:update', 'idem_01JGFJH900H8M2APVYVDZ4R6AK', '${hashC}', 200, '{}', 'PENDING', ${expiresAt}, ${createdAt})`,
    "idempotency_records_response_state_valid",
  );
}

function verifyAuditImmutability(persistTo) {
  expectFailure(
    persistTo,
    "UPDATE audit_events SET event_type = 'POLICY_EVALUATED' WHERE id = 'evt_01JGFJH900H8M2APVYVDZ4R6AJ'",
    "audit_events are append-only",
  );
  expectFailure(
    persistTo,
    "DELETE FROM audit_events WHERE id = 'evt_01JGFJH900H8M2APVYVDZ4R6AJ'",
    "audit_events are append-only",
  );
}

function verifyAgentIntegrity(persistTo) {
  const agentId = "agt_01JGFJH900H8M2APVYVDZ4R6AA";
  const versionId = "agv_01JGFJH900H8M2APVYVDZ4R6AA";
  execute(
    persistTo,
    [
      `INSERT INTO agents (id, organization_id, name, slug, description, status, current_version_id, created_by, created_at, updated_at) VALUES ('${agentId}', 'org_01JGFJH900H8M2APVYVDZ4R6AE', 'Research Agent', 'research-agent', 'Researches approved services.', 'ACTIVE', NULL, 'usr_01JGFJH900H8M2APVYVDZ4R6AA', ${createdAt}, ${createdAt})`,
      `INSERT INTO agent_versions (id, agent_id, version, model_provider, model_name, system_policy, system_policy_hash, specialization, configuration_json, verification_status, published_at, created_at) VALUES ('${versionId}', '${agentId}', '1.0.0', 'openai', 'gpt-5', 'Only research approved MindPay services.', '${hashA}', 'Service research', '{"maxOutputTokens":2048,"temperature":0.2}', 'NOT_RUN', NULL, ${createdAt})`,
      `INSERT INTO agent_version_tools (agent_version_id, tool_version_id, scope_json) VALUES ('${versionId}', 'search_verified_services.v1', '{"allowedCategories":["business_research"],"maximumPriceSubunits":40000}')`,
      `INSERT INTO agent_keys (id, agent_id, kid, public_jwk, encrypted_private_jwk, valid_from, revoked_at, created_at) VALUES ('aky_01JGFJH900H8M2APVYVDZ4R6AA', '${agentId}', 'agent.research.signing.1', '{"kty":"EC","crv":"P-256","x":"${"A".repeat(43)}","y":"${"A".repeat(42)}Q"}', '{"algorithm":"A256GCM","version":1,"iv":"${"A".repeat(16)}","ciphertext":"${"C".repeat(32)}"}', ${createdAt}, NULL, ${createdAt})`,
      `UPDATE agent_versions SET published_at = ${createdAt} WHERE id = '${versionId}'`,
      `UPDATE agents SET current_version_id = '${versionId}', updated_at = ${createdAt} WHERE id = '${agentId}'`,
    ].join("; "),
  );

  expectFailure(
    persistTo,
    `UPDATE agent_versions SET system_policy = 'A changed policy that must never be accepted.' WHERE id = '${versionId}'`,
    "published agent versions are immutable",
  );
  expectFailure(
    persistTo,
    `DELETE FROM agent_versions WHERE id = '${versionId}'`,
    "published agent versions are immutable",
  );
  expectFailure(
    persistTo,
    `INSERT INTO agent_version_tools (agent_version_id, tool_version_id, scope_json) VALUES ('${versionId}', 'tool_version_v2', '{}')`,
    "published agent tool bindings are immutable",
  );
  expectFailure(
    persistTo,
    `UPDATE agent_version_tools SET scope_json = '{}' WHERE agent_version_id = '${versionId}' AND tool_version_id = 'search_verified_services.v1'`,
    "published agent tool bindings are immutable",
  );
  expectFailure(
    persistTo,
    `DELETE FROM agent_version_tools WHERE agent_version_id = '${versionId}' AND tool_version_id = 'search_verified_services.v1'`,
    "published agent tool bindings are immutable",
  );
  expectFailure(
    persistTo,
    `UPDATE agents SET current_version_id = 'agv_01JGFJH900H8M2APVYVDZ4R6AB' WHERE id = '${agentId}'`,
    "agent current version must be its published version",
  );
  expectFailure(
    persistTo,
    `INSERT INTO agent_keys (id, agent_id, kid, public_jwk, encrypted_private_jwk, valid_from, created_at) VALUES ('aky_01JGFJH900H8M2APVYVDZ4R6AB', '${agentId}', 'agent.leaked', '{"kty":"EC","crv":"P-256","x":"${"A".repeat(43)}","y":"${"A".repeat(42)}Q","d":"private"}', '{"algorithm":"A256GCM","version":1,"iv":"${"A".repeat(16)}","ciphertext":"${"C".repeat(32)}"}', ${createdAt}, ${createdAt})`,
    "agent_keys_public_jwk_valid",
  );
}

function verifyMandatePersistence(persistTo) {
  const organizationId = "org_01JGFJH900H8M2APVYVDZ4R6AE";
  const userId = "usr_01JGFJH900H8M2APVYVDZ4R6AA";
  const agentId = "agt_01JGFJH900H8M2APVYVDZ4R6AA";
  const agentVersionId = "agv_01JGFJH900H8M2APVYVDZ4R6AA";
  const merchantId = "merchant_signalworks";
  const serviceId = "svc_market_snapshot";
  const serviceVersionId = "svv_market_snapshot_1";
  const mandateId = "mnd_01JGFJH900H8M2APVYVDZ4R6AA";
  const transactionId = "ctx_01JGFJH900H8M2APVYVDZ4R6AH";
  const challengeId = "chl_01JGFJH900H8M2APVYVDZ4R6AG";
  const approvalId = "tap_01JGFJH900H8M2APVYVDZ4R6AA";
  const attemptId = "pat_01JGFJH900H8M2APVYVDZ4R6AA";

  execute(
    persistTo,
    [
      `INSERT INTO merchants (id, organization_id, name, slug, legal_name, domain, status, verification_status, risk_tier, verification_tier, last_admin_event_id, revision, created_at, updated_at) VALUES ('${merchantId}', '${organizationId}', 'SignalWorks', 'signalworks', 'SignalWorks Test Private Limited', 'signalworks.test', 'ACTIVE', 'APPROVED', 'LOW', 'TEST_VERIFIED', 'adm_seed_signalworks', 0, ${createdAt}, ${createdAt})`,
      `INSERT INTO services (id, merchant_id, external_id, name, description, category, status, created_at, updated_at) VALUES ('${serviceId}', '${merchantId}', 'market_snapshot', 'Market Snapshot', 'Verified competitor research snapshot.', 'business_research', 'ACTIVE', ${createdAt}, ${createdAt})`,
      `INSERT INTO service_versions (id, service_id, version, price_subunits, currency, availability, fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url, terms_url, catalog_hash, content_hash, published_at, verified_at) VALUES ('${serviceVersionId}', '${serviceId}', '1.0.0', 29900, 'INR', 'available', 'mcp', 'signalworks.research.v1', 60, 'https://signalworks.test/privacy', 'https://signalworks.test/terms', '${hashA}', '${hashB}', ${createdAt}, ${createdAt})`,
      `INSERT INTO mandates (id, organization_id, user_id, agent_id, agent_version_id, kind, status, schema_version, payload_json, payload_hash, nonce, currency, max_transaction_subunits, budget_subunits, approval_threshold_subunits, spent_subunits, reserved_subunits, max_transactions, completed_transactions, max_attempts, allowed_rails_json, allowed_merchants_json, allowed_categories_json, allowed_services_json, line_item_constraints_json, starts_at, expires_at, activated_at, terminal_at, retention_expires_at, created_at, updated_at) VALUES ('${mandateId}', '${organizationId}', '${userId}', '${agentId}', '${agentVersionId}', 'PAYMENT', 'ACTIVE', 'mindpay.mandate.payment.open.1', '{}', '${hashA}', 'nonce-open-payment-0001', 'INR', 50000, 100000, 35000, 0, 0, 2, 0, 2, '["razorpay:test"]', '["${merchantId}"]', '[]', '[]', NULL, ${createdAt}, ${mandateExpiresAt}, ${createdAt}, NULL, ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO mandate_proofs (id, organization_id, mandate_id, proof_type, payload_hash, proof_hash, proof_json, key_id, verified_at, retention_expires_at, created_at) VALUES ('mpr_01JGFJH900H8M2APVYVDZ4R6AA', '${organizationId}', '${mandateId}', 'WEBAUTHN_ASSERTION', '${hashA}', '${hashB}', '{}', 'passkey.demo.1', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
      `INSERT INTO transactions (id, organization_id, user_id, agent_id, agent_version_id, merchant_id, service_version_id, mandate_id, state, amount_subunits, currency, request_id, retention_expires_at, created_at, updated_at) VALUES ('${transactionId}', '${organizationId}', '${userId}', '${agentId}', '${agentVersionId}', '${merchantId}', '${serviceVersionId}', '${mandateId}', 'APPROVAL_REQUIRED', 29900, 'INR', 'req_mandate_demo_0001', ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
      `UPDATE approval_challenges SET state = 'CONSUMED', consumed_at = ${createdAt} WHERE id = '${challengeId}'`,
      `INSERT INTO transaction_approvals (id, organization_id, transaction_id, mandate_id, user_id, challenge_id, credential_id, payload_hash, proof_hash, proof_json, status, approved_at, expires_at, retention_expires_at, created_at) VALUES ('${approvalId}', '${organizationId}', '${transactionId}', '${mandateId}', '${userId}', '${challengeId}', 'pkc_01JGFJH900H8M2APVYVDZ4R6AM', '${hashC}', '${hashB}', '{}', 'ACTIVE', ${createdAt}, ${expiresAt}, ${retentionExpiresAt}, ${createdAt})`,
      `INSERT INTO consumed_nonces (id, organization_id, mandate_id, transaction_id, source, scope, nonce, payload_hash, consumed_at, retention_expires_at, created_at) VALUES ('rpn_01JGFJH900H8M2APVYVDZ4R6AA', '${organizationId}', '${mandateId}', '${transactionId}', 'CLOSED_MANDATE', 'closed-payment', 'nonce-closed-payment-0001', '${hashC}', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
      `INSERT INTO spend_reservations (id, organization_id, mandate_id, transaction_id, amount_subunits, status, expires_at, retention_expires_at, created_at, updated_at) VALUES ('rsv_01JGFJH900H8M2APVYVDZ4R6AA', '${organizationId}', '${mandateId}', '${transactionId}', 29900, 'RESERVED', ${expiresAt}, ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO payment_attempts (id, organization_id, transaction_id, mandate_id, attempt_number, amount_subunits, currency, status, checkout_hash, provider, provider_order_id, retention_expires_at, created_at, updated_at) VALUES ('${attemptId}', '${organizationId}', '${transactionId}', '${mandateId}', 1, 29900, 'INR', 'PENDING', '${hashA}', 'RAZORPAY', 'order_demo_0001', ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO provider_events (id, organization_id, transaction_id, payment_attempt_id, provider, provider_event_id, event_type, payload_hash, raw_payload_r2_key, signature_verified, processing_status, received_at, retention_expires_at, created_at) VALUES ('pev_01JGFJH900H8M2APVYVDZ4R6AA', '${organizationId}', '${transactionId}', '${attemptId}', 'RAZORPAY', 'event_demo_0001', 'payment.captured', '${hashB}', 'private/provider-events/event_demo_0001', 1, 'RECEIVED', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
    ].join("; "),
  );

  execute(
    persistTo,
    `INSERT INTO approval_challenges (id, organization_id, user_id, transaction_id, purpose, challenge_hash, payload_hash, state, expires_at, consumed_at, created_at) VALUES ('chl_01JGFJH900H8M2APVYVDZ4R6AZ', '${organizationId}', '${userId}', '${transactionId}', 'TRANSACTION_STEP_UP', '${hashA}', '${hashC}', 'CONSUMED', ${expiresAt}, ${createdAt}, ${createdAt})`,
  );
  const reservedAfterInsert = query(
    persistTo,
    `SELECT reserved_subunits FROM mandates WHERE id = '${mandateId}'`,
  );
  assert(
    reservedAfterInsert[0]?.reserved_subunits === 29900,
    "Reservation insertion did not atomically increment mandate budget",
  );

  const concurrentTransactionA = "ctx_01JGFJH900H8M2APVYVDZ4R6BA";
  const concurrentTransactionB = "ctx_01JGFJH900H8M2APVYVDZ4R6BB";
  execute(
    persistTo,
    [
      `INSERT INTO transactions (id, organization_id, user_id, agent_id, agent_version_id, merchant_id, service_version_id, mandate_id, state, amount_subunits, currency, request_id, retention_expires_at, created_at, updated_at) VALUES ('${concurrentTransactionA}', '${organizationId}', '${userId}', '${agentId}', '${agentVersionId}', '${merchantId}', '${serviceVersionId}', '${mandateId}', 'APPROVED', 49900, 'INR', 'req_budget_race_a', ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO transactions (id, organization_id, user_id, agent_id, agent_version_id, merchant_id, service_version_id, mandate_id, state, amount_subunits, currency, request_id, retention_expires_at, created_at, updated_at) VALUES ('${concurrentTransactionB}', '${organizationId}', '${userId}', '${agentId}', '${agentVersionId}', '${merchantId}', '${serviceVersionId}', '${mandateId}', 'APPROVED', 49900, 'INR', 'req_budget_race_b', ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
      `INSERT INTO spend_reservations (id, organization_id, mandate_id, transaction_id, amount_subunits, status, expires_at, retention_expires_at, created_at, updated_at) VALUES ('rsv_01JGFJH900H8M2APVYVDZ4R6BA', '${organizationId}', '${mandateId}', '${concurrentTransactionA}', 49900, 'RESERVED', ${expiresAt}, ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
    ].join("; "),
  );
  expectFailure(
    persistTo,
    `INSERT INTO spend_reservations (id, organization_id, mandate_id, transaction_id, amount_subunits, status, expires_at, retention_expires_at, created_at, updated_at) VALUES ('rsv_01JGFJH900H8M2APVYVDZ4R6BB', '${organizationId}', '${mandateId}', '${concurrentTransactionB}', 49900, 'RESERVED', ${expiresAt}, ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
    "budget unavailable",
  );
  const budgetAfterRace = query(
    persistTo,
    `SELECT budget_subunits, reserved_subunits, spent_subunits FROM mandates WHERE id = '${mandateId}'`,
  );
  assert(
    budgetAfterRace[0]?.spent_subunits + budgetAfterRace[0]?.reserved_subunits <=
      budgetAfterRace[0]?.budget_subunits,
    "Atomic reservation enforcement allowed spend plus reserved to exceed budget",
  );
  execute(
    persistTo,
    [
      `UPDATE spend_reservations SET status = 'RELEASED', closed_at = ${createdAt}, updated_at = ${createdAt} WHERE id = 'rsv_01JGFJH900H8M2APVYVDZ4R6AA'`,
      `UPDATE spend_reservations SET status = 'RELEASED', closed_at = ${createdAt}, updated_at = ${createdAt} WHERE id = 'rsv_01JGFJH900H8M2APVYVDZ4R6BA'`,
    ].join("; "),
  );
  expectFailure(
    persistTo,
    `UPDATE spend_reservations SET status = 'COMMITTED' WHERE id = 'rsv_01JGFJH900H8M2APVYVDZ4R6BA'`,
    "spend reservation can close exactly once",
  );
  const budgetAfterRelease = query(
    persistTo,
    `SELECT reserved_subunits FROM mandates WHERE id = '${mandateId}'`,
  );
  assert(
    budgetAfterRelease[0]?.reserved_subunits === 0,
    "Reservation release did not atomically return budget",
  );
  execute(
    persistTo,
    `UPDATE mandates SET status = 'REVOKED', terminal_at = ${createdAt}, updated_at = ${createdAt} WHERE id = '${mandateId}' AND status = 'ACTIVE'`,
  );
  expectFailure(
    persistTo,
    `INSERT INTO spend_reservations (id, organization_id, mandate_id, transaction_id, amount_subunits, status, expires_at, retention_expires_at, created_at, updated_at) VALUES ('rsv_01JGFJH900H8M2APVYVDZ4R6BC', '${organizationId}', '${mandateId}', '${concurrentTransactionB}', 49900, 'RESERVED', ${expiresAt}, ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
    "budget unavailable",
  );
  expectFailure(
    persistTo,
    `INSERT INTO mandates (id, organization_id, user_id, agent_id, agent_version_id, kind, status, schema_version, payload_json, payload_hash, nonce, currency, max_transaction_subunits, budget_subunits, approval_threshold_subunits, max_transactions, max_attempts, allowed_rails_json, allowed_merchants_json, allowed_categories_json, allowed_services_json, starts_at, expires_at, retention_expires_at, created_at, updated_at) VALUES ('mnd_01JGFJH900H8M2APVYVDZ4R6AZ', '${organizationId}', '${userId}', '${agentId}', '${agentVersionId}', 'PAYMENT', 'DRAFT', 'mindpay.mandate.payment.open.1', '{}', '${hashB}', 'nonce-open-payment-null-budget', 'INR', 50000, NULL, 35000, 2, 2, '["razorpay:test"]', '["${merchantId}"]', '[]', '[]', ${createdAt}, ${mandateExpiresAt}, ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
    "mandates_payment_bounds_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO transaction_approvals (id, organization_id, transaction_id, mandate_id, user_id, challenge_id, credential_id, payload_hash, proof_hash, proof_json, status, approved_at, expires_at, retention_expires_at, created_at) VALUES ('tap_01JGFJH900H8M2APVYVDZ4R6AZ', '${organizationId}', '${transactionId}', '${mandateId}', '${userId}', 'chl_01JGFJH900H8M2APVYVDZ4R6AZ', 'pkc_01JGFJH900H8M2APVYVDZ4R6AM', '${hashC}', '${hashA}', '{}', 'ACTIVE', ${createdAt}, ${expiresAt}, ${retentionExpiresAt}, ${createdAt})`,
    "UNIQUE constraint failed: transaction_approvals.organization_id, transaction_approvals.transaction_id, transaction_approvals.payload_hash",
  );
  expectFailure(
    persistTo,
    `INSERT INTO consumed_nonces (id, organization_id, source, scope, nonce, payload_hash, consumed_at, retention_expires_at, created_at) VALUES ('rpn_01JGFJH900H8M2APVYVDZ4R6AZ', '${organizationId}', 'MERCHANT_EVENT', 'closed-payment', 'nonce-closed-payment-0001', '${hashA}', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
    "UNIQUE constraint failed: consumed_nonces.organization_id, consumed_nonces.scope, consumed_nonces.nonce",
  );
  expectFailure(
    persistTo,
    `INSERT INTO provider_events (id, organization_id, transaction_id, provider, provider_event_id, event_type, payload_hash, raw_payload_r2_key, signature_verified, processing_status, received_at, retention_expires_at, created_at) VALUES ('pev_01JGFJH900H8M2APVYVDZ4R6AZ', '${organizationId}', '${transactionId}', 'RAZORPAY', 'event_demo_0001', 'payment.failed', '${hashC}', 'private/provider-events/event_demo_duplicate', 1, 'RECEIVED', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
    "UNIQUE constraint failed: provider_events.provider, provider_events.provider_event_id",
  );
  expectFailure(
    persistTo,
    `INSERT INTO provider_events (id, organization_id, transaction_id, provider, provider_event_id, event_type, payload_hash, raw_payload_r2_key, signature_verified, processing_status, received_at, retention_expires_at, created_at) VALUES ('pev_01JGFJH900H8M2APVYVDZ4R6AY', '${organizationId}', '${transactionId}', 'RAZORPAY', 'event_demo_invalid_boolean', 'payment.failed', '${hashC}', 'private/provider-events/event_demo_invalid_boolean', 2, 'RECEIVED', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
    "provider_events_signature_verified_valid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO payment_attempts (id, organization_id, transaction_id, mandate_id, attempt_number, amount_subunits, currency, status, checkout_hash, provider, retention_expires_at, created_at, updated_at) VALUES ('pat_01JGFJH900H8M2APVYVDZ4R6AZ', '${organizationId}', '${transactionId}', '${mandateId}', 3, 29900, 'INR', 'CREATED', '${hashA}', 'RAZORPAY', ${retentionExpiresAt}, ${createdAt}, ${createdAt})`,
    "payment attempt tenant, amount, or limit binding is invalid",
  );
  expectFailure(
    persistTo,
    `INSERT INTO mandate_proofs (id, organization_id, mandate_id, proof_type, payload_hash, proof_hash, proof_json, verified_at, retention_expires_at, created_at) VALUES ('mpr_01JGFJH900H8M2APVYVDZ4R6AZ', 'org_role_check', '${mandateId}', 'PLATFORM_JWS', '${hashA}', '${hashC}', '{}', ${createdAt}, ${retentionExpiresAt}, ${createdAt})`,
    "mandate proof tenant binding is invalid",
  );
  expectFailure(
    persistTo,
    "UPDATE mandate_proofs SET proof_json = '{\"changed\":true}' WHERE id = 'mpr_01JGFJH900H8M2APVYVDZ4R6AA'",
    "mandate proofs are immutable evidence",
  );
  expectFailure(
    persistTo,
    `DELETE FROM payment_attempts WHERE id = '${attemptId}'`,
    "payment attempt retention period has not expired",
  );

  execute(
    persistTo,
    `UPDATE provider_events SET processing_status = 'PROCESSED', processed_at = ${createdAt} WHERE id = 'pev_01JGFJH900H8M2APVYVDZ4R6AA'`,
  );
  const providerEvent = query(
    persistTo,
    "SELECT processing_status, processed_at FROM provider_events WHERE id = 'pev_01JGFJH900H8M2APVYVDZ4R6AA'",
  );
  assert(
    providerEvent[0]?.processing_status === "PROCESSED" &&
      providerEvent[0]?.processed_at === createdAt,
    "A legal provider-event processing update was rejected",
  );
}

function verifyAgentRunIntegrity(persistTo) {
  const runId = "run_01JGFJH900H8M2APVYVDZ4R6AA";
  const toolCallId = "tlc_01JGFJH900H8M2APVYVDZ4R6AA";
  const timedOutToolCallId = "tlc_01JGFJH900H8M2APVYVDZ4R6AC";
  execute(
    persistTo,
    [
      `INSERT INTO agent_runs (id, organization_id, agent_id, agent_version_id, user_id, source, status, started_at) VALUES ('${runId}', 'org_01JGFJH900H8M2APVYVDZ4R6AE', 'agt_01JGFJH900H8M2APVYVDZ4R6AA', 'agv_01JGFJH900H8M2APVYVDZ4R6AA', 'usr_01JGFJH900H8M2APVYVDZ4R6AA', 'AI', 'RUNNING', ${createdAt})`,
      `INSERT INTO agent_run_events (agent_run_id, sequence, event_type, payload_json, payload_hash, created_at) VALUES ('${runId}', 0, 'RUN_STARTED', '{}', '${hashA}', ${createdAt})`,
      `INSERT INTO agent_tool_calls (id, agent_run_id, tool_version_id, input_json, input_hash, status, created_at) VALUES ('${toolCallId}', '${runId}', 'search_verified_services.v1', '{}', '${hashA}', 'RUNNING', ${createdAt})`,
      `UPDATE agent_tool_calls SET output_json = '{"trust":"UNTRUSTED_EXTERNAL_DATA","data":{}}', output_hash = '${hashB}', status = 'SUCCEEDED', latency_ms = 12, completed_at = ${createdAt} WHERE id = '${toolCallId}'`,
      `INSERT INTO agent_tool_calls (id, agent_run_id, tool_version_id, input_json, input_hash, status, created_at) VALUES ('${timedOutToolCallId}', '${runId}', 'search_verified_services.v1', '{}', '${hashA}', 'RUNNING', ${createdAt})`,
      `UPDATE agent_tool_calls SET status = 'TIMED_OUT', error_code = 'TOOL_TIMEOUT', latency_ms = 5000, completed_at = ${createdAt} WHERE id = '${timedOutToolCallId}'`,
      `INSERT INTO agent_run_events (agent_run_id, sequence, event_type, payload_json, payload_hash, created_at) VALUES ('${runId}', 1, 'TOOL_CALL_FAILED', '{"errorCode":"TOOL_TIMEOUT"}', '${hashC}', ${createdAt})`,
      `UPDATE agent_runs SET status = 'SUCCEEDED', intent_summary = 'business research', decision_summary = 'Selected a verified service within the stated purchase budget.', proposal_json = '{}', completed_at = ${createdAt} WHERE id = '${runId}'`,
      `INSERT INTO agent_run_events (agent_run_id, sequence, event_type, payload_json, payload_hash, created_at) VALUES ('${runId}', 2, 'RUN_COMPLETED', '{}', '${hashB}', ${createdAt})`,
    ].join("; "),
  );

  expectFailure(
    persistTo,
    `INSERT INTO agent_tool_calls (id, agent_run_id, tool_version_id, input_json, input_hash, status, created_at) VALUES ('tlc_01JGFJH900H8M2APVYVDZ4R6AB', '${runId}', 'shell.execute.v1', '{}', '${hashA}', 'RUNNING', ${createdAt})`,
    "agent tool call requires an immutable version binding",
  );
  expectFailure(
    persistTo,
    `INSERT INTO agent_run_events (agent_run_id, sequence, event_type, payload_json, payload_hash, created_at) VALUES ('${runId}', 4, 'MODEL_TEXT_DELTA', '{}', '${hashC}', ${createdAt})`,
    "agent run event sequence must be contiguous",
  );
  expectFailure(
    persistTo,
    `UPDATE agent_run_events SET event_type = 'RUN_FAILED' WHERE agent_run_id = '${runId}' AND sequence = 0`,
    "agent run events are append-only",
  );
  expectFailure(
    persistTo,
    `DELETE FROM agent_run_events WHERE agent_run_id = '${runId}' AND sequence = 0`,
    "agent run events are append-only",
  );
  expectFailure(
    persistTo,
    `UPDATE agent_tool_calls SET latency_ms = 13 WHERE id = '${toolCallId}'`,
    "terminal agent tool calls are immutable",
  );
  expectFailure(
    persistTo,
    `UPDATE agent_tool_calls SET error_code = 'DIFFERENT_TIMEOUT' WHERE id = '${timedOutToolCallId}'`,
    "terminal agent tool calls are immutable",
  );
  expectFailure(
    persistTo,
    `DELETE FROM agent_tool_calls WHERE id = '${toolCallId}'`,
    "agent tool calls are evidence and cannot be deleted",
  );
  expectFailure(
    persistTo,
    `UPDATE agent_runs SET decision_summary = 'A different decision that must be rejected after completion.' WHERE id = '${runId}'`,
    "terminal agent runs are immutable",
  );
  expectFailure(
    persistTo,
    `DELETE FROM agent_runs WHERE id = '${runId}'`,
    "agent runs are evidence and cannot be deleted",
  );
}

function query(persistTo, statement) {
  const result = invokeWrangler([
    "d1",
    "execute",
    databaseName,
    "--local",
    "--persist-to",
    persistTo,
    "--config",
    configPath,
    "--command",
    statement,
    "--json",
  ]);
  if (result.status !== 0) {
    throw new Error(
      `Wrangler query failed (${result.status ?? "signal"}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  const jsonOutput = [result.stdout, result.stderr]
    .map((output) => output.trim())
    .find((output) => output.startsWith("["));
  assert(
    jsonOutput !== undefined,
    `Wrangler query returned no JSON:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  const parsed = JSON.parse(jsonOutput);
  const queryResult = parsed[0];
  assert(
    queryResult?.success === true && Array.isArray(queryResult.results),
    "D1 returned an invalid query result",
  );
  return queryResult.results;
}

function execute(persistTo, statement) {
  runWrangler([
    "d1",
    "execute",
    databaseName,
    "--local",
    "--persist-to",
    persistTo,
    "--config",
    configPath,
    "--command",
    statement,
  ]);
}

function expectFailure(persistTo, statement, expectedMessage) {
  const result = invokeWrangler([
    "d1",
    "execute",
    databaseName,
    "--local",
    "--persist-to",
    persistTo,
    "--config",
    configPath,
    "--command",
    statement,
  ]);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  assert(result.status !== 0, `D1 unexpectedly accepted a rejected statement: ${statement}`);
  assert(
    combinedOutput.includes(expectedMessage),
    `D1 failure did not contain ${JSON.stringify(expectedMessage)}:\n${combinedOutput}`,
  );
}

function runWrangler(arguments_) {
  const result = invokeWrangler(arguments_);
  if (result.status !== 0) {
    throw new Error(
      `Wrangler failed (${result.status ?? "signal"}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function invokeWrangler(arguments_) {
  return spawnSync("wrangler", arguments_, {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      NO_COLOR: "1",
      WRANGLER_LOG_PATH: join(temporaryRoot, "wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
    },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}:\nexpected ${expectedJson}\nreceived ${actualJson}`);
  }
}
