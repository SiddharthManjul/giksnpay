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
export const agentStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const agentVerificationStatuses = ["NOT_RUN", "PASSED", "FAILED"] as const;
export const agentRunSources = ["AI", "MANUAL"] as const;
export const agentRunStatuses = ["RUNNING", "SUCCEEDED", "FAILED", "PROVIDER_UNAVAILABLE"] as const;
export const agentToolCallStatuses = ["RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"] as const;
export const agentRunEventTypes = [
  "RUN_STARTED",
  "INTENT_PARSED",
  "MODEL_TEXT_DELTA",
  "TOOL_CALL_STARTED",
  "TOOL_CALL_COMPLETED",
  "TOOL_CALL_FAILED",
  "PROPOSAL_CREATED",
  "FALLBACK_AVAILABLE",
  "RUN_COMPLETED",
  "RUN_FAILED",
] as const;
export const mandateKinds = ["CHECKOUT", "PAYMENT"] as const;
export const mandateStatuses = [
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "EXHAUSTED",
  "EXPIRED",
  "REVOKED",
] as const;
export const openMandateSchemaVersions = [
  "mindpay.mandate.checkout.open.1",
  "mindpay.mandate.payment.open.1",
] as const;
export const mandateProofTypes = ["WEBAUTHN_ASSERTION", "PLATFORM_JWS", "AGENT_JWS"] as const;
export const transactionStates = [
  "DRAFT",
  "DISCOVERING",
  "OFFER_SELECTED",
  "VERIFYING",
  "POLICY_REVIEW",
  "BLOCKED",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "BUDGET_RESERVED",
  "CHECKOUT_CREATED",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CALLBACK_VERIFIED",
  "PAYMENT_RECONCILING",
  "PAYMENT_CAPTURED",
  "ENTITLEMENT_ISSUED",
  "FULFILLING",
  "FULFILMENT_FAILED",
  "FULFILLED",
  "EVIDENCE_READY",
  "EXPIRED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "DISPUTED",
] as const;
export const transactionApprovalStates = ["ACTIVE", "CONSUMED", "EXPIRED", "REVOKED"] as const;
export const consumedNonceSources = [
  "OPEN_MANDATE",
  "CLOSED_MANDATE",
  "TRANSACTION_APPROVAL",
  "MERCHANT_EVENT",
] as const;
export const spendReservationStatuses = ["RESERVED", "COMMITTED", "RELEASED", "EXPIRED"] as const;
export const paymentAttemptStatuses = [
  "CREATED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export const providerEventProcessingStatuses = [
  "RECEIVED",
  "VERIFIED",
  "PROCESSED",
  "REJECTED",
] as const;

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

export const agentModelCapacityLeases = sqliteTable(
  "agent_model_capacity_leases",
  {
    key: text("key").primaryKey(),
    leaseId: text("lease_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_model_capacity_leases_lease_id_uq").on(table.leaseId),
    index("agent_model_capacity_leases_expires_at_idx").on(table.expiresAt),
    check(
      "agent_model_capacity_leases_key_not_blank",
      sql`length(trim(${table.key})) between 1 and 1024`,
    ),
    check(
      "agent_model_capacity_leases_lease_id_not_blank",
      sql`length(trim(${table.leaseId})) between 1 and 128`,
    ),
    check("agent_model_capacity_leases_expiry_positive", sql`${table.expiresAt} > 0`),
  ],
);

export const agentModelUsageWindows = sqliteTable(
  "agent_model_usage_windows",
  {
    key: text("key").primaryKey(),
    usedTokens: integer("used_tokens").notNull(),
    windowStartedAt: integer("window_started_at").notNull(),
  },
  (table) => [
    index("agent_model_usage_windows_started_at_idx").on(table.windowStartedAt),
    check(
      "agent_model_usage_windows_key_not_blank",
      sql`length(trim(${table.key})) between 1 and 1024`,
    ),
    check("agent_model_usage_windows_tokens_positive", sql`${table.usedTokens} > 0`),
    check("agent_model_usage_windows_started_at_positive", sql`${table.windowStartedAt} > 0`),
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
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    mandateId: text("mandate_id"),
    credentialId: text("credential_id").references(() => passkeyCredentials.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    transactionId: text("transaction_id"),
    rpId: text("rp_id"),
    origin: text("origin"),
    purpose: text("purpose", { enum: approvalChallengePurposes }).notNull(),
    challengeHash: text("challenge_hash").notNull(),
    payloadHash: text("payload_hash").notNull(),
    state: text("state", { enum: approvalChallengeStates }).notNull().default("PENDING"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("approval_challenges_pending_hash_uq")
      .on(table.challengeHash)
      .where(sql`${table.state} = 'PENDING'`),
    index("approval_challenges_user_state_idx").on(table.userId, table.state),
    index("approval_challenges_context_idx").on(
      table.organizationId,
      table.userId,
      table.sessionId,
      table.purpose,
      table.state,
    ),
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
      "approval_challenges_webauthn_context_valid",
      sql`
        (${table.sessionId} is null and ${table.mandateId} is null and ${table.credentialId} is null and ${table.rpId} is null and ${table.origin} is null) or
        (${table.sessionId} is not null and ${table.mandateId} is not null and ${table.credentialId} is not null and length(trim(${table.rpId})) between 1 and 253 and length(trim(${table.origin})) between 8 and 2048)
      `,
    ),
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

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: agentStatuses }).notNull().default("ACTIVE"),
    currentVersionId: text("current_version_id"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("agents_organization_slug_uq").on(table.organizationId, sql`lower(${table.slug})`),
    index("agents_organization_status_idx").on(table.organizationId, table.status),
    check("agents_id_valid", sql`${table.id} glob 'agt_*' and length(${table.id}) = 30`),
    check("agents_name_valid", sql`length(trim(${table.name})) between 2 and 120`),
    check(
      "agents_slug_format",
      sql`
        length(${table.slug}) between 3 and 63 and
        ${table.slug} = lower(${table.slug}) and
        ${table.slug} not glob '*[^a-z0-9-]*' and
        substr(${table.slug}, 1, 1) != '-' and
        substr(${table.slug}, -1, 1) != '-'
      `,
    ),
    check("agents_description_valid", sql`length(trim(${table.description})) between 10 and 2000`),
    check("agents_status_valid", sql`${table.status} in ('ACTIVE', 'ARCHIVED')`),
    check("agents_updated_after_created", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const agentVersions = sqliteTable(
  "agent_versions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version: text("version").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelName: text("model_name").notNull(),
    systemPolicy: text("system_policy").notNull(),
    systemPolicyHash: text("system_policy_hash").notNull(),
    specialization: text("specialization").notNull(),
    configurationJson: text("configuration_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    verificationStatus: text("verification_status", { enum: agentVerificationStatuses })
      .notNull()
      .default("NOT_RUN"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("agent_versions_agent_version_uq").on(table.agentId, table.version),
    index("agent_versions_agent_created_idx").on(table.agentId, table.createdAt),
    check("agent_versions_id_valid", sql`${table.id} glob 'agv_*' and length(${table.id}) = 30`),
    check(
      "agent_versions_semantic_version_valid",
      sql`length(${table.version}) between 5 and 64 and instr(${table.version}, '.') > 0`,
    ),
    check(
      "agent_versions_model_valid",
      sql`length(trim(${table.modelProvider})) between 1 and 128 and length(trim(${table.modelName})) between 1 and 128`,
    ),
    check(
      "agent_versions_policy_valid",
      sql`length(trim(${table.systemPolicy})) between 20 and 20000`,
    ),
    check("agent_versions_policy_hash_valid", sha256Check(table.systemPolicyHash)),
    check(
      "agent_versions_specialization_valid",
      sql`length(trim(${table.specialization})) between 2 and 160`,
    ),
    check("agent_versions_configuration_valid", sql`json_valid(${table.configurationJson})`),
    check(
      "agent_versions_verification_status_valid",
      sql`${table.verificationStatus} in ('NOT_RUN', 'PASSED', 'FAILED')`,
    ),
    check(
      "agent_versions_publication_valid",
      sql`${table.publishedAt} is null or ${table.publishedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const agentKeys = sqliteTable(
  "agent_keys",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kid: text("kid").notNull(),
    publicJwk: text("public_jwk", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    encryptedPrivateJwk: text("encrypted_private_jwk", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    validFrom: integer("valid_from", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("agent_keys_agent_kid_uq").on(table.agentId, table.kid),
    index("agent_keys_active_idx").on(table.agentId, table.revokedAt, table.validFrom),
    check("agent_keys_id_valid", sql`${table.id} glob 'aky_*' and length(${table.id}) = 30`),
    check("agent_keys_kid_valid", sql`length(${table.kid}) between 1 and 128`),
    check(
      "agent_keys_public_jwk_valid",
      sql`
        json_valid(${table.publicJwk}) and
        json_extract(${table.publicJwk}, '$.kty') = 'EC' and
        json_extract(${table.publicJwk}, '$.crv') = 'P-256' and
        length(json_extract(${table.publicJwk}, '$.x')) = 43 and
        length(json_extract(${table.publicJwk}, '$.y')) = 43 and
        json_type(${table.publicJwk}, '$.d') is null
      `,
    ),
    check(
      "agent_keys_encrypted_private_jwk_valid",
      sql`
        json_valid(${table.encryptedPrivateJwk}) and
        json_extract(${table.encryptedPrivateJwk}, '$.algorithm') = 'A256GCM' and
        json_extract(${table.encryptedPrivateJwk}, '$.version') = 1 and
        length(json_extract(${table.encryptedPrivateJwk}, '$.iv')) between 16 and 64 and
        length(json_extract(${table.encryptedPrivateJwk}, '$.ciphertext')) between 32 and 4096
      `,
    ),
    check(
      "agent_keys_revocation_valid",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.validFrom}`,
    ),
  ],
);

export const agentVersionTools = sqliteTable(
  "agent_version_tools",
  {
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    toolVersionId: text("tool_version_id").notNull(),
    scopeJson: text("scope_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentVersionId, table.toolVersionId] }),
    check(
      "agent_version_tools_tool_version_valid",
      sql`length(trim(${table.toolVersionId})) between 1 and 128`,
    ),
    check("agent_version_tools_scope_valid", sql`json_valid(${table.scopeJson})`),
  ],
);

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict", onUpdate: "cascade" }),
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    transactionId: text("transaction_id"),
    source: text("source", { enum: agentRunSources }).notNull(),
    status: text("status", { enum: agentRunStatuses }).notNull().default("RUNNING"),
    intentSummary: text("intent_summary"),
    decisionSummary: text("decision_summary"),
    proposalJson: text("proposal_json", { mode: "json" }).$type<
      Readonly<Record<string, unknown>>
    >(),
    failureCode: text("failure_code"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("agent_runs_organization_started_idx").on(table.organizationId, table.startedAt),
    index("agent_runs_agent_version_started_idx").on(table.agentVersionId, table.startedAt),
    check("agent_runs_id_valid", sql`${table.id} glob 'run_*' and length(${table.id}) = 30`),
    check("agent_runs_source_valid", sql`${table.source} in ('AI', 'MANUAL')`),
    check(
      "agent_runs_status_valid",
      sql`${table.status} in ('RUNNING', 'SUCCEEDED', 'FAILED', 'PROVIDER_UNAVAILABLE')`,
    ),
    check(
      "agent_runs_completion_valid",
      sql`
        (${table.status} = 'RUNNING' and ${table.completedAt} is null) or
        (${table.status} != 'RUNNING' and ${table.completedAt} is not null and ${table.completedAt} >= ${table.startedAt})
      `,
    ),
    check(
      "agent_runs_summary_valid",
      sql`
        (${table.intentSummary} is null or length(trim(${table.intentSummary})) between 2 and 500) and
        (${table.decisionSummary} is null or length(trim(${table.decisionSummary})) between 10 and 500)
      `,
    ),
    check(
      "agent_runs_proposal_valid",
      sql`${table.proposalJson} is null or json_valid(${table.proposalJson})`,
    ),
    check(
      "agent_runs_terminal_result_valid",
      sql`
        (${table.status} = 'SUCCEEDED' and ${table.proposalJson} is not null and ${table.decisionSummary} is not null and ${table.failureCode} is null) or
        (${table.status} in ('FAILED', 'PROVIDER_UNAVAILABLE') and ${table.proposalJson} is null and ${table.failureCode} is not null) or
        (${table.status} = 'RUNNING' and ${table.proposalJson} is null and ${table.failureCode} is null)
      `,
    ),
  ],
);

export const agentToolCalls = sqliteTable(
  "agent_tool_calls",
  {
    id: text("id").primaryKey(),
    agentRunId: text("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade", onUpdate: "cascade" }),
    toolVersionId: text("tool_version_id").notNull(),
    inputJson: text("input_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    outputJson: text("output_json", { mode: "json" }).$type<Readonly<Record<string, unknown>>>(),
    inputHash: text("input_hash").notNull(),
    outputHash: text("output_hash"),
    status: text("status", { enum: agentToolCallStatuses }).notNull().default("RUNNING"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("agent_tool_calls_run_created_idx").on(table.agentRunId, table.createdAt),
    check("agent_tool_calls_id_valid", sql`${table.id} glob 'tlc_*' and length(${table.id}) = 30`),
    check(
      "agent_tool_calls_tool_valid",
      sql`length(trim(${table.toolVersionId})) between 1 and 128`,
    ),
    check(
      "agent_tool_calls_json_valid",
      sql`json_valid(${table.inputJson}) and (${table.outputJson} is null or json_valid(${table.outputJson}))`,
    ),
    check("agent_tool_calls_input_hash_valid", sha256Check(table.inputHash)),
    check(
      "agent_tool_calls_output_hash_valid",
      sql`${table.outputHash} is null or (${sha256Check(table.outputHash)})`,
    ),
    check(
      "agent_tool_calls_status_valid",
      sql`${table.status} in ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT')`,
    ),
    check(
      "agent_tool_calls_terminal_valid",
      sql`
        (${table.status} = 'RUNNING' and ${table.outputJson} is null and ${table.outputHash} is null and ${table.errorCode} is null and ${table.latencyMs} is null and ${table.completedAt} is null) or
        (${table.status} = 'SUCCEEDED' and ${table.outputJson} is not null and ${table.outputHash} is not null and ${table.errorCode} is null and ${table.latencyMs} >= 0 and ${table.completedAt} >= ${table.createdAt}) or
        (${table.status} in ('FAILED', 'TIMED_OUT') and ${table.outputJson} is null and ${table.outputHash} is null and ${table.errorCode} is not null and ${table.latencyMs} >= 0 and ${table.completedAt} >= ${table.createdAt})
      `,
    ),
  ],
);

export const agentRunEvents = sqliteTable(
  "agent_run_events",
  {
    agentRunId: text("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type", { enum: agentRunEventTypes }).notNull(),
    payloadJson: text("payload_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentRunId, table.sequence] }),
    index("agent_run_events_created_idx").on(table.createdAt),
    check("agent_run_events_sequence_valid", sql`${table.sequence} >= 0`),
    check(
      "agent_run_events_type_valid",
      sql`${table.eventType} in ('RUN_STARTED', 'INTENT_PARSED', 'MODEL_TEXT_DELTA', 'TOOL_CALL_STARTED', 'TOOL_CALL_COMPLETED', 'TOOL_CALL_FAILED', 'PROPOSAL_CREATED', 'FALLBACK_AVAILABLE', 'RUN_COMPLETED', 'RUN_FAILED')`,
    ),
    check("agent_run_events_payload_valid", sql`json_valid(${table.payloadJson})`),
    check("agent_run_events_payload_hash_valid", sha256Check(table.payloadHash)),
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

export const mandates = sqliteTable(
  "mandates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict", onUpdate: "cascade" }),
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    kind: text("kind", { enum: mandateKinds }).notNull(),
    status: text("status", { enum: mandateStatuses }).notNull().default("DRAFT"),
    schemaVersion: text("schema_version", { enum: openMandateSchemaVersions }).notNull(),
    payloadJson: text("payload_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    payloadHash: text("payload_hash").notNull(),
    nonce: text("nonce").notNull(),
    currency: text("currency"),
    maxTransactionSubunits: integer("max_transaction_subunits"),
    budgetSubunits: integer("budget_subunits"),
    approvalThresholdSubunits: integer("approval_threshold_subunits"),
    spentSubunits: integer("spent_subunits").notNull().default(0),
    reservedSubunits: integer("reserved_subunits").notNull().default(0),
    maxTransactions: integer("max_transactions"),
    completedTransactions: integer("completed_transactions").notNull().default(0),
    maxAttempts: integer("max_attempts"),
    allowedRailsJson: text("allowed_rails_json", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    allowedMerchantsJson: text("allowed_merchants_json", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    allowedCategoriesJson: text("allowed_categories_json", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    allowedServicesJson: text("allowed_services_json", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    lineItemConstraintsJson: text("line_item_constraints_json", { mode: "json" }).$type<
      Readonly<Record<string, unknown>>
    >(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
    terminalAt: integer("terminal_at", { mode: "timestamp_ms" }),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("mandates_organization_nonce_uq").on(table.organizationId, table.nonce),
    uniqueIndex("mandates_id_organization_uq").on(table.id, table.organizationId),
    index("mandates_organization_user_status_idx").on(
      table.organizationId,
      table.userId,
      table.status,
    ),
    index("mandates_retention_expires_at_idx").on(table.retentionExpiresAt),
    check("mandates_id_valid", sql`${table.id} glob 'mnd_*' and length(${table.id}) = 30`),
    check("mandates_kind_valid", sql`${table.kind} in ('CHECKOUT', 'PAYMENT')`),
    check(
      "mandates_status_valid",
      sql`${table.status} in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXHAUSTED', 'EXPIRED', 'REVOKED')`,
    ),
    check(
      "mandates_schema_kind_valid",
      sql`
        (${table.kind} = 'CHECKOUT' and ${table.schemaVersion} = 'mindpay.mandate.checkout.open.1') or
        (${table.kind} = 'PAYMENT' and ${table.schemaVersion} = 'mindpay.mandate.payment.open.1')
      `,
    ),
    check(
      "mandates_payload_json_valid",
      sql`json_valid(${table.payloadJson}) and json_type(${table.payloadJson}) = 'object'`,
    ),
    check("mandates_payload_hash_valid", sha256Check(table.payloadHash)),
    check("mandates_nonce_valid", sql`length(${table.nonce}) between 8 and 512`),
    check(
      "mandates_constraint_json_valid",
      sql`
        json_valid(${table.allowedRailsJson}) and json_type(${table.allowedRailsJson}) = 'array' and
        json_valid(${table.allowedMerchantsJson}) and json_type(${table.allowedMerchantsJson}) = 'array' and
        json_valid(${table.allowedCategoriesJson}) and json_type(${table.allowedCategoriesJson}) = 'array' and
        json_valid(${table.allowedServicesJson}) and json_type(${table.allowedServicesJson}) = 'array' and
        (${table.lineItemConstraintsJson} is null or
          (json_valid(${table.lineItemConstraintsJson}) and json_type(${table.lineItemConstraintsJson}) = 'object'))
      `,
    ),
    check(
      "mandates_payment_bounds_valid",
      sql`
        (
          ${table.kind} = 'CHECKOUT' and ${table.currency} is null and
          ${table.maxTransactionSubunits} is null and ${table.budgetSubunits} is null and
          ${table.approvalThresholdSubunits} is null and ${table.maxTransactions} is null and
          ${table.maxAttempts} is null and ${table.spentSubunits} = 0 and
          ${table.reservedSubunits} = 0 and ${table.completedTransactions} = 0 and
          ${table.lineItemConstraintsJson} is not null and
          json_array_length(${table.allowedRailsJson}) = 0 and
          json_array_length(${table.allowedMerchantsJson}) between 1 and 100 and
          json_array_length(${table.allowedCategoriesJson}) between 1 and 100 and
          json_array_length(${table.allowedServicesJson}) between 1 and 500
        ) or (
          ${table.kind} = 'PAYMENT' and
          ${table.currency} is not null and ${table.maxTransactionSubunits} is not null and
          ${table.budgetSubunits} is not null and ${table.approvalThresholdSubunits} is not null and
          ${table.maxTransactions} is not null and ${table.maxAttempts} is not null and
          ${table.currency} = 'INR' and
          ${table.maxTransactionSubunits} >= 0 and
          ${table.approvalThresholdSubunits} between 0 and ${table.maxTransactionSubunits} and
          ${table.maxTransactionSubunits} <= ${table.budgetSubunits} and
          ${table.spentSubunits} >= 0 and ${table.reservedSubunits} >= 0 and
          ${table.spentSubunits} + ${table.reservedSubunits} <= ${table.budgetSubunits} and
          ${table.maxTransactions} between 1 and 1000 and
          ${table.completedTransactions} between 0 and ${table.maxTransactions} and
          ${table.maxAttempts} between 1 and 10 and ${table.lineItemConstraintsJson} is null and
          json_array_length(${table.allowedRailsJson}) between 1 and 10 and
          json_array_length(${table.allowedMerchantsJson}) between 1 and 100 and
          json_array_length(${table.allowedCategoriesJson}) = 0 and
          json_array_length(${table.allowedServicesJson}) = 0
        )
      `,
    ),
    check(
      "mandates_lifecycle_valid",
      sql`
        (${table.status} = 'DRAFT' and ${table.activatedAt} is null and ${table.terminalAt} is null) or
        (${table.status} in ('ACTIVE', 'SUSPENDED') and ${table.activatedAt} is not null and ${table.terminalAt} is null) or
        (${table.status} in ('EXHAUSTED', 'EXPIRED', 'REVOKED') and ${table.activatedAt} is not null and ${table.terminalAt} is not null)
      `,
    ),
    check(
      "mandates_time_order_valid",
      sql`
        ${table.startsAt} >= ${table.createdAt} and ${table.expiresAt} > ${table.startsAt} and
        ${table.updatedAt} >= ${table.createdAt} and ${table.retentionExpiresAt} >= ${table.expiresAt} and
        (${table.activatedAt} is null or ${table.activatedAt} between ${table.createdAt} and ${table.updatedAt}) and
        (${table.terminalAt} is null or ${table.terminalAt} between ${table.activatedAt} and ${table.updatedAt})
      `,
    ),
  ],
);

export const mandateProofs = sqliteTable(
  "mandate_proofs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict", onUpdate: "cascade" }),
    proofType: text("proof_type", { enum: mandateProofTypes }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    proofHash: text("proof_hash").notNull(),
    proofJson: text("proof_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    keyId: text("key_id"),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("mandate_proofs_logical_uq").on(
      table.mandateId,
      table.proofType,
      table.payloadHash,
      table.proofHash,
    ),
    index("mandate_proofs_organization_mandate_idx").on(table.organizationId, table.mandateId),
    index("mandate_proofs_retention_expires_at_idx").on(table.retentionExpiresAt),
    check("mandate_proofs_id_valid", sql`${table.id} glob 'mpr_*' and length(${table.id}) = 30`),
    check(
      "mandate_proofs_type_valid",
      sql`${table.proofType} in ('WEBAUTHN_ASSERTION', 'PLATFORM_JWS', 'AGENT_JWS')`,
    ),
    check("mandate_proofs_payload_hash_valid", sha256Check(table.payloadHash)),
    check("mandate_proofs_proof_hash_valid", sha256Check(table.proofHash)),
    check(
      "mandate_proofs_json_valid",
      sql`json_valid(${table.proofJson}) and json_type(${table.proofJson}) = 'object'`,
    ),
    check(
      "mandate_proofs_time_order_valid",
      sql`
        ${table.verifiedAt} >= ${table.createdAt} and
        ${table.retentionExpiresAt} > ${table.verifiedAt}
      `,
    ),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict", onUpdate: "cascade" }),
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "restrict", onUpdate: "cascade" }),
    serviceVersionId: text("service_version_id")
      .notNull()
      .references(() => serviceVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict", onUpdate: "cascade" }),
    state: text("state", { enum: transactionStates }).notNull().default("DRAFT"),
    riskDecision: text("risk_decision"),
    riskScore: integer("risk_score"),
    policyDecisionJson: text("policy_decision_json", { mode: "json" }).$type<
      Readonly<Record<string, unknown>>
    >(),
    amountSubunits: integer("amount_subunits").notNull(),
    currency: text("currency").notNull().default("INR"),
    requestId: text("request_id").notNull(),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("transactions_organization_request_uq").on(table.organizationId, table.requestId),
    uniqueIndex("transactions_id_organization_uq").on(table.id, table.organizationId),
    index("transactions_organization_user_state_idx").on(
      table.organizationId,
      table.userId,
      table.state,
    ),
    index("transactions_retention_expires_at_idx").on(table.retentionExpiresAt),
    check("transactions_id_valid", sql`${table.id} glob 'ctx_*' and length(${table.id}) = 30`),
    check(
      "transactions_state_valid",
      sql`${table.state} in ('DRAFT', 'DISCOVERING', 'OFFER_SELECTED', 'VERIFYING', 'POLICY_REVIEW', 'BLOCKED', 'APPROVAL_REQUIRED', 'APPROVED', 'BUDGET_RESERVED', 'CHECKOUT_CREATED', 'ORDER_CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'CALLBACK_VERIFIED', 'PAYMENT_RECONCILING', 'PAYMENT_CAPTURED', 'ENTITLEMENT_ISSUED', 'FULFILLING', 'FULFILMENT_FAILED', 'FULFILLED', 'EVIDENCE_READY', 'EXPIRED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED')`,
    ),
    check("transactions_amount_valid", sql`${table.amountSubunits} >= 0`),
    check("transactions_currency_valid", sql`${table.currency} = 'INR'`),
    check("transactions_request_id_valid", sql`length(trim(${table.requestId})) between 8 and 128`),
    check(
      "transactions_risk_score_valid",
      sql`${table.riskScore} is null or ${table.riskScore} between 0 and 100`,
    ),
    check(
      "transactions_policy_json_valid",
      sql`${table.policyDecisionJson} is null or (json_valid(${table.policyDecisionJson}) and json_type(${table.policyDecisionJson}) = 'object')`,
    ),
    check(
      "transactions_retention_valid",
      sql`${table.updatedAt} >= ${table.createdAt} and ${table.retentionExpiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const transactionApprovals = sqliteTable(
  "transaction_approvals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => approvalChallenges.id, { onDelete: "restrict", onUpdate: "cascade" }),
    credentialId: text("credential_id")
      .notNull()
      .references(() => passkeyCredentials.id, { onDelete: "restrict", onUpdate: "cascade" }),
    payloadHash: text("payload_hash").notNull(),
    proofHash: text("proof_hash").notNull(),
    proofJson: text("proof_json", { mode: "json" })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    status: text("status", { enum: transactionApprovalStates }).notNull().default("ACTIVE"),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("transaction_approvals_active_logical_uq")
      .on(table.organizationId, table.transactionId, table.payloadHash)
      .where(sql`${table.status} = 'ACTIVE'`),
    uniqueIndex("transaction_approvals_challenge_uq").on(table.challengeId),
    index("transaction_approvals_retention_expires_at_idx").on(table.retentionExpiresAt),
    check(
      "transaction_approvals_id_valid",
      sql`${table.id} glob 'tap_*' and length(${table.id}) = 30`,
    ),
    check(
      "transaction_approvals_status_valid",
      sql`${table.status} in ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED')`,
    ),
    check("transaction_approvals_payload_hash_valid", sha256Check(table.payloadHash)),
    check("transaction_approvals_proof_hash_valid", sha256Check(table.proofHash)),
    check("transaction_approvals_proof_json_valid", sql`json_valid(${table.proofJson})`),
    check(
      "transaction_approvals_time_order_valid",
      sql`
        ${table.approvedAt} >= ${table.createdAt} and ${table.expiresAt} > ${table.approvedAt} and
        ${table.retentionExpiresAt} >= ${table.expiresAt}
      `,
    ),
    check(
      "transaction_approvals_consumption_valid",
      sql`
        (${table.status} = 'CONSUMED' and ${table.consumedAt} is not null and ${table.consumedAt} >= ${table.approvedAt}) or
        (${table.status} != 'CONSUMED' and ${table.consumedAt} is null)
      `,
    ),
  ],
);

export const consumedNonces = sqliteTable(
  "consumed_nonces",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    mandateId: text("mandate_id").references(() => mandates.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    source: text("source", { enum: consumedNonceSources }).notNull(),
    scope: text("scope").notNull(),
    nonce: text("nonce").notNull(),
    payloadHash: text("payload_hash").notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }).notNull(),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("consumed_nonces_organization_scope_nonce_uq").on(
      table.organizationId,
      table.scope,
      table.nonce,
    ),
    index("consumed_nonces_retention_expires_at_idx").on(table.retentionExpiresAt),
    check("consumed_nonces_id_valid", sql`${table.id} glob 'rpn_*' and length(${table.id}) = 30`),
    check(
      "consumed_nonces_source_valid",
      sql`${table.source} in ('OPEN_MANDATE', 'CLOSED_MANDATE', 'TRANSACTION_APPROVAL', 'MERCHANT_EVENT')`,
    ),
    check("consumed_nonces_scope_valid", sql`length(trim(${table.scope})) between 1 and 128`),
    check("consumed_nonces_nonce_valid", sql`length(${table.nonce}) between 8 and 512`),
    check("consumed_nonces_payload_hash_valid", sha256Check(table.payloadHash)),
    check(
      "consumed_nonces_time_order_valid",
      sql`
        ${table.consumedAt} >= ${table.createdAt} and
        ${table.retentionExpiresAt} > ${table.consumedAt}
      `,
    ),
  ],
);

export const spendReservations = sqliteTable(
  "spend_reservations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict", onUpdate: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    amountSubunits: integer("amount_subunits").notNull(),
    status: text("status", { enum: spendReservationStatuses }).notNull().default("RESERVED"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("spend_reservations_active_transaction_uq")
      .on(table.transactionId)
      .where(sql`${table.status} = 'RESERVED'`),
    index("spend_reservations_mandate_status_idx").on(table.mandateId, table.status),
    index("spend_reservations_retention_expires_at_idx").on(table.retentionExpiresAt),
    check(
      "spend_reservations_id_valid",
      sql`${table.id} glob 'rsv_*' and length(${table.id}) = 30`,
    ),
    check("spend_reservations_amount_valid", sql`${table.amountSubunits} > 0`),
    check(
      "spend_reservations_status_valid",
      sql`${table.status} in ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED')`,
    ),
    check(
      "spend_reservations_lifecycle_valid",
      sql`
        (${table.status} = 'RESERVED' and ${table.closedAt} is null) or
        (${table.status} != 'RESERVED' and ${table.closedAt} is not null and ${table.closedAt} >= ${table.createdAt})
      `,
    ),
    check(
      "spend_reservations_time_order_valid",
      sql`
        ${table.expiresAt} > ${table.createdAt} and ${table.updatedAt} >= ${table.createdAt} and
        ${table.retentionExpiresAt} >= ${table.expiresAt}
      `,
    ),
  ],
);

export const paymentAttempts = sqliteTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict", onUpdate: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    amountSubunits: integer("amount_subunits").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status", { enum: paymentAttemptStatuses }).notNull().default("CREATED"),
    checkoutHash: text("checkout_hash").notNull(),
    provider: text("provider").notNull().default("RAZORPAY"),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    receipt: text("receipt"),
    callbackVerifiedAt: integer("callback_verified_at", { mode: "timestamp_ms" }),
    orderStatus: text("order_status"),
    paymentStatus: text("payment_status"),
    fulfilmentEligible: integer("fulfilment_eligible", { mode: "boolean" })
      .notNull()
      .default(false),
    providerSnapshotJson: text("provider_snapshot_json", { mode: "json" }).$type<
      Readonly<Record<string, unknown>>
    >(),
    failureCode: text("failure_code"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("payment_attempts_transaction_number_uq").on(
      table.transactionId,
      table.attemptNumber,
    ),
    uniqueIndex("payment_attempts_provider_order_uq").on(table.provider, table.providerOrderId),
    uniqueIndex("payment_attempts_provider_payment_uq").on(table.provider, table.providerPaymentId),
    index("payment_attempts_retention_expires_at_idx").on(table.retentionExpiresAt),
    check("payment_attempts_id_valid", sql`${table.id} glob 'pat_*' and length(${table.id}) = 30`),
    check("payment_attempts_number_valid", sql`${table.attemptNumber} between 1 and 10`),
    check("payment_attempts_amount_valid", sql`${table.amountSubunits} > 0`),
    check("payment_attempts_currency_valid", sql`${table.currency} = 'INR'`),
    check("payment_attempts_provider_valid", sql`${table.provider} = 'RAZORPAY'`),
    check(
      "payment_attempts_provider_references_valid",
      sql`
        (${table.providerOrderId} is null or ${table.providerOrderId} glob 'order_*') and
        (${table.providerPaymentId} is null or ${table.providerPaymentId} glob 'pay_*') and
        (${table.receipt} is null or (length(${table.receipt}) between 1 and 40 and ${table.receipt} not glob '*[^A-Za-z0-9_-]*'))
      `,
    ),
    check(
      "payment_attempts_provider_status_valid",
      sql`
        (${table.orderStatus} is null or ${table.orderStatus} in ('created', 'attempted', 'paid')) and
        (${table.paymentStatus} is null or ${table.paymentStatus} in ('created', 'authorized', 'captured', 'refunded', 'failed'))
      `,
    ),
    check(
      "payment_attempts_eligibility_valid",
      sql`${table.fulfilmentEligible} = 0 or (${table.status} = 'SUCCEEDED' and ${table.orderStatus} = 'paid' and ${table.paymentStatus} = 'captured')`,
    ),
    check(
      "payment_attempts_provider_snapshot_valid",
      sql`${table.providerSnapshotJson} is null or (json_valid(${table.providerSnapshotJson}) and json_type(${table.providerSnapshotJson}) = 'object')`,
    ),
    check(
      "payment_attempts_status_valid",
      sql`${table.status} in ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')`,
    ),
    check("payment_attempts_checkout_hash_valid", sha256Check(table.checkoutHash)),
    check(
      "payment_attempts_terminal_valid",
      sql`
        (${table.status} in ('CREATED', 'PENDING') and ${table.completedAt} is null and ${table.failureCode} is null) or
        (${table.status} = 'SUCCEEDED' and ${table.completedAt} is not null and ${table.failureCode} is null) or
        (${table.status} in ('FAILED', 'CANCELLED') and ${table.completedAt} is not null and ${table.failureCode} is not null)
      `,
    ),
    check(
      "payment_attempts_time_order_valid",
      sql`
        ${table.updatedAt} >= ${table.createdAt} and
        (${table.completedAt} is null or ${table.completedAt} between ${table.createdAt} and ${table.updatedAt}) and
        ${table.retentionExpiresAt} > ${table.createdAt}
      `,
    ),
  ],
);

export const providerEvents = sqliteTable(
  "provider_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    paymentAttemptId: text("payment_attempt_id").references(() => paymentAttempts.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    provider: text("provider").notNull().default("RAZORPAY"),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    rawPayloadR2Key: text("raw_payload_r2_key").notNull(),
    signatureVerified: integer("signature_verified", { mode: "boolean" }).notNull(),
    processingStatus: text("processing_status", {
      enum: providerEventProcessingStatuses,
    })
      .notNull()
      .default("RECEIVED"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("provider_events_provider_event_uq").on(table.provider, table.providerEventId),
    index("provider_events_transaction_received_idx").on(table.transactionId, table.receivedAt),
    index("provider_events_retention_expires_at_idx").on(table.retentionExpiresAt),
    check("provider_events_id_valid", sql`${table.id} glob 'pev_*' and length(${table.id}) = 30`),
    check("provider_events_provider_valid", sql`${table.provider} = 'RAZORPAY'`),
    check(
      "provider_events_reference_valid",
      sql`
        length(trim(${table.providerEventId})) between 3 and 128 and
        length(trim(${table.eventType})) between 3 and 128 and
        length(trim(${table.rawPayloadR2Key})) between 3 and 1024
      `,
    ),
    check("provider_events_payload_hash_valid", sha256Check(table.payloadHash)),
    check("provider_events_signature_verified_valid", sql`${table.signatureVerified} in (0, 1)`),
    check(
      "provider_events_processing_status_valid",
      sql`${table.processingStatus} in ('RECEIVED', 'VERIFIED', 'PROCESSED', 'REJECTED')`,
    ),
    check(
      "provider_events_processing_time_valid",
      sql`
        (${table.processingStatus} in ('RECEIVED', 'VERIFIED') and ${table.processedAt} is null) or
        (${table.processingStatus} in ('PROCESSED', 'REJECTED') and ${table.processedAt} is not null and ${table.processedAt} >= ${table.receivedAt})
      `,
    ),
    check(
      "provider_events_retention_valid",
      sql`
        ${table.receivedAt} = ${table.createdAt} and
        ${table.retentionExpiresAt} > ${table.receivedAt}
      `,
    ),
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
  agentKeys,
  agentModelCapacityLeases,
  agentModelUsageWindows,
  agentRunEvents,
  agentRuns,
  agentToolCalls,
  agentVersionTools,
  agentVersions,
  agents,
  approvalChallenges,
  auditEvents,
  consumedNonces,
  demoWorkspaces,
  idempotencyRecords,
  mandateProofs,
  mandates,
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
  paymentAttempts,
  providerEvents,
  rateLimit,
  replayNonces,
  services,
  serviceVersions,
  session,
  spendReservations,
  transactionApprovals,
  transactions,
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
export type AgentModelCapacityLease = typeof agentModelCapacityLeases.$inferSelect;
export type NewAgentModelCapacityLease = typeof agentModelCapacityLeases.$inferInsert;
export type AgentModelUsageWindow = typeof agentModelUsageWindows.$inferSelect;
export type NewAgentModelUsageWindow = typeof agentModelUsageWindows.$inferInsert;
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
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentVersionRecord = typeof agentVersions.$inferSelect;
export type NewAgentVersionRecord = typeof agentVersions.$inferInsert;
export type AgentKey = typeof agentKeys.$inferSelect;
export type NewAgentKey = typeof agentKeys.$inferInsert;
export type AgentVersionTool = typeof agentVersionTools.$inferSelect;
export type NewAgentVersionTool = typeof agentVersionTools.$inferInsert;
export type AgentRunRecord = typeof agentRuns.$inferSelect;
export type NewAgentRunRecord = typeof agentRuns.$inferInsert;
export type AgentToolCallRecord = typeof agentToolCalls.$inferSelect;
export type NewAgentToolCallRecord = typeof agentToolCalls.$inferInsert;
export type AgentRunEventRecord = typeof agentRunEvents.$inferSelect;
export type NewAgentRunEventRecord = typeof agentRunEvents.$inferInsert;
export type Mandate = typeof mandates.$inferSelect;
export type NewMandate = typeof mandates.$inferInsert;
export type MandateProof = typeof mandateProofs.$inferSelect;
export type NewMandateProof = typeof mandateProofs.$inferInsert;
export type TransactionRecord = typeof transactions.$inferSelect;
export type NewTransactionRecord = typeof transactions.$inferInsert;
export type TransactionApproval = typeof transactionApprovals.$inferSelect;
export type NewTransactionApproval = typeof transactionApprovals.$inferInsert;
export type ConsumedNonce = typeof consumedNonces.$inferSelect;
export type NewConsumedNonce = typeof consumedNonces.$inferInsert;
export type SpendReservation = typeof spendReservations.$inferSelect;
export type NewSpendReservation = typeof spendReservations.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type ProviderEvent = typeof providerEvents.$inferSelect;
export type NewProviderEvent = typeof providerEvents.$inferInsert;
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
