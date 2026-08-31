CREATE TABLE `merchant_payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`checkout_session_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`service_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`receipt` text NOT NULL,
	`provider_order_id` text,
	`provider_payment_id` text,
	`provider_refund_id` text,
	`amount_subunits` integer NOT NULL,
	`currency` text NOT NULL,
	`checkout_hash` text NOT NULL,
	`closed_payment_mandate_hash` text NOT NULL,
	`notes` text NOT NULL,
	`status` text NOT NULL,
	`order_status` text,
	`payment_status` text,
	`fulfilment_eligible` integer DEFAULT 0 NOT NULL,
	`failure_code` text,
	`provider_order_snapshot` text,
	`provider_payment_snapshot` text,
	`completed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`checkout_session_id`) REFERENCES `merchant_checkout_sessions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT `merchant_payment_orders_id_valid` CHECK(length(`id`) = 30 and `id` glob 'mpo_*'),
	CONSTRAINT `merchant_payment_orders_transaction_valid` CHECK(length(`transaction_id`) = 30 and `transaction_id` glob 'ctx_*'),
	CONSTRAINT `merchant_payment_orders_attempt_valid` CHECK(`attempt_number` between 1 and 10),
	CONSTRAINT `merchant_payment_orders_receipt_valid` CHECK(length(`receipt`) between 1 and 40 and `receipt` not glob '*[^A-Za-z0-9_-]*'),
	CONSTRAINT `merchant_payment_orders_amount_valid` CHECK(`amount_subunits` >= 100),
	CONSTRAINT `merchant_payment_orders_currency_valid` CHECK(`currency` = 'INR'),
	CONSTRAINT `merchant_payment_orders_hashes_valid` CHECK(length(`checkout_hash`) = 64 and `checkout_hash` not glob '*[^0-9a-f]*' and length(`closed_payment_mandate_hash`) = 64 and `closed_payment_mandate_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT `merchant_payment_orders_notes_valid` CHECK(json_valid(`notes`) and json_type(`notes`) = 'object'),
	CONSTRAINT `merchant_payment_orders_status_valid` CHECK(`status` in ('CREATING', 'CREATED', 'PENDING', 'RECONCILING', 'FAILED', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED')),
	CONSTRAINT `merchant_payment_orders_provider_order_valid` CHECK((`provider_order_id` is null and `status` in ('CREATING', 'FAILED')) or `provider_order_id` glob 'order_*'),
	CONSTRAINT `merchant_payment_orders_provider_refund_valid` CHECK(`provider_refund_id` is null or `provider_refund_id` glob 'rfnd_*'),
	CONSTRAINT `merchant_payment_orders_eligibility_valid` CHECK(`fulfilment_eligible` = 0 or (`status` = 'CAPTURED' and `order_status` = 'paid' and `payment_status` = 'captured')),
	CONSTRAINT `merchant_payment_orders_time_valid` CHECK(`updated_at` >= `created_at` and `retention_expires_at` > `created_at` and (`completed_at` is null or `completed_at` between `created_at` and `updated_at`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_orders_transaction_attempt_uq` ON `merchant_payment_orders` (`transaction_id`,`attempt_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_orders_receipt_uq` ON `merchant_payment_orders` (`receipt`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_orders_provider_order_uq` ON `merchant_payment_orders` (`provider_order_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_orders_provider_payment_uq` ON `merchant_payment_orders` (`provider_payment_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_orders_provider_refund_uq` ON `merchant_payment_orders` (`provider_refund_id`);
--> statement-breakpoint
CREATE INDEX `merchant_payment_orders_checkout_idx` ON `merchant_payment_orders` (`checkout_session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `merchant_payment_orders_status_idx` ON `merchant_payment_orders` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `merchant_payment_callbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_order_id` text NOT NULL,
	`provider_payment_id` text NOT NULL,
	`signature_hash` text NOT NULL,
	`verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_order_id`) REFERENCES `merchant_payment_orders`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT `merchant_payment_callbacks_id_valid` CHECK(length(`id`) = 30 and `id` glob 'pcb_*'),
	CONSTRAINT `merchant_payment_callbacks_payment_valid` CHECK(`provider_payment_id` glob 'pay_*'),
	CONSTRAINT `merchant_payment_callbacks_hash_valid` CHECK(length(`signature_hash`) = 64 and `signature_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT `merchant_payment_callbacks_time_valid` CHECK(`created_at` = `verified_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_callbacks_order_payment_uq` ON `merchant_payment_callbacks` (`payment_order_id`,`provider_payment_id`);
--> statement-breakpoint
CREATE TABLE `merchant_provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_event_id` text NOT NULL,
	`payment_order_id` text,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`raw_payload_r2_key` text NOT NULL,
	`processing_status` text DEFAULT 'VERIFIED' NOT NULL,
	`processing_attempts` integer DEFAULT 0 NOT NULL,
	`failure_code` text,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_order_id`) REFERENCES `merchant_payment_orders`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT `merchant_provider_events_id_valid` CHECK(length(`id`) = 30 and `id` glob 'rpe_*'),
	CONSTRAINT `merchant_provider_events_reference_valid` CHECK(length(`provider_event_id`) between 3 and 128 and length(`raw_payload_r2_key`) between 3 and 1024),
	CONSTRAINT `merchant_provider_events_type_valid` CHECK(`event_type` in ('order.paid', 'payment.captured', 'payment.failed', 'refund.created', 'refund.failed', 'refund.processed')),
	CONSTRAINT `merchant_provider_events_hash_valid` CHECK(length(`payload_hash`) = 64 and `payload_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT `merchant_provider_events_status_valid` CHECK(`processing_status` in ('VERIFIED', 'PROCESSED', 'REJECTED')),
	CONSTRAINT `merchant_provider_events_attempts_valid` CHECK(`processing_attempts` between 0 and 100),
	CONSTRAINT `merchant_provider_events_time_valid` CHECK(`created_at` = `received_at` and `retention_expires_at` > `received_at` and (`processed_at` is null or `processed_at` >= `received_at`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_provider_events_provider_event_uq` ON `merchant_provider_events` (`provider_event_id`);
--> statement-breakpoint
CREATE INDEX `merchant_provider_events_processing_idx` ON `merchant_provider_events` (`processing_status`,`received_at`);
--> statement-breakpoint
CREATE TABLE `merchant_payment_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`payment_order_id` text NOT NULL,
	`event_type` text NOT NULL,
	`nonce` text NOT NULL,
	`kid` text NOT NULL,
	`event` text NOT NULL,
	`signature` text NOT NULL,
	`payload_hash` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_order_id`) REFERENCES `merchant_payment_orders`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT `merchant_payment_events_id_valid` CHECK(length(`event_id`) = 30 and `event_id` glob 'evt_*'),
	CONSTRAINT `merchant_payment_events_type_valid` CHECK(`event_type` in ('ORDER_PAID', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED')),
	CONSTRAINT `merchant_payment_events_json_valid` CHECK(json_valid(`event`) and json_valid(`signature`)),
	CONSTRAINT `merchant_payment_events_hash_valid` CHECK(length(`payload_hash`) = 64 and `payload_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT `merchant_payment_events_time_valid` CHECK(`created_at` = `occurred_at` and `expires_at` > `occurred_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_payment_events_nonce_uq` ON `merchant_payment_events` (`nonce`);
--> statement-breakpoint
CREATE INDEX `merchant_payment_events_order_idx` ON `merchant_payment_events` (`payment_order_id`,`occurred_at`);
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_orders_identity_immutable`
BEFORE UPDATE ON `merchant_payment_orders`
WHEN NEW.id IS NOT OLD.id
  OR NEW.checkout_session_id IS NOT OLD.checkout_session_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.mandate_id IS NOT OLD.mandate_id
  OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.service_id IS NOT OLD.service_id
  OR NEW.attempt_number IS NOT OLD.attempt_number
  OR NEW.receipt IS NOT OLD.receipt
  OR NEW.amount_subunits IS NOT OLD.amount_subunits
  OR NEW.currency IS NOT OLD.currency
  OR NEW.checkout_hash IS NOT OLD.checkout_hash
  OR NEW.closed_payment_mandate_hash IS NOT OLD.closed_payment_mandate_hash
  OR NEW.notes IS NOT OLD.notes
  OR NEW.retention_expires_at IS NOT OLD.retention_expires_at
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
	SELECT RAISE(ABORT, 'payment order identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_orders_transition_guard`
BEFORE UPDATE OF `status` ON `merchant_payment_orders`
WHEN NEW.status IS NOT OLD.status AND NOT (
  (OLD.status = 'CREATING' AND NEW.status IN ('CREATED', 'PENDING', 'FAILED', 'RECONCILING')) OR
  (OLD.status = 'CREATED' AND NEW.status IN ('PENDING', 'RECONCILING', 'FAILED')) OR
  (OLD.status = 'PENDING' AND NEW.status IN ('RECONCILING', 'FAILED', 'CAPTURED')) OR
  (OLD.status = 'RECONCILING' AND NEW.status IN ('FAILED', 'CAPTURED')) OR
  (OLD.status = 'FAILED' AND NEW.status IN ('RECONCILING', 'CAPTURED')) OR
  (OLD.status = 'CAPTURED' AND NEW.status = 'REFUND_PENDING') OR
  (OLD.status = 'REFUND_PENDING' AND NEW.status IN ('CAPTURED', 'REFUNDED'))
)
BEGIN
	SELECT RAISE(ABORT, 'illegal payment order transition');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_orders_provider_ids_once`
BEFORE UPDATE ON `merchant_payment_orders`
WHEN (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS NOT OLD.provider_order_id)
  OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS NOT OLD.provider_payment_id)
  OR (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS NOT OLD.provider_refund_id)
BEGIN
	SELECT RAISE(ABORT, 'provider identifiers cannot change');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_callbacks_immutable`
BEFORE UPDATE ON `merchant_payment_callbacks`
BEGIN
	SELECT RAISE(ABORT, 'verified payment callbacks are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_callbacks_retain`
BEFORE DELETE ON `merchant_payment_callbacks`
BEGIN
	SELECT RAISE(ABORT, 'verified payment callbacks are retained');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_events_immutable`
BEFORE UPDATE ON `merchant_payment_events`
BEGIN
	SELECT RAISE(ABORT, 'signed payment events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_payment_events_retain`
BEFORE DELETE ON `merchant_payment_events`
BEGIN
	SELECT RAISE(ABORT, 'signed payment events are retained');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_provider_events_identity_immutable`
BEFORE UPDATE ON `merchant_provider_events`
WHEN NEW.id IS NOT OLD.id
  OR NEW.provider_event_id IS NOT OLD.provider_event_id
  OR NEW.event_type IS NOT OLD.event_type
  OR NEW.payload_hash IS NOT OLD.payload_hash
  OR NEW.raw_payload_r2_key IS NOT OLD.raw_payload_r2_key
  OR NEW.received_at IS NOT OLD.received_at
  OR NEW.retention_expires_at IS NOT OLD.retention_expires_at
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
	SELECT RAISE(ABORT, 'provider event identity is immutable');
END;
