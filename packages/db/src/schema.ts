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

export const organizationRoles = ["OWNER", "ADMIN", "BUILDER", "REVIEWER", "VIEWER"] as const;
export const organizationStatuses = ["ACTIVE", "SUSPENDED", "EXPIRED"] as const;
export const approvalChallengePurposes = ["MANDATE_ACTIVATION", "TRANSACTION_STEP_UP"] as const;
export const approvalChallengeStates = ["PENDING", "CONSUMED", "EXPIRED", "CANCELLED"] as const;
export const idempotencyStates = ["PENDING", "COMPLETED", "FAILED"] as const;

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

export const schema = {
  account,
  approvalChallenges,
  auditEvents,
  idempotencyRecords,
  organizationMembers,
  organizations,
  replayNonces,
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
