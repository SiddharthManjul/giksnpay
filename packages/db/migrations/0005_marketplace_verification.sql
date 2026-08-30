CREATE TABLE `merchants` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `legal_name` text NOT NULL,
  `domain` text NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `verification_status` text DEFAULT 'SUBMITTED' NOT NULL,
  `risk_tier` text DEFAULT 'LOW' NOT NULL,
  `verification_tier` text DEFAULT 'NONE' NOT NULL,
  `current_manifest_id` text,
  `current_catalog_id` text,
  `last_admin_event_id` text NOT NULL,
  `last_verification_at` integer,
  `verification_expires_at` integer,
  `quarantined_at` integer,
  `revision` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
  CONSTRAINT `merchants_id_valid` CHECK(`id` glob 'merchant_*' and length(`id`) between 12 and 96),
  CONSTRAINT `merchants_name_valid` CHECK(length(trim(`name`)) between 2 and 120),
  CONSTRAINT `merchants_legal_name_valid` CHECK(length(trim(`legal_name`)) between 2 and 160),
  CONSTRAINT `merchants_domain_valid` CHECK(`domain` = lower(`domain`) and instr(`domain`, '.') > 0),
  CONSTRAINT `merchants_status_valid` CHECK(`status` in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT `merchants_verification_status_valid` CHECK(`verification_status` in ('SUBMITTED', 'DOMAIN_VERIFIED', 'KEY_VERIFIED', 'CATALOG_VALIDATED', 'PAYMENT_CONFIGURATION_VERIFIED', 'APPROVED', 'REVIEW_REQUIRED', 'QUARANTINED')),
  CONSTRAINT `merchants_risk_tier_valid` CHECK(`risk_tier` in ('LOW', 'MEDIUM', 'HIGH')),
  CONSTRAINT `merchants_verification_tier_valid` CHECK(`verification_tier` in ('NONE', 'TEST_VERIFIED')),
  CONSTRAINT `merchants_revision_valid` CHECK(`revision` >= 0),
  CONSTRAINT `merchants_verification_expiry_valid` CHECK(`verification_expires_at` is null or (`last_verification_at` is not null and `verification_expires_at` > `last_verification_at`)),
  CONSTRAINT `merchants_updated_after_created` CHECK(`updated_at` >= `created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_domain_uq` ON `merchants` (lower(`domain`));
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_slug_uq` ON `merchants` (lower(`slug`));
--> statement-breakpoint
CREATE INDEX `merchants_discovery_idx` ON `merchants` (`status`, `verification_status`);
--> statement-breakpoint
CREATE TABLE `merchant_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL,
  `kid` text NOT NULL,
  `purpose` text NOT NULL,
  `public_jwk` text NOT NULL,
  `fingerprint` text NOT NULL,
  `valid_from` integer NOT NULL,
  `valid_until` integer,
  `revoked_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT `merchant_keys_purpose_valid` CHECK(`purpose` in ('manifest', 'catalog', 'checkout', 'event')),
  CONSTRAINT `merchant_keys_public_jwk_valid` CHECK(json_valid(`public_jwk`)),
  CONSTRAINT `merchant_keys_fingerprint_valid` CHECK(length(`fingerprint`) = 64 and `fingerprint` not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_keys_identity_uq` ON `merchant_keys` (`merchant_id`, `kid`, `purpose`, `fingerprint`);
--> statement-breakpoint
CREATE INDEX `merchant_keys_active_idx` ON `merchant_keys` (`merchant_id`, `purpose`, `revoked_at`);
--> statement-breakpoint
CREATE TABLE `merchant_manifests` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL,
  `schema_version` text NOT NULL,
  `manifest_json` text NOT NULL,
  `manifest_hash` text NOT NULL,
  `signature` text NOT NULL,
  `verified_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT `merchant_manifests_hash_valid` CHECK(length(`manifest_hash`) = 64 and `manifest_hash` not glob '*[^0-9a-f]*'),
  CONSTRAINT `merchant_manifests_json_valid` CHECK(json_valid(`manifest_json`) and json_valid(`signature`)),
  CONSTRAINT `merchant_manifests_expiry_valid` CHECK(`expires_at` > `verified_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_manifests_hash_uq` ON `merchant_manifests` (`merchant_id`, `manifest_hash`);
--> statement-breakpoint
CREATE TABLE `merchant_verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL,
  `run_id` text NOT NULL,
  `check_type` text NOT NULL,
  `status` text NOT NULL,
  `reason` text,
  `evidence_json` text NOT NULL,
  `checked_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT `merchant_verifications_status_valid` CHECK(`status` in ('PASS', 'FAIL')),
  CONSTRAINT `merchant_verifications_evidence_valid` CHECK(json_valid(`evidence_json`)),
  CONSTRAINT `merchant_verifications_result_valid` CHECK((`status` = 'PASS' and `reason` is null) or (`status` = 'FAIL' and `reason` is not null)),
  CONSTRAINT `merchant_verifications_expiry_valid` CHECK(`expires_at` > `checked_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_verifications_run_check_uq` ON `merchant_verifications` (`run_id`, `check_type`);
--> statement-breakpoint
CREATE INDEX `merchant_verifications_merchant_checked_idx` ON `merchant_verifications` (`merchant_id`, `checked_at`);
--> statement-breakpoint
CREATE TABLE `merchant_catalogs` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL,
  `version` text NOT NULL,
  `catalog_hash` text NOT NULL,
  `catalog_json` text NOT NULL,
  `signature` text NOT NULL,
  `verified_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT `merchant_catalogs_hash_valid` CHECK(length(`catalog_hash`) = 64 and `catalog_hash` not glob '*[^0-9a-f]*'),
  CONSTRAINT `merchant_catalogs_json_valid` CHECK(json_valid(`catalog_json`) and json_valid(`signature`)),
  CONSTRAINT `merchant_catalogs_expiry_valid` CHECK(`expires_at` > `verified_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_catalogs_version_hash_uq` ON `merchant_catalogs` (`merchant_id`, `version`, `catalog_hash`);
--> statement-breakpoint
CREATE INDEX `merchant_catalogs_merchant_verified_idx` ON `merchant_catalogs` (`merchant_id`, `verified_at`);
--> statement-breakpoint
CREATE TABLE `services` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL,
  `external_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL,
  `category` text NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `current_version_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT `services_status_valid` CHECK(`status` in ('ACTIVE', 'RETIRED')),
  CONSTRAINT `services_updated_after_created` CHECK(`updated_at` >= `created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_merchant_external_uq` ON `services` (`merchant_id`, `external_id`);
--> statement-breakpoint
CREATE INDEX `services_discovery_idx` ON `services` (`status`, `category`);
--> statement-breakpoint
CREATE TABLE `service_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `service_id` text NOT NULL,
  `version` text NOT NULL,
  `price_subunits` integer NOT NULL,
  `currency` text NOT NULL,
  `availability` text NOT NULL,
  `fulfilment_type` text NOT NULL,
  `fulfilment_tool_id` text NOT NULL,
  `estimated_delivery_seconds` integer NOT NULL,
  `privacy_url` text NOT NULL,
  `terms_url` text NOT NULL,
  `catalog_hash` text NOT NULL,
  `content_hash` text NOT NULL,
  `published_at` integer NOT NULL,
  `verified_at` integer NOT NULL,
  FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT `service_versions_price_valid` CHECK(typeof(`price_subunits`) = 'integer' and `price_subunits` >= 0),
  CONSTRAINT `service_versions_currency_valid` CHECK(`currency` = 'INR'),
  CONSTRAINT `service_versions_availability_valid` CHECK(`availability` in ('available', 'paused', 'unavailable')),
  CONSTRAINT `service_versions_fulfilment_valid` CHECK(`fulfilment_type` in ('mcp', 'rest') and `estimated_delivery_seconds` between 1 and 86400),
  CONSTRAINT `service_versions_catalog_hash_valid` CHECK(length(`catalog_hash`) = 64 and `catalog_hash` not glob '*[^0-9a-f]*'),
  CONSTRAINT `service_versions_content_hash_valid` CHECK(length(`content_hash`) = 64 and `content_hash` not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_versions_identity_uq` ON `service_versions` (`service_id`, `version`);
--> statement-breakpoint
CREATE INDEX `service_versions_marketplace_idx` ON `service_versions` (`availability`, `price_subunits`);
--> statement-breakpoint
CREATE TABLE `merchant_admin_events` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL,
  `organization_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `action` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `previous_verification_status` text,
  `next_verification_status` text NOT NULL,
  `details_json` text NOT NULL,
  `occurred_at` integer NOT NULL,
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
  FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
  CONSTRAINT `merchant_admin_events_request_hash_valid` CHECK(length(`request_hash`) = 64 and `request_hash` not glob '*[^0-9a-f]*'),
  CONSTRAINT `merchant_admin_events_details_valid` CHECK(json_valid(`details_json`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_admin_events_idempotency_uq` ON `merchant_admin_events` (`organization_id`, `actor_id`, `action`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX `merchant_admin_events_merchant_time_idx` ON `merchant_admin_events` (`merchant_id`, `occurred_at`);
--> statement-breakpoint
CREATE TRIGGER `merchant_admin_events_require_current_mutation` BEFORE INSERT ON `merchant_admin_events`
WHEN (SELECT `last_admin_event_id` FROM `merchants` WHERE `id` = NEW.`merchant_id`) IS NOT NEW.`id`
BEGIN SELECT RAISE(ABORT, 'stale merchant administration mutation'); END;
--> statement-breakpoint
CREATE TABLE `marketplace_cache_versions` (
  `namespace` text PRIMARY KEY NOT NULL,
  `generation` text NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `marketplace_cache_versions_namespace_valid` CHECK(`namespace` = 'services'),
  CONSTRAINT `marketplace_cache_versions_generation_valid` CHECK(length(`generation`) = 64 and `generation` not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TRIGGER `merchant_admin_events_no_update` BEFORE UPDATE ON `merchant_admin_events` BEGIN SELECT RAISE(ABORT, 'merchant admin events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_admin_events_no_delete` BEFORE DELETE ON `merchant_admin_events` BEGIN SELECT RAISE(ABORT, 'merchant admin events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_manifests_no_update` BEFORE UPDATE ON `merchant_manifests` BEGIN SELECT RAISE(ABORT, 'merchant manifests are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_manifests_no_delete` BEFORE DELETE ON `merchant_manifests` BEGIN SELECT RAISE(ABORT, 'merchant manifests are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_catalogs_no_update` BEFORE UPDATE ON `merchant_catalogs` BEGIN SELECT RAISE(ABORT, 'merchant catalogs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_catalogs_no_delete` BEFORE DELETE ON `merchant_catalogs` BEGIN SELECT RAISE(ABORT, 'merchant catalogs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_verifications_no_update` BEFORE UPDATE ON `merchant_verifications` BEGIN SELECT RAISE(ABORT, 'merchant verifications are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `merchant_verifications_no_delete` BEFORE DELETE ON `merchant_verifications` BEGIN SELECT RAISE(ABORT, 'merchant verifications are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `service_versions_no_update` BEFORE UPDATE ON `service_versions` BEGIN SELECT RAISE(ABORT, 'service versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `service_versions_no_delete` BEFORE DELETE ON `service_versions` BEGIN SELECT RAISE(ABORT, 'service versions are immutable'); END;
