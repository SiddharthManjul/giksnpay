CREATE TABLE `merchant_entitlement_redemptions` (
  `entitlement_id` text PRIMARY KEY NOT NULL,
  `payment_order_id` text NOT NULL,
  `transaction_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `service_id` text NOT NULL,
  `issuer` text NOT NULL,
  `audience` text NOT NULL,
  `token_hash` text NOT NULL,
  `issued_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `consumed_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`payment_order_id`) REFERENCES `merchant_payment_orders`(`id`) ON UPDATE cascade ON DELETE restrict,
  CONSTRAINT `merchant_entitlement_redemptions_id_valid` CHECK(length(`entitlement_id`) = 30 and `entitlement_id` glob 'ent_*'),
  CONSTRAINT `merchant_entitlement_redemptions_transaction_valid` CHECK(length(`transaction_id`) = 30 and `transaction_id` glob 'ctx_*'),
  CONSTRAINT `merchant_entitlement_redemptions_agent_valid` CHECK(length(`agent_id`) = 30 and `agent_id` glob 'agt_*'),
  CONSTRAINT `merchant_entitlement_redemptions_service_valid` CHECK(`service_id` in ('market_snapshot', 'detailed_competitor_dossier')),
  CONSTRAINT `merchant_entitlement_redemptions_origins_valid` CHECK(`issuer` = 'https://api.mindpay.example/' and `audience` = 'https://merchant-demo.example.com/'),
  CONSTRAINT `merchant_entitlement_redemptions_hash_valid` CHECK(length(`token_hash`) = 64 and `token_hash` not glob '*[^0-9a-f]*'),
  CONSTRAINT `merchant_entitlement_redemptions_time_valid` CHECK(`created_at` = `consumed_at` and `consumed_at` >= `issued_at` and `consumed_at` < `expires_at` and `expires_at` <= `issued_at` + 86400000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_entitlement_redemptions_token_hash_uq` ON `merchant_entitlement_redemptions` (`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_entitlement_redemptions_transaction_uq` ON `merchant_entitlement_redemptions` (`transaction_id`);
--> statement-breakpoint
CREATE TABLE `merchant_fulfilments` (
  `id` text PRIMARY KEY NOT NULL,
  `entitlement_id` text NOT NULL,
  `transaction_id` text NOT NULL,
  `service_id` text NOT NULL,
  `state` text DEFAULT 'RUNNING' NOT NULL,
  `generation_attempts` integer DEFAULT 0 NOT NULL,
  `input_hash` text NOT NULL,
  `result_json` text,
  `output_hash` text,
  `delivery_receipt_id` text,
  `receipt_json` text,
  `receipt_signature_json` text,
  `failure_code` text,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`entitlement_id`) REFERENCES `merchant_entitlement_redemptions`(`entitlement_id`) ON UPDATE cascade ON DELETE restrict,
  CONSTRAINT `merchant_fulfilments_id_valid` CHECK(length(`id`) = 30 and `id` glob 'ful_*'),
  CONSTRAINT `merchant_fulfilments_transaction_valid` CHECK(length(`transaction_id`) = 30 and `transaction_id` glob 'ctx_*'),
  CONSTRAINT `merchant_fulfilments_service_valid` CHECK(`service_id` in ('market_snapshot', 'detailed_competitor_dossier')),
  CONSTRAINT `merchant_fulfilments_state_valid` CHECK(`state` in ('RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT `merchant_fulfilments_attempts_valid` CHECK(`generation_attempts` between 0 and 2),
  CONSTRAINT `merchant_fulfilments_input_hash_valid` CHECK(length(`input_hash`) = 64 and `input_hash` not glob '*[^0-9a-f]*'),
  CONSTRAINT `merchant_fulfilments_output_hash_valid` CHECK(`output_hash` is null or (length(`output_hash`) = 64 and `output_hash` not glob '*[^0-9a-f]*')),
  CONSTRAINT `merchant_fulfilments_json_valid` CHECK((`result_json` is null or json_valid(`result_json`)) and (`receipt_json` is null or json_valid(`receipt_json`)) and (`receipt_signature_json` is null or json_valid(`receipt_signature_json`))),
  CONSTRAINT `merchant_fulfilments_terminal_valid` CHECK(
    (`state` = 'RUNNING' and `result_json` is null and `output_hash` is null and `delivery_receipt_id` is null and `receipt_json` is null and `receipt_signature_json` is null and `failure_code` is null and `completed_at` is null) or
    (`state` = 'COMPLETED' and `generation_attempts` between 1 and 2 and `result_json` is not null and `output_hash` is not null and `delivery_receipt_id` is not null and `receipt_json` is not null and `receipt_signature_json` is not null and `failure_code` is null and `completed_at` is not null) or
    (`state` = 'FAILED' and `generation_attempts` = 2 and `result_json` is null and `output_hash` is null and `delivery_receipt_id` is null and `receipt_json` is null and `receipt_signature_json` is null and length(`failure_code`) between 3 and 64 and `completed_at` is not null)
  ),
  CONSTRAINT `merchant_fulfilments_time_valid` CHECK(`created_at` = `started_at` and `updated_at` >= `started_at` and (`completed_at` is null or `completed_at` between `started_at` and `updated_at`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_fulfilments_entitlement_uq` ON `merchant_fulfilments` (`entitlement_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_fulfilments_transaction_uq` ON `merchant_fulfilments` (`transaction_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_fulfilments_receipt_uq` ON `merchant_fulfilments` (`delivery_receipt_id`);
--> statement-breakpoint
CREATE TRIGGER `merchant_entitlement_redemptions_require_payment`
BEFORE INSERT ON `merchant_entitlement_redemptions`
WHEN NOT EXISTS (
  SELECT 1 FROM `merchant_payment_orders` p
  WHERE p.id = NEW.payment_order_id
    AND p.transaction_id = NEW.transaction_id
    AND p.agent_id = NEW.agent_id
    AND p.service_id = NEW.service_id
    AND p.status = 'CAPTURED'
    AND p.order_status = 'paid'
    AND p.payment_status = 'captured'
    AND p.fulfilment_eligible = 1
)
BEGIN
  SELECT RAISE(ABORT, 'entitlement redemption requires captured and paid merchant truth');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_entitlement_redemptions_immutable`
BEFORE UPDATE ON `merchant_entitlement_redemptions`
BEGIN
  SELECT RAISE(ABORT, 'entitlement redemptions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_entitlement_redemptions_retain`
BEFORE DELETE ON `merchant_entitlement_redemptions`
BEGIN
  SELECT RAISE(ABORT, 'entitlement redemptions are retained');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_fulfilments_require_binding`
BEFORE INSERT ON `merchant_fulfilments`
WHEN NOT EXISTS (
  SELECT 1 FROM `merchant_entitlement_redemptions` r
  WHERE r.entitlement_id = NEW.entitlement_id
    AND r.transaction_id = NEW.transaction_id
    AND r.service_id = NEW.service_id
)
BEGIN
  SELECT RAISE(ABORT, 'fulfilment does not match its consumed entitlement');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_fulfilments_identity_immutable`
BEFORE UPDATE ON `merchant_fulfilments`
WHEN NEW.id IS NOT OLD.id
  OR NEW.entitlement_id IS NOT OLD.entitlement_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.service_id IS NOT OLD.service_id
  OR NEW.input_hash IS NOT OLD.input_hash
  OR NEW.started_at IS NOT OLD.started_at
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'fulfilment identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_fulfilments_transition_guard`
BEFORE UPDATE OF `state` ON `merchant_fulfilments`
WHEN NEW.state IS NOT OLD.state AND NOT (OLD.state = 'RUNNING' AND NEW.state IN ('COMPLETED', 'FAILED'))
BEGIN
  SELECT RAISE(ABORT, 'illegal fulfilment transition');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_fulfilments_terminal_no_update`
BEFORE UPDATE ON `merchant_fulfilments`
WHEN OLD.state IN ('COMPLETED', 'FAILED')
BEGIN
  SELECT RAISE(ABORT, 'terminal fulfilments are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_fulfilments_retain`
BEFORE DELETE ON `merchant_fulfilments`
BEGIN
  SELECT RAISE(ABORT, 'fulfilments are retained');
END;
