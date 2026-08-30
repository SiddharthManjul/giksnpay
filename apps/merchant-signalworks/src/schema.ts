import type {
  Es256CanonicalSignature,
  Es256PublicJwk,
  MerchantCheckout,
  MerchantOrderLifecycleEvent,
} from "@mindpay/contracts";
import type { AesGcmEnvelope } from "@mindpay/crypto";
import type { AcpCheckoutSession } from "@mindpay/protocol-acp";
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

export const signalWorksMerchantStatuses = ["ACTIVE", "SUSPENDED"] as const;
export const signalWorksSigningPurposes = ["catalog", "checkout", "event", "manifest"] as const;
export const signalWorksServiceAvailabilities = ["available", "paused", "unavailable"] as const;
export const signalWorksFulfilmentTypes = ["mcp", "rest"] as const;
export const signalWorksCheckoutStatuses = ["ready_for_payment", "completed", "canceled"] as const;
export const signalWorksIdempotencyStates = ["PENDING", "COMPLETED"] as const;
export const signalWorksOrderEventTypes = [
  "CHECKOUT_CREATED",
  "CHECKOUT_UPDATED",
  "ORDER_CREATED",
  "CHECKOUT_CANCELED",
] as const;

export const signalWorksMerchantIdentity = sqliteTable(
  "merchant_identity",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    legalName: text("legal_name").notNull(),
    domain: text("domain").notNull(),
    status: text("status", { enum: signalWorksMerchantStatuses }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_identity_domain_uq").on(table.domain),
    check("merchant_identity_id_valid", sql`${table.id} = 'merchant_signalworks'`),
    check("merchant_identity_name_valid", sql`length(trim(${table.name})) between 2 and 120`),
    check(
      "merchant_identity_legal_name_valid",
      sql`length(trim(${table.legalName})) between 2 and 160`,
    ),
    check(
      "merchant_identity_domain_valid",
      sql`${table.domain} = lower(${table.domain}) and length(${table.domain}) between 4 and 253`,
    ),
    check("merchant_identity_status_valid", sql`${table.status} in ('ACTIVE', 'SUSPENDED')`),
  ],
);

export const signalWorksSigningKeys = sqliteTable(
  "merchant_signing_keys",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => signalWorksMerchantIdentity.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kid: text("kid").notNull(),
    purpose: text("purpose", { enum: signalWorksSigningPurposes }).notNull(),
    publicJwk: text("public_jwk", { mode: "json" }).$type<Es256PublicJwk>().notNull(),
    encryptedPrivateJwk: text("encrypted_private_jwk", { mode: "json" })
      .$type<AesGcmEnvelope>()
      .notNull(),
    validFrom: integer("valid_from", { mode: "timestamp_ms" }).notNull(),
    validUntil: integer("valid_until", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_signing_keys_merchant_kid_uq").on(table.merchantId, table.kid),
    index("merchant_signing_keys_active_purpose_idx").on(
      table.merchantId,
      table.purpose,
      table.validFrom,
    ),
    check("merchant_signing_keys_id_valid", sql`length(trim(${table.id})) between 8 and 160`),
    check(
      "merchant_signing_keys_kid_valid",
      sql`length(${table.kid}) between 1 and 128 and ${table.kid} not glob '*[^A-Za-z0-9._:-]*'`,
    ),
    check(
      "merchant_signing_keys_purpose_valid",
      sql`${table.purpose} in ('catalog', 'checkout', 'event', 'manifest')`,
    ),
    check(
      "merchant_signing_keys_public_jwk_valid",
      sql`
        json_valid(${table.publicJwk}) and
        json_extract(${table.publicJwk}, '$.kty') = 'EC' and
        json_extract(${table.publicJwk}, '$.crv') = 'P-256' and
        json_type(${table.publicJwk}, '$.d') is null
      `,
    ),
    check(
      "merchant_signing_keys_private_envelope_valid",
      sql`
        json_valid(${table.encryptedPrivateJwk}) and
        json_extract(${table.encryptedPrivateJwk}, '$.version') = 1 and
        json_extract(${table.encryptedPrivateJwk}, '$.algorithm') = 'A256GCM'
      `,
    ),
    check(
      "merchant_signing_keys_validity_window_valid",
      sql`${table.validUntil} is null or ${table.validUntil} > ${table.validFrom}`,
    ),
    check(
      "merchant_signing_keys_revocation_valid",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.validFrom}`,
    ),
    check("merchant_signing_keys_created_at_valid", sql`${table.createdAt} <= ${table.validFrom}`),
  ],
);

export const signalWorksServiceVersions = sqliteTable(
  "merchant_service_versions",
  {
    merchantId: text("merchant_id")
      .notNull()
      .references(() => signalWorksMerchantIdentity.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceId: text("service_id").notNull(),
    version: text("version").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    currency: text("currency", { enum: ["INR"] }).notNull(),
    priceSubunits: integer("price_subunits").notNull(),
    availability: text("availability", { enum: signalWorksServiceAvailabilities }).notNull(),
    fulfilmentType: text("fulfilment_type", { enum: signalWorksFulfilmentTypes }).notNull(),
    fulfilmentToolId: text("fulfilment_tool_id").notNull(),
    estimatedDeliverySeconds: integer("estimated_delivery_seconds").notNull(),
    privacyUrl: text("privacy_url").notNull(),
    termsUrl: text("terms_url").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.merchantId, table.serviceId, table.version] }),
    index("merchant_service_versions_catalog_idx").on(
      table.merchantId,
      table.version,
      table.priceSubunits,
    ),
    check(
      "merchant_service_versions_service_id_valid",
      sql`
        length(${table.serviceId}) between 3 and 96 and
        ${table.serviceId} = lower(${table.serviceId}) and
        ${table.serviceId} not glob '*[^a-z0-9_]*' and
        substr(${table.serviceId}, 1, 1) glob '[a-z]' and
        substr(${table.serviceId}, -1, 1) glob '[a-z0-9]' and
        instr(${table.serviceId}, '__') = 0
      `,
    ),
    check(
      "merchant_service_versions_version_valid",
      sql`
        length(${table.version}) between 5 and 32 and
        ${table.version} not glob '*[^0-9.]*' and
        length(${table.version}) - length(replace(${table.version}, '.', '')) = 2 and
        substr(${table.version}, 1, 1) glob '[0-9]' and
        substr(${table.version}, -1, 1) glob '[0-9]'
      `,
    ),
    check(
      "merchant_service_versions_name_valid",
      sql`length(${table.name}) between 2 and 160 and ${table.name} = trim(${table.name})`,
    ),
    check(
      "merchant_service_versions_description_valid",
      sql`length(${table.description}) between 10 and 2000 and ${table.description} = trim(${table.description})`,
    ),
    check(
      "merchant_service_versions_category_valid",
      sql`
        length(${table.category}) between 3 and 96 and
        ${table.category} = lower(${table.category}) and
        ${table.category} not glob '*[^a-z0-9_]*' and
        substr(${table.category}, 1, 1) glob '[a-z]' and
        substr(${table.category}, -1, 1) glob '[a-z0-9]' and
        instr(${table.category}, '__') = 0
      `,
    ),
    check("merchant_service_versions_currency_valid", sql`${table.currency} = 'INR'`),
    check(
      "merchant_service_versions_price_valid",
      sql`typeof(${table.priceSubunits}) = 'integer' and ${table.priceSubunits} >= 0 and ${table.priceSubunits} <= 9007199254740991`,
    ),
    check(
      "merchant_service_versions_availability_valid",
      sql`${table.availability} in ('available', 'paused', 'unavailable')`,
    ),
    check(
      "merchant_service_versions_fulfilment_type_valid",
      sql`${table.fulfilmentType} in ('mcp', 'rest')`,
    ),
    check(
      "merchant_service_versions_tool_id_valid",
      sql`
        length(${table.fulfilmentToolId}) between 3 and 96 and
        ${table.fulfilmentToolId} = lower(${table.fulfilmentToolId}) and
        ${table.fulfilmentToolId} not glob '*[^a-z0-9_]*' and
        substr(${table.fulfilmentToolId}, 1, 1) glob '[a-z]' and
        substr(${table.fulfilmentToolId}, -1, 1) glob '[a-z0-9]' and
        instr(${table.fulfilmentToolId}, '__') = 0
      `,
    ),
    check(
      "merchant_service_versions_delivery_valid",
      sql`typeof(${table.estimatedDeliverySeconds}) = 'integer' and ${table.estimatedDeliverySeconds} between 1 and 86400`,
    ),
    check(
      "merchant_service_versions_policy_origins_valid",
      sql`
        ${table.privacyUrl} glob 'https://merchant-demo.example.com/*' and
        ${table.termsUrl} glob 'https://merchant-demo.example.com/*'
      `,
    ),
    check(
      "merchant_service_versions_timestamps_valid",
      sql`${table.createdAt} <= ${table.publishedAt}`,
    ),
  ],
);

export const signalWorksMachineCredentials = sqliteTable(
  "merchant_machine_credentials",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    validFrom: integer("valid_from", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_machine_credentials_token_hash_uq").on(table.tokenHash),
    index("merchant_machine_credentials_lifecycle_idx").on(
      table.validFrom,
      table.expiresAt,
      table.revokedAt,
    ),
    check("merchant_machine_credentials_id_valid", sql`length(${table.id}) between 8 and 128`),
    check(
      "merchant_machine_credentials_label_valid",
      sql`length(trim(${table.label})) between 2 and 120`,
    ),
    check(
      "merchant_machine_credentials_hash_valid",
      sql`length(${table.tokenHash}) = 64 and ${table.tokenHash} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "merchant_machine_credentials_window_valid",
      sql`${table.createdAt} <= ${table.validFrom} and ${table.expiresAt} > ${table.validFrom}`,
    ),
    check(
      "merchant_machine_credentials_revocation_valid",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.validFrom}`,
    ),
  ],
);

export const signalWorksCheckoutSessions = sqliteTable(
  "merchant_checkout_sessions",
  {
    id: text("id").primaryKey(),
    credentialId: text("credential_id")
      .notNull()
      .references(() => signalWorksMachineCredentials.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    status: text("status", { enum: signalWorksCheckoutStatuses }).notNull(),
    revision: integer("revision").notNull(),
    acpState: text("acp_state", { mode: "json" }).$type<AcpCheckoutSession>().notNull(),
    acpStateHash: text("acp_state_hash").notNull(),
    acpSignature: text("acp_signature", { mode: "json" })
      .$type<Es256CanonicalSignature>()
      .notNull(),
    merchantCheckout: text("merchant_checkout", { mode: "json" })
      .$type<MerchantCheckout>()
      .notNull(),
    merchantCheckoutSignature: text("merchant_checkout_signature", { mode: "json" })
      .$type<Es256CanonicalSignature>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("merchant_checkout_sessions_credential_idx").on(table.credentialId, table.createdAt),
    index("merchant_checkout_sessions_status_idx").on(table.status, table.expiresAt),
    check(
      "merchant_checkout_sessions_id_valid",
      sql`length(${table.id}) = 35 and substr(${table.id}, 1, 9) = 'checkout_'`,
    ),
    check(
      "merchant_checkout_sessions_status_valid",
      sql`${table.status} in ('ready_for_payment', 'completed', 'canceled')`,
    ),
    check("merchant_checkout_sessions_revision_valid", sql`${table.revision} >= 1`),
    check(
      "merchant_checkout_sessions_json_valid",
      sql`json_valid(${table.acpState}) and json_valid(${table.acpSignature}) and json_valid(${table.merchantCheckout}) and json_valid(${table.merchantCheckoutSignature})`,
    ),
    check(
      "merchant_checkout_sessions_hash_valid",
      sql`length(${table.acpStateHash}) = 64 and ${table.acpStateHash} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "merchant_checkout_sessions_timestamps_valid",
      sql`${table.createdAt} <= ${table.updatedAt} and ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const signalWorksIdempotencyRecords = sqliteTable(
  "merchant_idempotency_records",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestId: text("request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state", { enum: signalWorksIdempotencyStates }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body", { mode: "json" }).$type<unknown>(),
    responseHeaders: text("response_headers", { mode: "json" }).$type<Record<string, string>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.key] }),
    index("merchant_idempotency_records_expiry_idx").on(table.expiresAt),
    check(
      "merchant_idempotency_records_scope_valid",
      sql`length(${table.scope}) between 8 and 512`,
    ),
    check("merchant_idempotency_records_key_valid", sql`length(${table.key}) between 1 and 255`),
    check(
      "merchant_idempotency_records_request_id_valid",
      sql`length(${table.requestId}) between 1 and 255`,
    ),
    check(
      "merchant_idempotency_records_hash_valid",
      sql`length(${table.requestHash}) = 64 and ${table.requestHash} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "merchant_idempotency_records_state_valid",
      sql`${table.state} in ('PENDING', 'COMPLETED')`,
    ),
    check(
      "merchant_idempotency_records_response_valid",
      sql`(${table.state} = 'PENDING' and ${table.responseStatus} is null and ${table.responseBody} is null and ${table.responseHeaders} is null) or (${table.state} = 'COMPLETED' and ${table.responseStatus} between 100 and 599 and json_valid(${table.responseBody}) and json_valid(${table.responseHeaders}))`,
    ),
    check(
      "merchant_idempotency_records_expiry_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const signalWorksOutboundEvents = sqliteTable(
  "merchant_outbound_events",
  {
    eventId: text("event_id").primaryKey(),
    checkoutSessionId: text("checkout_session_id")
      .notNull()
      .references(() => signalWorksCheckoutSessions.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    eventType: text("event_type", { enum: signalWorksOrderEventTypes }).notNull(),
    nonce: text("nonce").notNull(),
    kid: text("kid").notNull(),
    event: text("event", { mode: "json" }).$type<MerchantOrderLifecycleEvent>().notNull(),
    signature: text("signature", { mode: "json" }).$type<Es256CanonicalSignature>().notNull(),
    stateHash: text("state_hash").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("merchant_outbound_events_nonce_uq").on(table.nonce),
    index("merchant_outbound_events_checkout_idx").on(table.checkoutSessionId, table.occurredAt),
    check(
      "merchant_outbound_events_id_valid",
      sql`length(${table.eventId}) = 30 and substr(${table.eventId}, 1, 4) = 'evt_'`,
    ),
    check(
      "merchant_outbound_events_type_valid",
      sql`${table.eventType} in ('CHECKOUT_CREATED', 'CHECKOUT_UPDATED', 'ORDER_CREATED', 'CHECKOUT_CANCELED')`,
    ),
    check("merchant_outbound_events_nonce_valid", sql`length(${table.nonce}) between 16 and 128`),
    check(
      "merchant_outbound_events_kid_valid",
      sql`length(${table.kid}) between 1 and 128 and ${table.kid} not glob '*[^A-Za-z0-9._:-]*'`,
    ),
    check(
      "merchant_outbound_events_json_valid",
      sql`json_valid(${table.event}) and json_valid(${table.signature})`,
    ),
    check(
      "merchant_outbound_events_hash_valid",
      sql`length(${table.stateHash}) = 64 and ${table.stateHash} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "merchant_outbound_events_timestamps_valid",
      sql`${table.createdAt} = ${table.occurredAt} and ${table.expiresAt} > ${table.occurredAt}`,
    ),
  ],
);

export const signalWorksSchema = {
  signalWorksCheckoutSessions,
  signalWorksIdempotencyRecords,
  signalWorksMachineCredentials,
  signalWorksMerchantIdentity,
  signalWorksOutboundEvents,
  signalWorksServiceVersions,
  signalWorksSigningKeys,
};

export type SignalWorksMerchantIdentityRow = typeof signalWorksMerchantIdentity.$inferSelect;
export type SignalWorksSigningKeyRow = typeof signalWorksSigningKeys.$inferSelect;
export type SignalWorksServiceVersionRow = typeof signalWorksServiceVersions.$inferSelect;
export type SignalWorksMachineCredentialRow = typeof signalWorksMachineCredentials.$inferSelect;
export type SignalWorksCheckoutSessionRow = typeof signalWorksCheckoutSessions.$inferSelect;
export type SignalWorksIdempotencyRecordRow = typeof signalWorksIdempotencyRecords.$inferSelect;
export type SignalWorksOutboundEventRow = typeof signalWorksOutboundEvents.$inferSelect;
