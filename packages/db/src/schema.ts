import { organizationRoles } from "@mindpay/domain";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export { organizationRoles };
export const organizationStatuses = ["ACTIVE", "SUSPENDED", "EXPIRED"] as const;
export const passkeyCredentialDeviceTypes = ["singleDevice", "multiDevice"] as const;
export const approvalChallengePurposes = ["MANDATE_ACTIVATION", "TRANSACTION_STEP_UP"] as const;
export const approvalChallengeStates = ["PENDING", "CONSUMED", "EXPIRED", "CANCELLED"] as const;
export const idempotencyStates = ["PENDING", "COMPLETED", "FAILED"] as const;
export const merchantOperationalStatuses = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;
export const merchantVerificationStatuses = [
  "SUBMITTED",
  "DOMAIN_VERIFIED",
  "KEY_VERIFIED",
  "CATALOG_VALIDATED",
  "PAYMENT_CONFIGURATION_VERIFIED",
  "APPROVED",
  "REVIEW_REQUIRED",
  "QUARANTINED",
] as const;
export const merchantRiskTiers = ["LOW", "MEDIUM", "HIGH"] as const;
export const merchantVerificationTiers = ["NONE", "TEST_VERIFIED"] as const;

const sha256Check = (column: { getSQL(): ReturnType<typeof sql> }) =>
  sql`length(${column}) = 64 and ${column} not glob '*[^0-9a-f]*'`;

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("user_email_uq").on(sql`lower(${table.email})`),
    check("user_email_not_blank", sql`length(trim(${table.email})) between 3 and 320`),
    check("user_name_not_blank", sql`length(trim(${table.name})) between 1 and 128`),
    check("user_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("session_token_uq").on(table.token),
    index("session_user_id_idx").on(table.userId),
    index("session_expires_at_idx").on(table.expiresAt),
    check("session_token_not_blank", sql`length(${table.token}) between 32 and 512`),
    check("session_expires_after_created", sql`${table.expiresAt} > ${table.createdAt}`),
    check("session_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("account_issuer_account_id_uq").on(table.issuer, table.accountId),
    index("account_user_id_idx").on(table.userId),
    index("account_provider_id_idx").on(table.providerId),
    check(
      "account_identity_not_blank",
      sql`
      length(trim(${table.issuer})) > 0 and
      length(trim(${table.accountId})) > 0 and
      length(trim(${table.providerId})) > 0
    `,
    ),
    check("account_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    index("verification_expires_at_idx").on(table.expiresAt),
    check("verification_identifier_not_blank", sql`length(trim(${table.identifier})) > 0`),
    check("verification_value_not_blank", sql`length(${table.value}) > 0`),
    check("verification_expires_after_created", sql`${table.expiresAt} > ${table.createdAt}`),
    check("verification_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const rateLimit = sqliteTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [
    uniqueIndex("rate_limit_key_uq").on(table.key),
    index("rate_limit_last_request_idx").on(table.lastRequest),
    check("rate_limit_key_not_blank", sql`length(trim(${table.key})) between 1 and 1024`),
    check("rate_limit_count_positive", sql`${table.count} >= 1`),
    check("rate_limit_last_request_positive", sql`${table.lastRequest} > 0`),
  ],
);

export const passkeyCredentials = sqliteTable(
  "passkey_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    name: text("name"),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    webauthnUserId: text("webauthn_user_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type", { enum: passkeyCredentialDeviceTypes }).notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports", { mode: "json" }).$type<readonly string[]>().notNull(),
    aaguid: text("aaguid").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("passkey_credentials_credential_id_uq").on(table.credentialId),
    index("passkey_credentials_user_id_idx").on(table.userId),
    check(
      "passkey_credentials_name_valid",
      sql`${table.name} is null or length(trim(${table.name})) between 1 and 64`,
    ),
    check(
      "passkey_credentials_credential_id_valid",
      sql`length(${table.credentialId}) between 1 and 1024`,
    ),
    check(
      "passkey_credentials_public_key_valid",
      sql`length(${table.publicKey}) between 1 and 4096`,
    ),
    check(
      "passkey_credentials_webauthn_user_id_valid",
      sql`length(${table.webauthnUserId}) between 1 and 128`,
    ),
    check("passkey_credentials_counter_valid", sql`${table.counter} >= 0`),
    check(
      "passkey_credentials_device_type_valid",
      sql`${table.deviceType} in ('singleDevice', 'multiDevice')`,
    ),
    check("passkey_credentials_transports_valid", sql`json_valid(${table.transports})`),
    check("passkey_credentials_aaguid_valid", sql`length(${table.aaguid}) between 1 and 64`),
    check(
      "passkey_credentials_updated_after_created",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const passkeyRegistrationChallenges = sqliteTable(
  "passkey_registration_challenges",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    challengeHash: text("challenge_hash").notNull(),
    webauthnUserId: text("webauthn_user_id").notNull(),
    rpId: text("rp_id").notNull(),
    origin: text("origin").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("passkey_registration_challenges_hash_uq").on(table.challengeHash),
    index("passkey_registration_challenges_session_idx").on(table.sessionId),
    index("passkey_registration_challenges_user_idx").on(table.userId),
    index("passkey_registration_challenges_expires_at_idx").on(table.expiresAt),
    check("passkey_registration_challenges_hash_valid", sha256Check(table.challengeHash)),
    check(
      "passkey_registration_challenges_webauthn_user_id_valid",
      sql`length(${table.webauthnUserId}) between 1 and 128`,
    ),
    check(
      "passkey_registration_challenges_rp_id_valid",
      sql`length(${table.rpId}) between 1 and 253`,
    ),
    check(
      "passkey_registration_challenges_origin_valid",
      sql`length(${table.origin}) between 8 and 2048`,
    ),
    check(
      "passkey_registration_challenges_expires_after_created",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "passkey_registration_challenges_consumed_after_created",
      sql`${table.consumedAt} is null or ${table.consumedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status", { enum: organizationStatuses }).notNull().default("ACTIVE"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("organizations_slug_uq").on(sql`lower(${table.slug})`),
    check("organizations_name_not_blank", sql`length(trim(${table.name})) between 1 and 128`),
    check(
      "organizations_slug_format",
      sql`
        length(${table.slug}) between 3 and 63 and
        ${table.slug} = lower(${table.slug}) and
        ${table.slug} not glob '*[^a-z0-9-]*' and
        substr(${table.slug}, 1, 1) != '-' and
        substr(${table.slug}, -1, 1) != '-'
      `,
    ),
    check("organizations_status_valid", sql`${table.status} in ('ACTIVE', 'SUSPENDED', 'EXPIRED')`),
    check("organizations_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    role: text("role", { enum: organizationRoles }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("organization_members_user_id_idx").on(table.userId),
    check(
      "organization_members_role_valid",
      sql`${table.role} in ('OWNER', 'ADMIN', 'BUILDER', 'REVIEWER', 'VIEWER')`,
    ),
  ],
);

export const demoWorkspaces = sqliteTable(
  "demo_workspaces",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("demo_workspaces_expires_at_idx").on(table.expiresAt),
    check("demo_workspaces_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const replayNonces = sqliteTable(
  "replay_nonces",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    nonce: text("nonce").notNull(),
    subjectId: text("subject_id"),
    payloadHash: text("payload_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("replay_nonces_scope_nonce_uq").on(table.scope, table.nonce),
    index("replay_nonces_expires_at_idx").on(table.expiresAt),
    check("replay_nonces_scope_not_blank", sql`length(trim(${table.scope})) between 1 and 128`),
    check("replay_nonces_nonce_not_blank", sql`length(${table.nonce}) between 8 and 512`),
    check("replay_nonces_payload_hash_valid", sha256Check(table.payloadHash)),
    check("replay_nonces_expires_after_created", sql`${table.expiresAt} > ${table.createdAt}`),
    check("replay_nonces_consumed_after_created", sql`${table.consumedAt} >= ${table.createdAt}`),
  ],
);

export const approvalChallenges = sqliteTable(
  "approval_challenges",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    transactionId: text("transaction_id"),
    purpose: text("purpose", { enum: approvalChallengePurposes }).notNull(),
    challengeHash: text("challenge_hash").notNull(),
    payloadHash: text("payload_hash").notNull(),
    state: text("state", { enum: approvalChallengeStates }).notNull().default("PENDING"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("approval_challenges_hash_uq").on(table.challengeHash),
    index("approval_challenges_user_state_idx").on(table.userId, table.state),
    index("approval_challenges_expires_at_idx").on(table.expiresAt),
    check(
      "approval_challenges_purpose_valid",
      sql`${table.purpose} in ('MANDATE_ACTIVATION', 'TRANSACTION_STEP_UP')`,
    ),
    check(
      "approval_challenges_state_valid",
      sql`${table.state} in ('PENDING', 'CONSUMED', 'EXPIRED', 'CANCELLED')`,
    ),
    check("approval_challenges_challenge_hash_valid", sha256Check(table.challengeHash)),
    check("approval_challenges_payload_hash_valid", sha256Check(table.payloadHash)),
    check(
      "approval_challenges_expires_after_created",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "approval_challenges_consumption_valid",
      sql`
        (${table.state} = 'CONSUMED' and ${table.consumedAt} is not null and ${table.consumedAt} >= ${table.createdAt}) or
        (${table.state} != 'CONSUMED' and ${table.consumedAt} is null)
      `,
    ),
  ],
);

export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body", { mode: "json" }).$type<unknown>(),
    state: text("state", { enum: idempotencyStates }).notNull().default("PENDING"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.key] }),
    index("idempotency_records_expires_at_idx").on(table.expiresAt),
    check(
      "idempotency_records_scope_not_blank",
      sql`length(trim(${table.scope})) between 1 and 128`,
    ),
    check("idempotency_records_key_valid", sql`length(${table.key}) between 16 and 128`),
    check("idempotency_records_request_hash_valid", sha256Check(table.requestHash)),
    check(
      "idempotency_records_state_valid",
      sql`${table.state} in ('PENDING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "idempotency_records_response_status_valid",
      sql`${table.responseStatus} is null or ${table.responseStatus} between 100 and 599`,
    ),
    check(
      "idempotency_records_response_state_valid",
      sql`
        (${table.state} = 'PENDING' and ${table.responseStatus} is null and ${table.responseBody} is null) or
        (${table.state} != 'PENDING' and ${table.responseStatus} is not null and ${table.responseBody} is not null)
      `,
    ),
    check(
      "idempotency_records_expires_after_created",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id").notNull(),
    sequence: integer("sequence").notNull(),
    schemaVersion: text("schema_version").notNull(),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    issuer: text("issuer").notNull(),
    audience: text("audience").notNull(),
    jti: text("jti").notNull(),
    payloadJson: text("payload_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    payloadHash: text("payload_hash").notNull(),
    previousEventHash: text("previous_event_hash"),
    eventHash: text("event_hash").notNull(),
    signature: text("signature").notNull(),
    kid: text("kid").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("audit_events_transaction_sequence_uq").on(table.transactionId, table.sequence),
    uniqueIndex("audit_events_event_hash_uq").on(table.eventHash),
    uniqueIndex("audit_events_jti_uq").on(table.jti),
    index("audit_events_created_at_idx").on(table.createdAt),
    check("audit_events_sequence_nonnegative", sql`${table.sequence} >= 0`),
    check(
      "audit_events_schema_version_valid",
      sql`${table.schemaVersion} = 'mindpay.audit.event.1'`,
    ),
    check("audit_events_payload_hash_valid", sha256Check(table.payloadHash)),
    check(
      "audit_events_previous_hash_valid",
      sql`${table.previousEventHash} is null or (${sha256Check(table.previousEventHash)})`,
    ),
    check("audit_events_event_hash_valid", sha256Check(table.eventHash)),
    check(
      "audit_events_chain_root_valid",
      sql`
        (${table.sequence} = 0 and ${table.previousEventHash} is null) or
        (${table.sequence} > 0 and ${table.previousEventHash} is not null)
      `,
    ),
    check("audit_events_occurrence_valid", sql`${table.occurredAt} = ${table.createdAt}`),
    check("audit_events_expires_after_occurrence", sql`${table.expiresAt} > ${table.occurredAt}`),
  ],
);

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    legalName: text("legal_name").notNull(),
    domain: text("domain").notNull(),
    status: text("status", { enum: merchantOperationalStatuses }).notNull().default("ACTIVE"),
    verificationStatus: text("verification_status", { enum: merchantVerificationStatuses })
      .notNull()
      .default("SUBMITTED"),
    riskTier: text("risk_tier", { enum: merchantRiskTiers }).notNull().default("LOW"),
    verificationTier: text("verification_tier", { enum: merchantVerificationTiers })
      .notNull()
      .default("NONE"),
    currentManifestId: text("current_manifest_id"),
    currentCatalogId: text("current_catalog_id"),
    lastAdminEventId: text("last_admin_event_id").notNull(),
    lastVerificationAt: integer("last_verification_at", { mode: "timestamp_ms" }),
    verificationExpiresAt: integer("verification_expires_at", { mode: "timestamp_ms" }),
    quarantinedAt: integer("quarantined_at", { mode: "timestamp_ms" }),
    revision: integer("revision").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchants_domain_uq").on(sql`lower(${table.domain})`),
    uniqueIndex("merchants_slug_uq").on(sql`lower(${table.slug})`),
    index("merchants_discovery_idx").on(table.status, table.verificationStatus),
    check(
      "merchants_id_valid",
      sql`${table.id} glob 'merchant_*' and length(${table.id}) between 12 and 96`,
    ),
    check("merchants_name_valid", sql`length(trim(${table.name})) between 2 and 120`),
    check("merchants_legal_name_valid", sql`length(trim(${table.legalName})) between 2 and 160`),
    check(
      "merchants_domain_valid",
      sql`${table.domain} = lower(${table.domain}) and instr(${table.domain}, '.') > 0`,
    ),
    check("merchants_status_valid", sql`${table.status} in ('ACTIVE', 'SUSPENDED', 'REVOKED')`),
    check(
      "merchants_verification_status_valid",
      sql`${table.verificationStatus} in ('SUBMITTED', 'DOMAIN_VERIFIED', 'KEY_VERIFIED', 'CATALOG_VALIDATED', 'PAYMENT_CONFIGURATION_VERIFIED', 'APPROVED', 'REVIEW_REQUIRED', 'QUARANTINED')`,
    ),
    check("merchants_risk_tier_valid", sql`${table.riskTier} in ('LOW', 'MEDIUM', 'HIGH')`),
    check(
      "merchants_verification_tier_valid",
      sql`${table.verificationTier} in ('NONE', 'TEST_VERIFIED')`,
    ),
    check("merchants_revision_valid", sql`${table.revision} >= 0`),
    check(
      "merchants_verification_expiry_valid",
      sql`${table.verificationExpiresAt} is null or (${table.lastVerificationAt} is not null and ${table.verificationExpiresAt} > ${table.lastVerificationAt})`,
    ),
    check("merchants_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const merchantKeys = sqliteTable(
  "merchant_keys",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kid: text("kid").notNull(),
    purpose: text("purpose", { enum: ["manifest", "catalog", "checkout", "event"] }).notNull(),
    publicJwk: text("public_jwk", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    validFrom: integer("valid_from", { mode: "timestamp_ms" }).notNull(),
    validUntil: integer("valid_until", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_keys_identity_uq").on(
      table.merchantId,
      table.kid,
      table.purpose,
      table.fingerprint,
    ),
    index("merchant_keys_active_idx").on(table.merchantId, table.purpose, table.revokedAt),
    check("merchant_keys_fingerprint_valid", sha256Check(table.fingerprint)),
    check("merchant_keys_public_jwk_valid", sql`json_valid(${table.publicJwk})`),
    check(
      "merchant_keys_purpose_valid",
      sql`${table.purpose} in ('manifest', 'catalog', 'checkout', 'event')`,
    ),
  ],
);

export const merchantManifests = sqliteTable(
  "merchant_manifests",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade", onUpdate: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    manifestJson: text("manifest_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    manifestHash: text("manifest_hash").notNull(),
    signature: text("signature", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_manifests_hash_uq").on(table.merchantId, table.manifestHash),
    check("merchant_manifests_hash_valid", sha256Check(table.manifestHash)),
    check(
      "merchant_manifests_json_valid",
      sql`json_valid(${table.manifestJson}) and json_valid(${table.signature})`,
    ),
    check("merchant_manifests_expiry_valid", sql`${table.expiresAt} > ${table.verifiedAt}`),
  ],
);

export const merchantVerifications = sqliteTable(
  "merchant_verifications",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade", onUpdate: "cascade" }),
    runId: text("run_id").notNull(),
    checkType: text("check_type").notNull(),
    status: text("status", { enum: ["PASS", "FAIL"] }).notNull(),
    reason: text("reason"),
    evidenceJson: text("evidence_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_verifications_run_check_uq").on(table.runId, table.checkType),
    index("merchant_verifications_merchant_checked_idx").on(table.merchantId, table.checkedAt),
    check("merchant_verifications_status_valid", sql`${table.status} in ('PASS', 'FAIL')`),
    check("merchant_verifications_evidence_valid", sql`json_valid(${table.evidenceJson})`),
    check(
      "merchant_verifications_result_valid",
      sql`(${table.status} = 'PASS' and ${table.reason} is null) or (${table.status} = 'FAIL' and ${table.reason} is not null)`,
    ),
    check("merchant_verifications_expiry_valid", sql`${table.expiresAt} > ${table.checkedAt}`),
  ],
);

export const merchantCatalogs = sqliteTable(
  "merchant_catalogs",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version: text("version").notNull(),
    catalogHash: text("catalog_hash").notNull(),
    catalogJson: text("catalog_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    signature: text("signature", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_catalogs_version_hash_uq").on(
      table.merchantId,
      table.version,
      table.catalogHash,
    ),
    index("merchant_catalogs_merchant_verified_idx").on(table.merchantId, table.verifiedAt),
    check("merchant_catalogs_hash_valid", sha256Check(table.catalogHash)),
    check(
      "merchant_catalogs_json_valid",
      sql`json_valid(${table.catalogJson}) and json_valid(${table.signature})`,
    ),
    check("merchant_catalogs_expiry_valid", sql`${table.expiresAt} > ${table.verifiedAt}`),
  ],
);

export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade", onUpdate: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    status: text("status", { enum: ["ACTIVE", "RETIRED"] })
      .notNull()
      .default("ACTIVE"),
    currentVersionId: text("current_version_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("services_merchant_external_uq").on(table.merchantId, table.externalId),
    index("services_discovery_idx").on(table.status, table.category),
    check("services_status_valid", sql`${table.status} in ('ACTIVE', 'RETIRED')`),
    check("services_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const serviceVersions = sqliteTable(
  "service_versions",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version: text("version").notNull(),
    priceSubunits: integer("price_subunits").notNull(),
    currency: text("currency", { enum: ["INR"] }).notNull(),
    availability: text("availability", { enum: ["available", "paused", "unavailable"] }).notNull(),
    fulfilmentType: text("fulfilment_type", { enum: ["mcp", "rest"] }).notNull(),
    fulfilmentToolId: text("fulfilment_tool_id").notNull(),
    estimatedDeliverySeconds: integer("estimated_delivery_seconds").notNull(),
    privacyUrl: text("privacy_url").notNull(),
    termsUrl: text("terms_url").notNull(),
    catalogHash: text("catalog_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("service_versions_identity_uq").on(table.serviceId, table.version),
    index("service_versions_marketplace_idx").on(table.availability, table.priceSubunits),
    check(
      "service_versions_price_valid",
      sql`typeof(${table.priceSubunits}) = 'integer' and ${table.priceSubunits} >= 0`,
    ),
    check("service_versions_currency_valid", sql`${table.currency} = 'INR'`),
    check(
      "service_versions_availability_valid",
      sql`${table.availability} in ('available', 'paused', 'unavailable')`,
    ),
    check(
      "service_versions_fulfilment_valid",
      sql`${table.fulfilmentType} in ('mcp', 'rest') and ${table.estimatedDeliverySeconds} between 1 and 86400`,
    ),
    check("service_versions_catalog_hash_valid", sha256Check(table.catalogHash)),
    check("service_versions_content_hash_valid", sha256Check(table.contentHash)),
  ],
);

export const merchantAdminEvents = sqliteTable(
  "merchant_admin_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade", onUpdate: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    action: text("action").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    previousVerificationStatus: text("previous_verification_status"),
    nextVerificationStatus: text("next_verification_status").notNull(),
    detailsJson: text("details_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_admin_events_idempotency_uq").on(
      table.organizationId,
      table.actorId,
      table.action,
      table.idempotencyKey,
    ),
    index("merchant_admin_events_merchant_time_idx").on(table.merchantId, table.occurredAt),
    check("merchant_admin_events_request_hash_valid", sha256Check(table.requestHash)),
    check("merchant_admin_events_details_valid", sql`json_valid(${table.detailsJson})`),
  ],
);

export const marketplaceCacheVersions = sqliteTable(
  "marketplace_cache_versions",
  {
    namespace: text("namespace").primaryKey(),
    generation: text("generation").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check("marketplace_cache_versions_namespace_valid", sql`${table.namespace} = 'services'`),
    check("marketplace_cache_versions_generation_valid", sha256Check(table.generation)),
  ],
);

export const schema = {
  account,
  approvalChallenges,
  auditEvents,
  demoWorkspaces,
  idempotencyRecords,
  marketplaceCacheVersions,
  merchantAdminEvents,
  merchantCatalogs,
  merchantKeys,
  merchantManifests,
  merchants,
  merchantVerifications,
  organizationMembers,
  organizations,
  passkeyCredentials,
  passkeyRegistrationChallenges,
  rateLimit,
  replayNonces,
  services,
  serviceVersions,
  session,
  user,
  verification,
} as const;

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;
export type DemoWorkspace = typeof demoWorkspaces.$inferSelect;
export type NewDemoWorkspace = typeof demoWorkspaces.$inferInsert;
export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;
export type NewPasskeyCredential = typeof passkeyCredentials.$inferInsert;
export type PasskeyRegistrationChallenge = typeof passkeyRegistrationChallenges.$inferSelect;
export type NewPasskeyRegistrationChallenge = typeof passkeyRegistrationChallenges.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type ReplayNonce = typeof replayNonces.$inferSelect;
export type NewReplayNonce = typeof replayNonces.$inferInsert;
export type ApprovalChallenge = typeof approvalChallenges.$inferSelect;
export type NewApprovalChallenge = typeof approvalChallenges.$inferInsert;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
export type NewIdempotencyRecord = typeof idempotencyRecords.$inferInsert;
export type AuditEventRecord = typeof auditEvents.$inferSelect;
export type NewAuditEventRecord = typeof auditEvents.$inferInsert;
export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;
export type MerchantKey = typeof merchantKeys.$inferSelect;
export type NewMerchantKey = typeof merchantKeys.$inferInsert;
export type MerchantManifestRecord = typeof merchantManifests.$inferSelect;
export type NewMerchantManifestRecord = typeof merchantManifests.$inferInsert;
export type MerchantVerificationRecord = typeof merchantVerifications.$inferSelect;
export type NewMerchantVerificationRecord = typeof merchantVerifications.$inferInsert;
export type MerchantCatalogRecord = typeof merchantCatalogs.$inferSelect;
export type NewMerchantCatalogRecord = typeof merchantCatalogs.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ServiceVersionRecord = typeof serviceVersions.$inferSelect;
export type NewServiceVersionRecord = typeof serviceVersions.$inferInsert;
export type MerchantAdminEvent = typeof merchantAdminEvents.$inferSelect;
export type NewMerchantAdminEvent = typeof merchantAdminEvents.$inferInsert;
export type MarketplaceCacheVersion = typeof marketplaceCacheVersions.$inferSelect;
export type NewMarketplaceCacheVersion = typeof marketplaceCacheVersions.$inferInsert;
