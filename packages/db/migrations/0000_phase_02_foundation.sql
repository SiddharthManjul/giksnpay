CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "account_identity_not_blank" CHECK(
      length(trim("account"."issuer")) > 0 and
      length(trim("account"."account_id")) > 0 and
      length(trim("account"."provider_id")) > 0
    ),
	CONSTRAINT "account_updated_after_created" CHECK("account"."updated_at" >= "account"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_account_id_uq` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `account_provider_id_idx` ON `account` (`provider_id`);--> statement-breakpoint
CREATE TABLE `approval_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text,
	`purpose` text NOT NULL,
	`challenge_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "approval_challenges_purpose_valid" CHECK("approval_challenges"."purpose" in ('MANDATE_ACTIVATION', 'TRANSACTION_STEP_UP')),
	CONSTRAINT "approval_challenges_state_valid" CHECK("approval_challenges"."state" in ('PENDING', 'CONSUMED', 'EXPIRED', 'CANCELLED')),
	CONSTRAINT "approval_challenges_challenge_hash_valid" CHECK(length("approval_challenges"."challenge_hash") = 64 and "approval_challenges"."challenge_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "approval_challenges_payload_hash_valid" CHECK(length("approval_challenges"."payload_hash") = 64 and "approval_challenges"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "approval_challenges_expires_after_created" CHECK("approval_challenges"."expires_at" > "approval_challenges"."created_at"),
	CONSTRAINT "approval_challenges_consumption_valid" CHECK(
        ("approval_challenges"."state" = 'CONSUMED' and "approval_challenges"."consumed_at" is not null and "approval_challenges"."consumed_at" >= "approval_challenges"."created_at") or
        ("approval_challenges"."state" != 'CONSUMED' and "approval_challenges"."consumed_at" is null)
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_challenges_hash_uq` ON `approval_challenges` (`challenge_hash`);--> statement-breakpoint
CREATE INDEX `approval_challenges_user_state_idx` ON `approval_challenges` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `approval_challenges_expires_at_idx` ON `approval_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`schema_version` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`issuer` text NOT NULL,
	`audience` text NOT NULL,
	`jti` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`previous_event_hash` text,
	`event_hash` text NOT NULL,
	`signature` text NOT NULL,
	`kid` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "audit_events_sequence_nonnegative" CHECK("audit_events"."sequence" >= 0),
	CONSTRAINT "audit_events_schema_version_valid" CHECK("audit_events"."schema_version" = 'mindpay.audit.event.1'),
	CONSTRAINT "audit_events_payload_hash_valid" CHECK(length("audit_events"."payload_hash") = 64 and "audit_events"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "audit_events_previous_hash_valid" CHECK("audit_events"."previous_event_hash" is null or (length("audit_events"."previous_event_hash") = 64 and "audit_events"."previous_event_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "audit_events_event_hash_valid" CHECK(length("audit_events"."event_hash") = 64 and "audit_events"."event_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "audit_events_chain_root_valid" CHECK(
        ("audit_events"."sequence" = 0 and "audit_events"."previous_event_hash" is null) or
        ("audit_events"."sequence" > 0 and "audit_events"."previous_event_hash" is not null)
      ),
	CONSTRAINT "audit_events_occurrence_valid" CHECK("audit_events"."occurred_at" = "audit_events"."created_at"),
	CONSTRAINT "audit_events_expires_after_occurrence" CHECK("audit_events"."expires_at" > "audit_events"."occurred_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_transaction_sequence_uq` ON `audit_events` (`transaction_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_event_hash_uq` ON `audit_events` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_jti_uq` ON `audit_events` (`jti`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer,
	`response_body` text,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`),
	CONSTRAINT "idempotency_records_scope_not_blank" CHECK(length(trim("idempotency_records"."scope")) between 1 and 128),
	CONSTRAINT "idempotency_records_key_valid" CHECK(length("idempotency_records"."key") between 16 and 128),
	CONSTRAINT "idempotency_records_request_hash_valid" CHECK(length("idempotency_records"."request_hash") = 64 and "idempotency_records"."request_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "idempotency_records_state_valid" CHECK("idempotency_records"."state" in ('PENDING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "idempotency_records_response_status_valid" CHECK("idempotency_records"."response_status" is null or "idempotency_records"."response_status" between 100 and 599),
	CONSTRAINT "idempotency_records_response_state_valid" CHECK(
        ("idempotency_records"."state" = 'PENDING' and "idempotency_records"."response_status" is null and "idempotency_records"."response_body" is null) or
        ("idempotency_records"."state" != 'PENDING' and "idempotency_records"."response_status" is not null and "idempotency_records"."response_body" is not null)
      ),
	CONSTRAINT "idempotency_records_expires_after_created" CHECK("idempotency_records"."expires_at" > "idempotency_records"."created_at")
);
--> statement-breakpoint
CREATE INDEX `idempotency_records_expires_at_idx` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "organization_members_role_valid" CHECK("organization_members"."role" in ('OWNER', 'ADMIN', 'BUILDER', 'REVIEWER', 'VIEWER'))
);
--> statement-breakpoint
CREATE INDEX `organization_members_user_id_idx` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "organizations_name_not_blank" CHECK(length(trim("organizations"."name")) between 1 and 128),
	CONSTRAINT "organizations_slug_format" CHECK(
        length("organizations"."slug") between 3 and 63 and
        "organizations"."slug" = lower("organizations"."slug") and
        "organizations"."slug" not glob '*[^a-z0-9-]*' and
        substr("organizations"."slug", 1, 1) != '-' and
        substr("organizations"."slug", -1, 1) != '-'
      ),
	CONSTRAINT "organizations_status_valid" CHECK("organizations"."status" in ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
	CONSTRAINT "organizations_updated_after_created" CHECK("organizations"."updated_at" >= "organizations"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uq` ON `organizations` (lower("slug"));--> statement-breakpoint
CREATE TABLE `replay_nonces` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`nonce` text NOT NULL,
	`subject_id` text,
	`payload_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "replay_nonces_scope_not_blank" CHECK(length(trim("replay_nonces"."scope")) between 1 and 128),
	CONSTRAINT "replay_nonces_nonce_not_blank" CHECK(length("replay_nonces"."nonce") between 8 and 512),
	CONSTRAINT "replay_nonces_payload_hash_valid" CHECK(length("replay_nonces"."payload_hash") = 64 and "replay_nonces"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "replay_nonces_expires_after_created" CHECK("replay_nonces"."expires_at" > "replay_nonces"."created_at"),
	CONSTRAINT "replay_nonces_consumed_after_created" CHECK("replay_nonces"."consumed_at" >= "replay_nonces"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `replay_nonces_scope_nonce_uq` ON `replay_nonces` (`scope`,`nonce`);--> statement-breakpoint
CREATE INDEX `replay_nonces_expires_at_idx` ON `replay_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "session_token_not_blank" CHECK(length("session"."token") between 32 and 512),
	CONSTRAINT "session_expires_after_created" CHECK("session"."expires_at" > "session"."created_at"),
	CONSTRAINT "session_updated_after_created" CHECK("session"."updated_at" >= "session"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_uq` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_expires_at_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "user_email_not_blank" CHECK(length(trim("user"."email")) between 3 and 320),
	CONSTRAINT "user_name_not_blank" CHECK(length(trim("user"."name")) between 1 and 128),
	CONSTRAINT "user_updated_after_created" CHECK("user"."updated_at" >= "user"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_uq` ON `user` (lower("email"));--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "verification_identifier_not_blank" CHECK(length(trim("verification"."identifier")) > 0),
	CONSTRAINT "verification_value_not_blank" CHECK(length("verification"."value") > 0),
	CONSTRAINT "verification_expires_after_created" CHECK("verification"."expires_at" > "verification"."created_at"),
	CONSTRAINT "verification_updated_after_created" CHECK("verification"."updated_at" >= "verification"."created_at")
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `verification_expires_at_idx` ON `verification` (`expires_at`);--> statement-breakpoint
CREATE TRIGGER `audit_events_no_update`
BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events are append-only');
END;--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete`
BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events are append-only');
END;
