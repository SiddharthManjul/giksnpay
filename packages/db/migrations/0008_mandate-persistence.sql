CREATE TABLE `consumed_nonces` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`mandate_id` text,
	`transaction_id` text,
	`source` text NOT NULL,
	`scope` text NOT NULL,
	`nonce` text NOT NULL,
	`payload_hash` text NOT NULL,
	`consumed_at` integer NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "consumed_nonces_id_valid" CHECK("consumed_nonces"."id" glob 'rpn_*' and length("consumed_nonces"."id") = 30),
	CONSTRAINT "consumed_nonces_source_valid" CHECK("consumed_nonces"."source" in ('OPEN_MANDATE', 'CLOSED_MANDATE', 'TRANSACTION_APPROVAL', 'MERCHANT_EVENT')),
	CONSTRAINT "consumed_nonces_scope_valid" CHECK(length(trim("consumed_nonces"."scope")) between 1 and 128),
	CONSTRAINT "consumed_nonces_nonce_valid" CHECK(length("consumed_nonces"."nonce") between 8 and 512),
	CONSTRAINT "consumed_nonces_payload_hash_valid" CHECK(length("consumed_nonces"."payload_hash") = 64 and "consumed_nonces"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "consumed_nonces_time_order_valid" CHECK(
        "consumed_nonces"."consumed_at" >= "consumed_nonces"."created_at" and
        "consumed_nonces"."retention_expires_at" > "consumed_nonces"."consumed_at"
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consumed_nonces_organization_scope_nonce_uq` ON `consumed_nonces` (`organization_id`,`scope`,`nonce`);--> statement-breakpoint
CREATE INDEX `consumed_nonces_retention_expires_at_idx` ON `consumed_nonces` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `mandate_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`proof_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`proof_hash` text NOT NULL,
	`proof_json` text NOT NULL,
	`key_id` text,
	`verified_at` integer NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "mandate_proofs_id_valid" CHECK("mandate_proofs"."id" glob 'mpr_*' and length("mandate_proofs"."id") = 30),
	CONSTRAINT "mandate_proofs_type_valid" CHECK("mandate_proofs"."proof_type" in ('WEBAUTHN_ASSERTION', 'PLATFORM_JWS', 'AGENT_JWS')),
	CONSTRAINT "mandate_proofs_payload_hash_valid" CHECK(length("mandate_proofs"."payload_hash") = 64 and "mandate_proofs"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mandate_proofs_proof_hash_valid" CHECK(length("mandate_proofs"."proof_hash") = 64 and "mandate_proofs"."proof_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mandate_proofs_json_valid" CHECK(json_valid("mandate_proofs"."proof_json") and json_type("mandate_proofs"."proof_json") = 'object'),
	CONSTRAINT "mandate_proofs_time_order_valid" CHECK(
        "mandate_proofs"."verified_at" >= "mandate_proofs"."created_at" and
        "mandate_proofs"."retention_expires_at" > "mandate_proofs"."verified_at"
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mandate_proofs_logical_uq` ON `mandate_proofs` (`mandate_id`,`proof_type`,`payload_hash`,`proof_hash`);--> statement-breakpoint
CREATE INDEX `mandate_proofs_organization_mandate_idx` ON `mandate_proofs` (`organization_id`,`mandate_id`);--> statement-breakpoint
CREATE INDEX `mandate_proofs_retention_expires_at_idx` ON `mandate_proofs` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `mandates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`schema_version` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`currency` text,
	`max_transaction_subunits` integer,
	`budget_subunits` integer,
	`approval_threshold_subunits` integer,
	`spent_subunits` integer DEFAULT 0 NOT NULL,
	`reserved_subunits` integer DEFAULT 0 NOT NULL,
	`max_transactions` integer,
	`completed_transactions` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer,
	`allowed_rails_json` text NOT NULL,
	`allowed_merchants_json` text NOT NULL,
	`allowed_categories_json` text NOT NULL,
	`allowed_services_json` text NOT NULL,
	`line_item_constraints_json` text,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`activated_at` integer,
	`terminal_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "mandates_id_valid" CHECK("mandates"."id" glob 'mnd_*' and length("mandates"."id") = 30),
	CONSTRAINT "mandates_kind_valid" CHECK("mandates"."kind" in ('CHECKOUT', 'PAYMENT')),
	CONSTRAINT "mandates_status_valid" CHECK("mandates"."status" in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXHAUSTED', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "mandates_schema_kind_valid" CHECK(
        ("mandates"."kind" = 'CHECKOUT' and "mandates"."schema_version" = 'mindpay.mandate.checkout.open.1') or
        ("mandates"."kind" = 'PAYMENT' and "mandates"."schema_version" = 'mindpay.mandate.payment.open.1')
      ),
	CONSTRAINT "mandates_payload_json_valid" CHECK(json_valid("mandates"."payload_json") and json_type("mandates"."payload_json") = 'object'),
	CONSTRAINT "mandates_payload_hash_valid" CHECK(length("mandates"."payload_hash") = 64 and "mandates"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mandates_nonce_valid" CHECK(length("mandates"."nonce") between 8 and 512),
	CONSTRAINT "mandates_constraint_json_valid" CHECK(
        json_valid("mandates"."allowed_rails_json") and json_type("mandates"."allowed_rails_json") = 'array' and
        json_valid("mandates"."allowed_merchants_json") and json_type("mandates"."allowed_merchants_json") = 'array' and
        json_valid("mandates"."allowed_categories_json") and json_type("mandates"."allowed_categories_json") = 'array' and
        json_valid("mandates"."allowed_services_json") and json_type("mandates"."allowed_services_json") = 'array' and
        ("mandates"."line_item_constraints_json" is null or
          (json_valid("mandates"."line_item_constraints_json") and json_type("mandates"."line_item_constraints_json") = 'object'))
      ),
	CONSTRAINT "mandates_payment_bounds_valid" CHECK(
        (
          "mandates"."kind" = 'CHECKOUT' and "mandates"."currency" is null and
          "mandates"."max_transaction_subunits" is null and "mandates"."budget_subunits" is null and
          "mandates"."approval_threshold_subunits" is null and "mandates"."max_transactions" is null and
          "mandates"."max_attempts" is null and "mandates"."spent_subunits" = 0 and
          "mandates"."reserved_subunits" = 0 and "mandates"."completed_transactions" = 0 and
          "mandates"."line_item_constraints_json" is not null and
          json_array_length("mandates"."allowed_rails_json") = 0 and
          json_array_length("mandates"."allowed_merchants_json") between 1 and 100 and
          json_array_length("mandates"."allowed_categories_json") between 1 and 100 and
          json_array_length("mandates"."allowed_services_json") between 1 and 500
        ) or (
          "mandates"."kind" = 'PAYMENT' and
          "mandates"."currency" is not null and "mandates"."max_transaction_subunits" is not null and
          "mandates"."budget_subunits" is not null and "mandates"."approval_threshold_subunits" is not null and
          "mandates"."max_transactions" is not null and "mandates"."max_attempts" is not null and
          "mandates"."currency" = 'INR' and
          "mandates"."max_transaction_subunits" >= 0 and
          "mandates"."approval_threshold_subunits" between 0 and "mandates"."max_transaction_subunits" and
          "mandates"."max_transaction_subunits" <= "mandates"."budget_subunits" and
          "mandates"."spent_subunits" >= 0 and "mandates"."reserved_subunits" >= 0 and
          "mandates"."spent_subunits" + "mandates"."reserved_subunits" <= "mandates"."budget_subunits" and
          "mandates"."max_transactions" between 1 and 1000 and
          "mandates"."completed_transactions" between 0 and "mandates"."max_transactions" and
          "mandates"."max_attempts" between 1 and 10 and "mandates"."line_item_constraints_json" is null and
          json_array_length("mandates"."allowed_rails_json") between 1 and 10 and
          json_array_length("mandates"."allowed_merchants_json") between 1 and 100 and
          json_array_length("mandates"."allowed_categories_json") = 0 and
          json_array_length("mandates"."allowed_services_json") = 0
        )
      ),
	CONSTRAINT "mandates_lifecycle_valid" CHECK(
        ("mandates"."status" = 'DRAFT' and "mandates"."activated_at" is null and "mandates"."terminal_at" is null) or
        ("mandates"."status" in ('ACTIVE', 'SUSPENDED') and "mandates"."activated_at" is not null and "mandates"."terminal_at" is null) or
        ("mandates"."status" in ('EXHAUSTED', 'EXPIRED', 'REVOKED') and "mandates"."activated_at" is not null and "mandates"."terminal_at" is not null)
      ),
	CONSTRAINT "mandates_time_order_valid" CHECK(
        "mandates"."starts_at" >= "mandates"."created_at" and "mandates"."expires_at" > "mandates"."starts_at" and
        "mandates"."updated_at" >= "mandates"."created_at" and "mandates"."retention_expires_at" >= "mandates"."expires_at" and
        ("mandates"."activated_at" is null or "mandates"."activated_at" between "mandates"."created_at" and "mandates"."updated_at") and
        ("mandates"."terminal_at" is null or "mandates"."terminal_at" between "mandates"."activated_at" and "mandates"."updated_at")
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mandates_organization_nonce_uq` ON `mandates` (`organization_id`,`nonce`);--> statement-breakpoint
CREATE UNIQUE INDEX `mandates_id_organization_uq` ON `mandates` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `mandates_organization_user_status_idx` ON `mandates` (`organization_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `mandates_retention_expires_at_idx` ON `mandates` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `payment_attempts` (
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
	`failure_code` text,
	`completed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "payment_attempts_id_valid" CHECK("payment_attempts"."id" glob 'pat_*' and length("payment_attempts"."id") = 30),
	CONSTRAINT "payment_attempts_number_valid" CHECK("payment_attempts"."attempt_number" between 1 and 10),
	CONSTRAINT "payment_attempts_amount_valid" CHECK("payment_attempts"."amount_subunits" > 0),
	CONSTRAINT "payment_attempts_currency_valid" CHECK("payment_attempts"."currency" = 'INR'),
	CONSTRAINT "payment_attempts_provider_valid" CHECK("payment_attempts"."provider" = 'RAZORPAY'),
	CONSTRAINT "payment_attempts_status_valid" CHECK("payment_attempts"."status" in ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "payment_attempts_checkout_hash_valid" CHECK(length("payment_attempts"."checkout_hash") = 64 and "payment_attempts"."checkout_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "payment_attempts_terminal_valid" CHECK(
        ("payment_attempts"."status" in ('CREATED', 'PENDING') and "payment_attempts"."completed_at" is null and "payment_attempts"."failure_code" is null) or
        ("payment_attempts"."status" = 'SUCCEEDED' and "payment_attempts"."completed_at" is not null and "payment_attempts"."failure_code" is null) or
        ("payment_attempts"."status" in ('FAILED', 'CANCELLED') and "payment_attempts"."completed_at" is not null and "payment_attempts"."failure_code" is not null)
      ),
	CONSTRAINT "payment_attempts_time_order_valid" CHECK(
        "payment_attempts"."updated_at" >= "payment_attempts"."created_at" and
        ("payment_attempts"."completed_at" is null or "payment_attempts"."completed_at" between "payment_attempts"."created_at" and "payment_attempts"."updated_at") and
        "payment_attempts"."retention_expires_at" > "payment_attempts"."created_at"
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_transaction_number_uq` ON `payment_attempts` (`transaction_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_provider_order_uq` ON `payment_attempts` (`provider`,`provider_order_id`);--> statement-breakpoint
CREATE INDEX `payment_attempts_retention_expires_at_idx` ON `payment_attempts` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`payment_attempt_id` text,
	`provider` text DEFAULT 'RAZORPAY' NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`raw_payload_r2_key` text NOT NULL,
	`signature_verified` integer NOT NULL,
	`processing_status` text DEFAULT 'RECEIVED' NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`payment_attempt_id`) REFERENCES `payment_attempts`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "provider_events_id_valid" CHECK("provider_events"."id" glob 'pev_*' and length("provider_events"."id") = 30),
	CONSTRAINT "provider_events_provider_valid" CHECK("provider_events"."provider" = 'RAZORPAY'),
	CONSTRAINT "provider_events_reference_valid" CHECK(
        length(trim("provider_events"."provider_event_id")) between 3 and 128 and
        length(trim("provider_events"."event_type")) between 3 and 128 and
        length(trim("provider_events"."raw_payload_r2_key")) between 3 and 1024
      ),
	CONSTRAINT "provider_events_payload_hash_valid" CHECK(length("provider_events"."payload_hash") = 64 and "provider_events"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "provider_events_signature_verified_valid" CHECK("provider_events"."signature_verified" in (0, 1)),
	CONSTRAINT "provider_events_processing_status_valid" CHECK("provider_events"."processing_status" in ('RECEIVED', 'VERIFIED', 'PROCESSED', 'REJECTED')),
	CONSTRAINT "provider_events_processing_time_valid" CHECK(
        ("provider_events"."processing_status" in ('RECEIVED', 'VERIFIED') and "provider_events"."processed_at" is null) or
        ("provider_events"."processing_status" in ('PROCESSED', 'REJECTED') and "provider_events"."processed_at" is not null and "provider_events"."processed_at" >= "provider_events"."received_at")
      ),
	CONSTRAINT "provider_events_retention_valid" CHECK(
        "provider_events"."received_at" = "provider_events"."created_at" and
        "provider_events"."retention_expires_at" > "provider_events"."received_at"
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_events_provider_event_uq` ON `provider_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `provider_events_transaction_received_idx` ON `provider_events` (`transaction_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `provider_events_retention_expires_at_idx` ON `provider_events` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `spend_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`amount_subunits` integer NOT NULL,
	`status` text DEFAULT 'RESERVED' NOT NULL,
	`expires_at` integer NOT NULL,
	`closed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "spend_reservations_id_valid" CHECK("spend_reservations"."id" glob 'rsv_*' and length("spend_reservations"."id") = 30),
	CONSTRAINT "spend_reservations_amount_valid" CHECK("spend_reservations"."amount_subunits" > 0),
	CONSTRAINT "spend_reservations_status_valid" CHECK("spend_reservations"."status" in ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED')),
	CONSTRAINT "spend_reservations_lifecycle_valid" CHECK(
        ("spend_reservations"."status" = 'RESERVED' and "spend_reservations"."closed_at" is null) or
        ("spend_reservations"."status" != 'RESERVED' and "spend_reservations"."closed_at" is not null and "spend_reservations"."closed_at" >= "spend_reservations"."created_at")
      ),
	CONSTRAINT "spend_reservations_time_order_valid" CHECK(
        "spend_reservations"."expires_at" > "spend_reservations"."created_at" and "spend_reservations"."updated_at" >= "spend_reservations"."created_at" and
        "spend_reservations"."retention_expires_at" >= "spend_reservations"."expires_at"
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spend_reservations_transaction_uq` ON `spend_reservations` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `spend_reservations_mandate_status_idx` ON `spend_reservations` (`mandate_id`,`status`);--> statement-breakpoint
CREATE INDEX `spend_reservations_retention_expires_at_idx` ON `spend_reservations` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `transaction_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`user_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`proof_hash` text NOT NULL,
	`proof_json` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`approved_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`challenge_id`) REFERENCES `approval_challenges`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`credential_id`) REFERENCES `passkey_credentials`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "transaction_approvals_id_valid" CHECK("transaction_approvals"."id" glob 'tap_*' and length("transaction_approvals"."id") = 30),
	CONSTRAINT "transaction_approvals_status_valid" CHECK("transaction_approvals"."status" in ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "transaction_approvals_payload_hash_valid" CHECK(length("transaction_approvals"."payload_hash") = 64 and "transaction_approvals"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "transaction_approvals_proof_hash_valid" CHECK(length("transaction_approvals"."proof_hash") = 64 and "transaction_approvals"."proof_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "transaction_approvals_proof_json_valid" CHECK(json_valid("transaction_approvals"."proof_json")),
	CONSTRAINT "transaction_approvals_time_order_valid" CHECK(
        "transaction_approvals"."approved_at" >= "transaction_approvals"."created_at" and "transaction_approvals"."expires_at" > "transaction_approvals"."approved_at" and
        "transaction_approvals"."retention_expires_at" >= "transaction_approvals"."expires_at"
      ),
	CONSTRAINT "transaction_approvals_consumption_valid" CHECK(
        ("transaction_approvals"."status" = 'CONSUMED' and "transaction_approvals"."consumed_at" is not null and "transaction_approvals"."consumed_at" >= "transaction_approvals"."approved_at") or
        ("transaction_approvals"."status" != 'CONSUMED' and "transaction_approvals"."consumed_at" is null)
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_approvals_active_logical_uq` ON `transaction_approvals` (`organization_id`,`transaction_id`,`payload_hash`) WHERE "transaction_approvals"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_approvals_challenge_uq` ON `transaction_approvals` (`challenge_id`);--> statement-breakpoint
CREATE INDEX `transaction_approvals_retention_expires_at_idx` ON `transaction_approvals` (`retention_expires_at`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`service_version_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`state` text DEFAULT 'DRAFT' NOT NULL,
	`risk_decision` text,
	`risk_score` integer,
	`policy_decision_json` text,
	`amount_subunits` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`request_id` text NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`service_version_id`) REFERENCES `service_versions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "transactions_id_valid" CHECK("transactions"."id" glob 'ctx_*' and length("transactions"."id") = 30),
	CONSTRAINT "transactions_state_valid" CHECK("transactions"."state" in ('DRAFT', 'DISCOVERING', 'OFFER_SELECTED', 'VERIFYING', 'POLICY_REVIEW', 'BLOCKED', 'APPROVAL_REQUIRED', 'APPROVED', 'BUDGET_RESERVED', 'CHECKOUT_CREATED', 'ORDER_CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'CALLBACK_VERIFIED', 'PAYMENT_RECONCILING', 'PAYMENT_CAPTURED', 'ENTITLEMENT_ISSUED', 'FULFILLING', 'FULFILMENT_FAILED', 'FULFILLED', 'EVIDENCE_READY', 'EXPIRED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED')),
	CONSTRAINT "transactions_amount_valid" CHECK("transactions"."amount_subunits" >= 0),
	CONSTRAINT "transactions_currency_valid" CHECK("transactions"."currency" = 'INR'),
	CONSTRAINT "transactions_request_id_valid" CHECK(length(trim("transactions"."request_id")) between 8 and 128),
	CONSTRAINT "transactions_risk_score_valid" CHECK("transactions"."risk_score" is null or "transactions"."risk_score" between 0 and 100),
	CONSTRAINT "transactions_policy_json_valid" CHECK("transactions"."policy_decision_json" is null or (json_valid("transactions"."policy_decision_json") and json_type("transactions"."policy_decision_json") = 'object')),
	CONSTRAINT "transactions_retention_valid" CHECK("transactions"."updated_at" >= "transactions"."created_at" and "transactions"."retention_expires_at" > "transactions"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_organization_request_uq` ON `transactions` (`organization_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_id_organization_uq` ON `transactions` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `transactions_organization_user_state_idx` ON `transactions` (`organization_id`,`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `transactions_retention_expires_at_idx` ON `transactions` (`retention_expires_at`);
--> statement-breakpoint
CREATE TRIGGER mandates_require_tenant_binding
BEFORE INSERT ON mandates
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id
) OR NOT EXISTS (
  SELECT 1 FROM agents
  WHERE id = NEW.agent_id AND organization_id = NEW.organization_id
) OR NOT EXISTS (
  SELECT 1 FROM agent_versions
  WHERE id = NEW.agent_version_id AND agent_id = NEW.agent_id
)
BEGIN
  SELECT RAISE(ABORT, 'mandate tenant binding is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER mandates_identity_immutable
BEFORE UPDATE ON mandates
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.agent_version_id IS NOT OLD.agent_version_id
  OR NEW.kind IS NOT OLD.kind
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.payload_json IS NOT OLD.payload_json
  OR NEW.payload_hash IS NOT OLD.payload_hash
  OR NEW.nonce IS NOT OLD.nonce
  OR NEW.currency IS NOT OLD.currency
  OR NEW.max_transaction_subunits IS NOT OLD.max_transaction_subunits
  OR NEW.budget_subunits IS NOT OLD.budget_subunits
  OR NEW.approval_threshold_subunits IS NOT OLD.approval_threshold_subunits
  OR NEW.max_transactions IS NOT OLD.max_transactions
  OR NEW.max_attempts IS NOT OLD.max_attempts
  OR NEW.allowed_rails_json IS NOT OLD.allowed_rails_json
  OR NEW.allowed_merchants_json IS NOT OLD.allowed_merchants_json
  OR NEW.allowed_categories_json IS NOT OLD.allowed_categories_json
  OR NEW.allowed_services_json IS NOT OLD.allowed_services_json
  OR NEW.line_item_constraints_json IS NOT OLD.line_item_constraints_json
  OR NEW.starts_at IS NOT OLD.starts_at
  OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'mandate identity and constraints are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER mandates_retention_guard
BEFORE DELETE ON mandates
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'mandate retention period has not expired');
END;
--> statement-breakpoint
CREATE TRIGGER mandate_proofs_require_tenant_binding
BEFORE INSERT ON mandate_proofs
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mandates
  WHERE id = NEW.mandate_id AND organization_id = NEW.organization_id
)
BEGIN
  SELECT RAISE(ABORT, 'mandate proof tenant binding is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER mandate_proofs_no_update
BEFORE UPDATE ON mandate_proofs
BEGIN
  SELECT RAISE(ABORT, 'mandate proofs are immutable evidence');
END;
--> statement-breakpoint
CREATE TRIGGER mandate_proofs_retention_guard
BEFORE DELETE ON mandate_proofs
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'mandate proof retention period has not expired');
END;
--> statement-breakpoint
CREATE TRIGGER transactions_require_tenant_binding
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id
) OR NOT EXISTS (
  SELECT 1 FROM mandates
  WHERE id = NEW.mandate_id
    AND organization_id = NEW.organization_id
    AND user_id = NEW.user_id
    AND agent_id = NEW.agent_id
    AND agent_version_id = NEW.agent_version_id
    AND kind = 'PAYMENT'
) OR NOT EXISTS (
  SELECT 1 FROM service_versions
  INNER JOIN services ON services.id = service_versions.service_id
  WHERE service_versions.id = NEW.service_version_id
    AND services.merchant_id = NEW.merchant_id
)
BEGIN
  SELECT RAISE(ABORT, 'transaction tenant or commerce binding is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER transactions_identity_immutable
BEFORE UPDATE ON transactions
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.agent_version_id IS NOT OLD.agent_version_id
  OR NEW.merchant_id IS NOT OLD.merchant_id
  OR NEW.service_version_id IS NOT OLD.service_version_id
  OR NEW.mandate_id IS NOT OLD.mandate_id
  OR NEW.amount_subunits IS NOT OLD.amount_subunits
  OR NEW.currency IS NOT OLD.currency
  OR NEW.request_id IS NOT OLD.request_id
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'transaction identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER transactions_retention_guard
BEFORE DELETE ON transactions
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'transaction retention period has not expired');
END;
--> statement-breakpoint
CREATE TRIGGER transaction_approvals_require_tenant_binding
BEFORE INSERT ON transaction_approvals
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM transactions
  WHERE id = NEW.transaction_id
    AND organization_id = NEW.organization_id
    AND mandate_id = NEW.mandate_id
    AND user_id = NEW.user_id
) OR NOT EXISTS (
  SELECT 1 FROM approval_challenges
  WHERE id = NEW.challenge_id
    AND organization_id = NEW.organization_id
    AND user_id = NEW.user_id
    AND transaction_id = NEW.transaction_id
    AND purpose = 'TRANSACTION_STEP_UP'
    AND state = 'CONSUMED'
    AND payload_hash = NEW.payload_hash
) OR NOT EXISTS (
  SELECT 1 FROM passkey_credentials
  WHERE id = NEW.credential_id AND user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'transaction approval tenant or proof binding is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER transaction_approvals_identity_immutable
BEFORE UPDATE ON transaction_approvals
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.mandate_id IS NOT OLD.mandate_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.challenge_id IS NOT OLD.challenge_id
  OR NEW.credential_id IS NOT OLD.credential_id
  OR NEW.payload_hash IS NOT OLD.payload_hash
  OR NEW.proof_hash IS NOT OLD.proof_hash
  OR NEW.proof_json IS NOT OLD.proof_json
  OR NEW.approved_at IS NOT OLD.approved_at
  OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'transaction approval identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER transaction_approvals_retention_guard
BEFORE DELETE ON transaction_approvals
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'transaction approval retention period has not expired');
END;
--> statement-breakpoint
CREATE TRIGGER consumed_nonces_require_tenant_binding
BEFORE INSERT ON consumed_nonces
FOR EACH ROW
WHEN (NEW.mandate_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM mandates
  WHERE id = NEW.mandate_id AND organization_id = NEW.organization_id
)) OR (NEW.transaction_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM transactions
  WHERE id = NEW.transaction_id AND organization_id = NEW.organization_id
))
BEGIN
  SELECT RAISE(ABORT, 'consumed nonce tenant binding is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER consumed_nonces_no_update
BEFORE UPDATE ON consumed_nonces
BEGIN
  SELECT RAISE(ABORT, 'consumed nonces are immutable evidence');
END;
--> statement-breakpoint
CREATE TRIGGER consumed_nonces_retention_guard
BEFORE DELETE ON consumed_nonces
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'consumed nonce retention period has not expired');
END;
--> statement-breakpoint
CREATE TRIGGER spend_reservations_require_tenant_binding
BEFORE INSERT ON spend_reservations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM transactions
  WHERE id = NEW.transaction_id
    AND organization_id = NEW.organization_id
    AND mandate_id = NEW.mandate_id
    AND amount_subunits = NEW.amount_subunits
) OR NOT EXISTS (
  SELECT 1 FROM mandates
  WHERE id = NEW.mandate_id
    AND organization_id = NEW.organization_id
    AND kind = 'PAYMENT'
)
BEGIN
  SELECT RAISE(ABORT, 'spend reservation tenant or amount binding is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER spend_reservations_identity_immutable
BEFORE UPDATE ON spend_reservations
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.mandate_id IS NOT OLD.mandate_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.amount_subunits IS NOT OLD.amount_subunits
  OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'spend reservation identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER spend_reservations_retention_guard
BEFORE DELETE ON spend_reservations
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'spend reservation retention period has not expired');
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
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
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'payment attempt identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER payment_attempts_retention_guard
BEFORE DELETE ON payment_attempts
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'payment attempt retention period has not expired');
END;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TRIGGER provider_events_identity_immutable
BEFORE UPDATE ON provider_events
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.payment_attempt_id IS NOT OLD.payment_attempt_id
  OR NEW.provider IS NOT OLD.provider
  OR NEW.provider_event_id IS NOT OLD.provider_event_id
  OR NEW.event_type IS NOT OLD.event_type
  OR NEW.payload_hash IS NOT OLD.payload_hash
  OR NEW.raw_payload_r2_key IS NOT OLD.raw_payload_r2_key
  OR NEW.signature_verified IS NOT OLD.signature_verified
  OR NEW.received_at IS NOT OLD.received_at
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.retention_expires_at < OLD.retention_expires_at
BEGIN
  SELECT RAISE(ABORT, 'provider event identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER provider_events_retention_guard
BEFORE DELETE ON provider_events
FOR EACH ROW
WHEN OLD.retention_expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
BEGIN
  SELECT RAISE(ABORT, 'provider event retention period has not expired');
END;
