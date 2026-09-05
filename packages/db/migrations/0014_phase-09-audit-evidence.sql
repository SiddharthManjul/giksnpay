CREATE TABLE `evidence_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`status` text DEFAULT 'READY' NOT NULL,
	`schema_version` text NOT NULL,
	`bundle_json` text NOT NULL,
	`bundle_hash` text NOT NULL,
	`signature_json` text NOT NULL,
	`signing_kid` text NOT NULL,
	`private_storage_key` text NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "evidence_bundles_id_valid" CHECK("evidence_bundles"."id" glob 'evd_*' and length("evidence_bundles"."id") = 30),
	CONSTRAINT "evidence_bundles_status_valid" CHECK("evidence_bundles"."status" in ('READY', 'INVALID')),
	CONSTRAINT "evidence_bundles_schema_valid" CHECK("evidence_bundles"."schema_version" = 'mindpay.evidence.1'),
	CONSTRAINT "evidence_bundles_json_valid" CHECK(json_valid("evidence_bundles"."bundle_json") and json_type("evidence_bundles"."bundle_json") = 'object' and json_valid("evidence_bundles"."signature_json") and json_type("evidence_bundles"."signature_json") = 'object'),
	CONSTRAINT "evidence_bundles_hash_valid" CHECK(length("evidence_bundles"."bundle_hash") = 64 and "evidence_bundles"."bundle_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "evidence_bundles_signing_kid_valid" CHECK(length("evidence_bundles"."signing_kid") between 1 and 128 and "evidence_bundles"."signing_kid" not glob '*[^A-Za-z0-9._:-]*'),
	CONSTRAINT "evidence_bundles_storage_key_valid" CHECK(length(trim("evidence_bundles"."private_storage_key")) between 8 and 1024),
	CONSTRAINT "evidence_bundles_retention_valid" CHECK("evidence_bundles"."retention_expires_at" > "evidence_bundles"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_bundles_transaction_uq` ON `evidence_bundles` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_bundles_hash_uq` ON `evidence_bundles` (`bundle_hash`);--> statement-breakpoint
CREATE INDEX `evidence_bundles_organization_created_idx` ON `evidence_bundles` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `evidence_bundles_retention_idx` ON `evidence_bundles` (`retention_expires_at`);
--> statement-breakpoint
CREATE TRIGGER evidence_bundles_require_terminal_transaction
BEFORE INSERT ON evidence_bundles
WHEN NOT EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.id = NEW.transaction_id
    AND t.organization_id = NEW.organization_id
    AND t.state IN ('BLOCKED', 'PAYMENT_FAILED', 'FULFILLED', 'EVIDENCE_READY')
)
BEGIN
  SELECT RAISE(ABORT, 'evidence requires a terminal transaction');
END;
--> statement-breakpoint
CREATE TRIGGER evidence_bundles_no_update
BEFORE UPDATE ON evidence_bundles
BEGIN
  SELECT RAISE(ABORT, 'evidence bundles are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER evidence_bundles_no_delete
BEFORE DELETE ON evidence_bundles
BEGIN
  SELECT RAISE(ABORT, 'evidence bundles are retained');
END;
