import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(packageRoot, "wrangler.jsonc");
const databaseName = "mindpay-local";
const temporaryRoot = mkdtempSync(join(tmpdir(), "mindpay-d1-verification-"));
const firstDatabase = join(temporaryRoot, "first");
const secondDatabase = join(temporaryRoot, "second");
const migrationsRoot = join(packageRoot, "migrations");

const expectedTables = [
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
];

const expectedTriggers = [
  "audit_events_no_delete",
  "audit_events_no_update",
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
  "service_versions_no_delete",
  "service_versions_no_update",
];
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const createdAt = 1_788_000_000_000;
const expiresAt = createdAt + 300_000;

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
  assert(migrationCount[0]?.count === 6, "Every migration must be recorded exactly once");

  seedIntegrityRecords(firstDatabase);
  verifyUniqueness(firstDatabase);
  verifyOwnerIntegrity(firstDatabase);
  verifyChecks(firstDatabase);
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
