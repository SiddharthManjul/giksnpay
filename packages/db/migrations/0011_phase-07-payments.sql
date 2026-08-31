DROP INDEX `spend_reservations_transaction_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `spend_reservations_active_transaction_uq` ON `spend_reservations` (`transaction_id`) WHERE "spend_reservations"."status" = 'RESERVED';--> statement-breakpoint
DROP TRIGGER `provider_events_require_tenant_binding`;--> statement-breakpoint
DROP TRIGGER `payment_attempts_require_tenant_binding`;--> statement-breakpoint
DROP TRIGGER `payment_attempts_identity_immutable`;--> statement-breakpoint
DROP TRIGGER `payment_attempts_retention_guard`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`amount_subunits` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`status` text DEFAULT 'CREATED' NOT NULL,
	`checkout_hash` text NOT NULL,
	`provider` text DEFAULT 'RAZORPAY' NOT NULL,
	`provider_order_id` text,
	`provider_payment_id` text,
	`receipt` text,
	`callback_verified_at` integer,
	`order_status` text,
	`payment_status` text,
	`fulfilment_eligible` integer DEFAULT false NOT NULL,
	`provider_snapshot_json` text,
	`failure_code` text,
	`completed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "payment_attempts_id_valid" CHECK("__new_payment_attempts"."id" glob 'pat_*' and length("__new_payment_attempts"."id") = 30),
	CONSTRAINT "payment_attempts_number_valid" CHECK("__new_payment_attempts"."attempt_number" between 1 and 10),
	CONSTRAINT "payment_attempts_amount_valid" CHECK("__new_payment_attempts"."amount_subunits" > 0),
	CONSTRAINT "payment_attempts_currency_valid" CHECK("__new_payment_attempts"."currency" = 'INR'),
	CONSTRAINT "payment_attempts_provider_valid" CHECK("__new_payment_attempts"."provider" = 'RAZORPAY'),
	CONSTRAINT "payment_attempts_provider_references_valid" CHECK(
        ("__new_payment_attempts"."provider_order_id" is null or "__new_payment_attempts"."provider_order_id" glob 'order_*') and
        ("__new_payment_attempts"."provider_payment_id" is null or "__new_payment_attempts"."provider_payment_id" glob 'pay_*') and
        ("__new_payment_attempts"."receipt" is null or (length("__new_payment_attempts"."receipt") between 1 and 40 and "__new_payment_attempts"."receipt" not glob '*[^A-Za-z0-9_-]*'))
      ),
	CONSTRAINT "payment_attempts_provider_status_valid" CHECK(
        ("__new_payment_attempts"."order_status" is null or "__new_payment_attempts"."order_status" in ('created', 'attempted', 'paid')) and
        ("__new_payment_attempts"."payment_status" is null or "__new_payment_attempts"."payment_status" in ('created', 'authorized', 'captured', 'refunded', 'failed'))
      ),
	CONSTRAINT "payment_attempts_eligibility_valid" CHECK("__new_payment_attempts"."fulfilment_eligible" = 0 or ("__new_payment_attempts"."status" = 'SUCCEEDED' and "__new_payment_attempts"."order_status" = 'paid' and "__new_payment_attempts"."payment_status" = 'captured')),
	CONSTRAINT "payment_attempts_provider_snapshot_valid" CHECK("__new_payment_attempts"."provider_snapshot_json" is null or (json_valid("__new_payment_attempts"."provider_snapshot_json") and json_type("__new_payment_attempts"."provider_snapshot_json") = 'object')),
	CONSTRAINT "payment_attempts_status_valid" CHECK("__new_payment_attempts"."status" in ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "payment_attempts_checkout_hash_valid" CHECK(length("__new_payment_attempts"."checkout_hash") = 64 and "__new_payment_attempts"."checkout_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "payment_attempts_terminal_valid" CHECK(
        ("__new_payment_attempts"."status" in ('CREATED', 'PENDING') and "__new_payment_attempts"."completed_at" is null and "__new_payment_attempts"."failure_code" is null) or
        ("__new_payment_attempts"."status" = 'SUCCEEDED' and "__new_payment_attempts"."completed_at" is not null and "__new_payment_attempts"."failure_code" is null) or
        ("__new_payment_attempts"."status" in ('FAILED', 'CANCELLED') and "__new_payment_attempts"."completed_at" is not null and "__new_payment_attempts"."failure_code" is not null)
      ),
	CONSTRAINT "payment_attempts_time_order_valid" CHECK(
        "__new_payment_attempts"."updated_at" >= "__new_payment_attempts"."created_at" and
        ("__new_payment_attempts"."completed_at" is null or "__new_payment_attempts"."completed_at" between "__new_payment_attempts"."created_at" and "__new_payment_attempts"."updated_at") and
        "__new_payment_attempts"."retention_expires_at" > "__new_payment_attempts"."created_at"
      )
);
--> statement-breakpoint
INSERT INTO `__new_payment_attempts`("id", "organization_id", "transaction_id", "mandate_id", "attempt_number", "amount_subunits", "currency", "status", "checkout_hash", "provider", "provider_order_id", "failure_code", "completed_at", "retention_expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "transaction_id", "mandate_id", "attempt_number", "amount_subunits", "currency", "status", "checkout_hash", "provider", "provider_order_id", "failure_code", "completed_at", "retention_expires_at", "created_at", "updated_at" FROM `payment_attempts`;--> statement-breakpoint
DROP TABLE `payment_attempts`;--> statement-breakpoint
ALTER TABLE `__new_payment_attempts` RENAME TO `payment_attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_transaction_number_uq` ON `payment_attempts` (`transaction_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_provider_order_uq` ON `payment_attempts` (`provider`,`provider_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_provider_payment_uq` ON `payment_attempts` (`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payment_attempts_retention_expires_at_idx` ON `payment_attempts` (`retention_expires_at`);--> statement-breakpoint
CREATE TRIGGER payment_attempts_require_tenant_binding
BEFORE INSERT ON payment_attempts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM transactions
  WHERE id = NEW.transaction_id
    AND organization_id = NEW.organization_id
    AND mandate_id = NEW.mandate_id
    AND amount_subunits = NEW.amount_subunits
    AND currency = NEW.currency
) OR NOT EXISTS (
  SELECT 1 FROM mandates
  WHERE id = NEW.mandate_id
    AND organization_id = NEW.organization_id
    AND kind = 'PAYMENT'
    AND NEW.attempt_number <= max_attempts
)
BEGIN
  SELECT RAISE(ABORT, 'payment attempt tenant, amount, or limit binding is invalid');
END;--> statement-breakpoint
CREATE TRIGGER payment_attempts_identity_immutable
BEFORE UPDATE ON payment_attempts
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.mandate_id IS NOT OLD.mandate_id
  OR NEW.attempt_number IS NOT OLD.attempt_number
  OR NEW.amount_subunits IS NOT OLD.amount_subunits
  OR NEW.currency IS NOT OLD.currency
  OR NEW.checkout_hash IS NOT OLD.checkout_hash
  OR NEW.provider IS NOT OLD.provider
  OR (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS NOT OLD.provider_order_id)
  OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS NOT OLD.provider_payment_id)
  OR (OLD.receipt IS NOT NULL AND NEW.receipt IS NOT OLD.receipt)
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'payment attempt identity is immutable');
END;--> statement-breakpoint
CREATE TRIGGER payment_attempts_retention_guard
BEFORE DELETE ON payment_attempts
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'payment attempt retention period has not expired');
END;--> statement-breakpoint
CREATE TRIGGER provider_events_require_tenant_binding
BEFORE INSERT ON provider_events
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM transactions
  WHERE id = NEW.transaction_id AND organization_id = NEW.organization_id
) OR (NEW.payment_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM payment_attempts
  WHERE id = NEW.payment_attempt_id
    AND transaction_id = NEW.transaction_id
    AND organization_id = NEW.organization_id
))
BEGIN
  SELECT RAISE(ABORT, 'provider event tenant binding is invalid');
END;
