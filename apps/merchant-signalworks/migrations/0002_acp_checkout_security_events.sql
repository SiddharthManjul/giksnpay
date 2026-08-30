CREATE TABLE `merchant_machine_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`valid_from` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "merchant_machine_credentials_id_valid" CHECK(length(`id`) between 8 and 128),
	CONSTRAINT "merchant_machine_credentials_label_valid" CHECK(length(trim(`label`)) between 2 and 120),
	CONSTRAINT "merchant_machine_credentials_hash_valid" CHECK(length(`token_hash`) = 64 and `token_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT "merchant_machine_credentials_window_valid" CHECK(`created_at` <= `valid_from` and `expires_at` > `valid_from`),
	CONSTRAINT "merchant_machine_credentials_revocation_valid" CHECK(`revoked_at` is null or `revoked_at` >= `valid_from`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_machine_credentials_token_hash_uq` ON `merchant_machine_credentials` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `merchant_machine_credentials_lifecycle_idx` ON `merchant_machine_credentials` (`valid_from`,`expires_at`,`revoked_at`);
--> statement-breakpoint
CREATE TABLE `merchant_checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`acp_state` text NOT NULL,
	`acp_state_hash` text NOT NULL,
	`acp_signature` text NOT NULL,
	`merchant_checkout` text NOT NULL,
	`merchant_checkout_signature` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `merchant_machine_credentials`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "merchant_checkout_sessions_id_valid" CHECK(length(`id`) = 35 and substr(`id`, 1, 9) = 'checkout_'),
	CONSTRAINT "merchant_checkout_sessions_status_valid" CHECK(`status` in ('ready_for_payment', 'completed', 'canceled')),
	CONSTRAINT "merchant_checkout_sessions_revision_valid" CHECK(`revision` >= 1),
	CONSTRAINT "merchant_checkout_sessions_json_valid" CHECK(json_valid(`acp_state`) and json_valid(`acp_signature`) and json_valid(`merchant_checkout`) and json_valid(`merchant_checkout_signature`)),
	CONSTRAINT "merchant_checkout_sessions_hash_valid" CHECK(length(`acp_state_hash`) = 64 and `acp_state_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT "merchant_checkout_sessions_timestamps_valid" CHECK(`created_at` <= `updated_at` and `expires_at` > `created_at`)
);
--> statement-breakpoint
CREATE INDEX `merchant_checkout_sessions_credential_idx` ON `merchant_checkout_sessions` (`credential_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `merchant_checkout_sessions_status_idx` ON `merchant_checkout_sessions` (`status`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `merchant_idempotency_records` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`state` text NOT NULL,
	`response_status` integer,
	`response_body` text,
	`response_headers` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`),
	CONSTRAINT "merchant_idempotency_records_scope_valid" CHECK(length(`scope`) between 8 and 512),
	CONSTRAINT "merchant_idempotency_records_key_valid" CHECK(length(`key`) between 1 and 255),
	CONSTRAINT "merchant_idempotency_records_request_id_valid" CHECK(length(`request_id`) between 1 and 255),
	CONSTRAINT "merchant_idempotency_records_hash_valid" CHECK(length(`request_hash`) = 64 and `request_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT "merchant_idempotency_records_state_valid" CHECK(`state` in ('PENDING', 'COMPLETED')),
	CONSTRAINT "merchant_idempotency_records_response_valid" CHECK((`state` = 'PENDING' and `response_status` is null and `response_body` is null and `response_headers` is null) or (`state` = 'COMPLETED' and `response_status` between 100 and 599 and json_valid(`response_body`) and json_valid(`response_headers`))),
	CONSTRAINT "merchant_idempotency_records_expiry_valid" CHECK(`expires_at` > `created_at`)
);
--> statement-breakpoint
CREATE INDEX `merchant_idempotency_records_expiry_idx` ON `merchant_idempotency_records` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `merchant_outbound_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`checkout_session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`nonce` text NOT NULL,
	`kid` text NOT NULL,
	`event` text NOT NULL,
	`signature` text NOT NULL,
	`state_hash` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`checkout_session_id`) REFERENCES `merchant_checkout_sessions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "merchant_outbound_events_id_valid" CHECK(length(`event_id`) = 30 and substr(`event_id`, 1, 4) = 'evt_'),
	CONSTRAINT "merchant_outbound_events_type_valid" CHECK(`event_type` in ('CHECKOUT_CREATED', 'CHECKOUT_UPDATED', 'ORDER_CREATED', 'CHECKOUT_CANCELED')),
	CONSTRAINT "merchant_outbound_events_nonce_valid" CHECK(length(`nonce`) between 16 and 128),
	CONSTRAINT "merchant_outbound_events_kid_valid" CHECK(length(`kid`) between 1 and 128 and `kid` not glob '*[^A-Za-z0-9._:-]*'),
	CONSTRAINT "merchant_outbound_events_json_valid" CHECK(json_valid(`event`) and json_valid(`signature`)),
	CONSTRAINT "merchant_outbound_events_hash_valid" CHECK(length(`state_hash`) = 64 and `state_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT "merchant_outbound_events_timestamps_valid" CHECK(`created_at` = `occurred_at` and `expires_at` > `occurred_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_outbound_events_nonce_uq` ON `merchant_outbound_events` (`nonce`);
--> statement-breakpoint
CREATE INDEX `merchant_outbound_events_checkout_idx` ON `merchant_outbound_events` (`checkout_session_id`,`occurred_at`);
--> statement-breakpoint
CREATE TRIGGER `merchant_outbound_events_reject_update`
BEFORE UPDATE ON `merchant_outbound_events`
BEGIN
	SELECT RAISE(ABORT, 'published merchant events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_outbound_events_reject_delete`
BEFORE DELETE ON `merchant_outbound_events`
BEGIN
	SELECT RAISE(ABORT, 'published merchant events are immutable');
END;
