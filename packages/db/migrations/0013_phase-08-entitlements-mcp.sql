CREATE TABLE `entitlement_deliveries` (
	`entitlement_id` text PRIMARY KEY NOT NULL,
	`encrypted_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "entitlement_deliveries_ciphertext_valid" CHECK(json_valid("entitlement_deliveries"."encrypted_token") and json_extract("entitlement_deliveries"."encrypted_token", '$.algorithm') = 'A256GCM'),
	CONSTRAINT "entitlement_deliveries_expiry_valid" CHECK("entitlement_deliveries"."expires_at" > "entitlement_deliveries"."created_at")
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`service_version_id` text NOT NULL,
	`signing_kid` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes_json` text NOT NULL,
	`status` text DEFAULT 'ISSUED' NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`redeemed_at` integer,
	`retention_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`service_version_id`) REFERENCES `service_versions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "entitlements_id_valid" CHECK("entitlements"."id" glob 'ent_*' and length("entitlements"."id") = 30),
	CONSTRAINT "entitlements_token_hash_valid" CHECK(length("entitlements"."token_hash") = 64 and "entitlements"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "entitlements_scopes_valid" CHECK(json_valid("entitlements"."scopes_json") and json_array_length("entitlements"."scopes_json") = 1 and json_extract("entitlements"."scopes_json", '$[0]') = 'service:redeem'),
	CONSTRAINT "entitlements_status_valid" CHECK("entitlements"."status" in ('ISSUED', 'REDEEMED', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "entitlements_lifecycle_valid" CHECK("entitlements"."created_at" = "entitlements"."issued_at" and "entitlements"."expires_at" > "entitlements"."issued_at" and "entitlements"."expires_at" <= "entitlements"."issued_at" + 86400000 and "entitlements"."retention_expires_at" >= "entitlements"."expires_at" and (("entitlements"."status" = 'REDEEMED' and "entitlements"."redeemed_at" is not null and "entitlements"."redeemed_at" >= "entitlements"."issued_at") or ("entitlements"."status" != 'REDEEMED' and "entitlements"."redeemed_at" is null)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_transaction_uq` ON `entitlements` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_token_hash_uq` ON `entitlements` (`token_hash`);--> statement-breakpoint
CREATE INDEX `entitlements_organization_status_idx` ON `entitlements` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `fulfilment_results` (
	`id` text PRIMARY KEY NOT NULL,
	`entitlement_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`delivery_receipt_id` text NOT NULL,
	`service_id` text NOT NULL,
	`result_json` text NOT NULL,
	`output_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`receipt_signature_json` text NOT NULL,
	`completed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "fulfilment_results_id_valid" CHECK("fulfilment_results"."id" glob 'gfr_*' and length("fulfilment_results"."id") = 30),
	CONSTRAINT "fulfilment_results_service_valid" CHECK(length(trim("fulfilment_results"."service_id")) between 3 and 96),
	CONSTRAINT "fulfilment_results_json_valid" CHECK(json_valid("fulfilment_results"."result_json") and json_valid("fulfilment_results"."receipt_json") and json_valid("fulfilment_results"."receipt_signature_json")),
	CONSTRAINT "fulfilment_results_output_hash_valid" CHECK(length("fulfilment_results"."output_hash") = 64 and "fulfilment_results"."output_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "fulfilment_results_time_valid" CHECK("fulfilment_results"."created_at" = "fulfilment_results"."completed_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fulfilment_results_entitlement_uq` ON `fulfilment_results` (`entitlement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fulfilment_results_transaction_uq` ON `fulfilment_results` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fulfilment_results_receipt_uq` ON `fulfilment_results` (`delivery_receipt_id`);--> statement-breakpoint
CREATE TABLE `mcp_rate_limits` (
	`subject_hash` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`subject_hash`, `window_started_at`),
	CONSTRAINT "mcp_rate_limits_subject_valid" CHECK(length("mcp_rate_limits"."subject_hash") = 64 and "mcp_rate_limits"."subject_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mcp_rate_limits_count_valid" CHECK("mcp_rate_limits"."request_count" between 1 and 100000),
	CONSTRAINT "mcp_rate_limits_time_valid" CHECK("mcp_rate_limits"."expires_at" > "mcp_rate_limits"."window_started_at")
);
--> statement-breakpoint
CREATE INDEX `mcp_rate_limits_expiry_idx` ON `mcp_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_tool_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input_hash` text NOT NULL,
	`output_hash` text,
	`outcome` text NOT NULL,
	`error_code` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "mcp_tool_invocations_id_valid" CHECK("mcp_tool_invocations"."id" glob 'mci_*' and length("mcp_tool_invocations"."id") = 30),
	CONSTRAINT "mcp_tool_invocations_tool_valid" CHECK("mcp_tool_invocations"."tool_name" in ('search_verified_services', 'get_verified_service', 'request_signed_offer', 'propose_purchase', 'get_transaction_status', 'get_evidence_bundle')),
	CONSTRAINT "mcp_tool_invocations_input_hash_valid" CHECK(length("mcp_tool_invocations"."input_hash") = 64 and "mcp_tool_invocations"."input_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mcp_tool_invocations_output_hash_valid" CHECK("mcp_tool_invocations"."output_hash" is null or (length("mcp_tool_invocations"."output_hash") = 64 and "mcp_tool_invocations"."output_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "mcp_tool_invocations_outcome_valid" CHECK("mcp_tool_invocations"."outcome" in ('SUCCEEDED', 'FAILED', 'RATE_LIMITED')),
	CONSTRAINT "mcp_tool_invocations_result_valid" CHECK(("mcp_tool_invocations"."outcome" = 'SUCCEEDED' and "mcp_tool_invocations"."output_hash" is not null and "mcp_tool_invocations"."error_code" is null) or ("mcp_tool_invocations"."outcome" != 'SUCCEEDED' and "mcp_tool_invocations"."output_hash" is null and length("mcp_tool_invocations"."error_code") between 3 and 64))
);
--> statement-breakpoint
CREATE INDEX `mcp_tool_invocations_organization_time_idx` ON `mcp_tool_invocations` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `platform_signing_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`kid` text NOT NULL,
	`purpose` text NOT NULL,
	`public_jwk` text NOT NULL,
	`encrypted_private_jwk` text NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_until` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "platform_signing_keys_id_valid" CHECK(length("platform_signing_keys"."id") between 8 and 160),
	CONSTRAINT "platform_signing_keys_kid_valid" CHECK(length("platform_signing_keys"."kid") between 1 and 128 and "platform_signing_keys"."kid" not glob '*[^A-Za-z0-9._:-]*'),
	CONSTRAINT "platform_signing_keys_purpose_valid" CHECK("platform_signing_keys"."purpose" = 'entitlement'),
	CONSTRAINT "platform_signing_keys_public_jwk_valid" CHECK(json_valid("platform_signing_keys"."public_jwk") and json_extract("platform_signing_keys"."public_jwk", '$.kty') = 'EC' and json_extract("platform_signing_keys"."public_jwk", '$.crv') = 'P-256' and json_type("platform_signing_keys"."public_jwk", '$.d') is null),
	CONSTRAINT "platform_signing_keys_private_valid" CHECK(json_valid("platform_signing_keys"."encrypted_private_jwk") and json_extract("platform_signing_keys"."encrypted_private_jwk", '$.algorithm') = 'A256GCM'),
	CONSTRAINT "platform_signing_keys_lifecycle_valid" CHECK("platform_signing_keys"."created_at" <= "platform_signing_keys"."valid_from" and ("platform_signing_keys"."valid_until" is null or "platform_signing_keys"."valid_until" > "platform_signing_keys"."valid_from") and ("platform_signing_keys"."revoked_at" is null or "platform_signing_keys"."revoked_at" >= "platform_signing_keys"."valid_from"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_signing_keys_kid_uq` ON `platform_signing_keys` (`kid`);--> statement-breakpoint
CREATE INDEX `platform_signing_keys_active_idx` ON `platform_signing_keys` (`purpose`,`valid_from`);
--> statement-breakpoint
CREATE TRIGGER platform_signing_keys_identity_immutable
BEFORE UPDATE ON platform_signing_keys
WHEN NEW.id IS NOT OLD.id
  OR NEW.kid IS NOT OLD.kid
  OR NEW.purpose IS NOT OLD.purpose
  OR NEW.public_jwk IS NOT OLD.public_jwk
  OR NEW.encrypted_private_jwk IS NOT OLD.encrypted_private_jwk
  OR NEW.valid_from IS NOT OLD.valid_from
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'platform signing-key identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER entitlements_require_transaction_binding
BEFORE INSERT ON entitlements
WHEN NOT EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.id = NEW.transaction_id
    AND t.organization_id = NEW.organization_id
    AND t.user_id = NEW.user_id
    AND t.agent_id = NEW.agent_id
    AND t.merchant_id = NEW.merchant_id
    AND t.service_version_id = NEW.service_version_id
    AND t.state = 'PAYMENT_CAPTURED'
) OR NOT EXISTS (
  SELECT 1 FROM payment_attempts p
  WHERE p.transaction_id = NEW.transaction_id
    AND p.status = 'SUCCEEDED'
    AND p.order_status = 'paid'
    AND p.payment_status = 'captured'
    AND p.fulfilment_eligible = 1
    AND p.amount_subunits = (SELECT amount_subunits FROM transactions WHERE id = NEW.transaction_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entitlement requires exact reconciled payment truth');
END;
--> statement-breakpoint
CREATE TRIGGER entitlements_identity_immutable
BEFORE UPDATE ON entitlements
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.merchant_id IS NOT OLD.merchant_id
  OR NEW.service_version_id IS NOT OLD.service_version_id
  OR NEW.signing_kid IS NOT OLD.signing_kid
  OR NEW.token_hash IS NOT OLD.token_hash
  OR NEW.scopes_json IS NOT OLD.scopes_json
  OR NEW.issued_at IS NOT OLD.issued_at
  OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.retention_expires_at IS NOT OLD.retention_expires_at
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'entitlement identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER entitlements_transition_guard
BEFORE UPDATE OF status ON entitlements
WHEN NEW.status IS NOT OLD.status AND NOT (
  OLD.status = 'ISSUED' AND NEW.status IN ('REDEEMED', 'EXPIRED', 'REVOKED')
)
BEGIN
  SELECT RAISE(ABORT, 'illegal entitlement transition');
END;
--> statement-breakpoint
CREATE TRIGGER entitlements_no_delete
BEFORE DELETE ON entitlements
BEGIN
  SELECT RAISE(ABORT, 'entitlements are retained');
END;
--> statement-breakpoint
CREATE TRIGGER entitlement_deliveries_no_update
BEFORE UPDATE ON entitlement_deliveries
BEGIN
  SELECT RAISE(ABORT, 'encrypted entitlement delivery is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER fulfilment_results_require_binding
BEFORE INSERT ON fulfilment_results
WHEN NOT EXISTS (
  SELECT 1 FROM entitlements e
  JOIN transactions t ON t.id = e.transaction_id
  JOIN service_versions sv ON sv.id = e.service_version_id
  JOIN services s ON s.id = sv.service_id
  WHERE e.id = NEW.entitlement_id
    AND e.transaction_id = NEW.transaction_id
    AND e.status = 'ISSUED'
    AND t.state = 'ENTITLEMENT_ISSUED'
    AND s.external_id = NEW.service_id
)
BEGIN
  SELECT RAISE(ABORT, 'fulfilment result does not match its entitlement');
END;
--> statement-breakpoint
CREATE TRIGGER fulfilment_results_no_update
BEFORE UPDATE ON fulfilment_results
BEGIN
  SELECT RAISE(ABORT, 'verified fulfilment results are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER fulfilment_results_no_delete
BEFORE DELETE ON fulfilment_results
BEGIN
  SELECT RAISE(ABORT, 'verified fulfilment results are retained');
END;
--> statement-breakpoint
CREATE TRIGGER mcp_tool_invocations_require_binding
BEFORE INSERT ON mcp_tool_invocations
WHEN NOT EXISTS (
  SELECT 1 FROM agents a
  JOIN organization_members om ON om.organization_id = a.organization_id
  WHERE a.id = NEW.agent_id
    AND a.organization_id = NEW.organization_id
    AND om.user_id = NEW.user_id
    AND a.status = 'ACTIVE'
)
BEGIN
  SELECT RAISE(ABORT, 'MCP invocation tenant binding failed');
END;
--> statement-breakpoint
CREATE TRIGGER mcp_tool_invocations_no_update
BEFORE UPDATE ON mcp_tool_invocations
BEGIN
  SELECT RAISE(ABORT, 'MCP invocation audit is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER mcp_tool_invocations_no_delete
BEFORE DELETE ON mcp_tool_invocations
BEGIN
  SELECT RAISE(ABORT, 'MCP invocation audit is retained');
END;
