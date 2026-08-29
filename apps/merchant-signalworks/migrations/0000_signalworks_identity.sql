CREATE TABLE `merchant_identity` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text NOT NULL,
	`domain` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "merchant_identity_id_valid" CHECK("merchant_identity"."id" = 'merchant_signalworks'),
	CONSTRAINT "merchant_identity_name_valid" CHECK(length(trim("merchant_identity"."name")) between 2 and 120),
	CONSTRAINT "merchant_identity_legal_name_valid" CHECK(length(trim("merchant_identity"."legal_name")) between 2 and 160),
	CONSTRAINT "merchant_identity_domain_valid" CHECK("merchant_identity"."domain" = lower("merchant_identity"."domain") and length("merchant_identity"."domain") between 4 and 253),
	CONSTRAINT "merchant_identity_status_valid" CHECK("merchant_identity"."status" in ('ACTIVE', 'SUSPENDED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_identity_domain_uq` ON `merchant_identity` (`domain`);
--> statement-breakpoint
CREATE TABLE `merchant_signing_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`kid` text NOT NULL,
	`purpose` text NOT NULL,
	`public_jwk` text NOT NULL,
	`encrypted_private_jwk` text NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_until` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_identity`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "merchant_signing_keys_id_valid" CHECK(length(trim("merchant_signing_keys"."id")) between 8 and 160),
	CONSTRAINT "merchant_signing_keys_kid_valid" CHECK(length("merchant_signing_keys"."kid") between 1 and 128 and "merchant_signing_keys"."kid" not glob '*[^A-Za-z0-9._:-]*'),
	CONSTRAINT "merchant_signing_keys_purpose_valid" CHECK("merchant_signing_keys"."purpose" in ('catalog', 'checkout', 'event', 'manifest')),
	CONSTRAINT "merchant_signing_keys_public_jwk_valid" CHECK(
		json_valid("merchant_signing_keys"."public_jwk") and
		json_extract("merchant_signing_keys"."public_jwk", '$.kty') = 'EC' and
		json_extract("merchant_signing_keys"."public_jwk", '$.crv') = 'P-256' and
		json_type("merchant_signing_keys"."public_jwk", '$.d') is null
	),
	CONSTRAINT "merchant_signing_keys_private_envelope_valid" CHECK(
		json_valid("merchant_signing_keys"."encrypted_private_jwk") and
		json_extract("merchant_signing_keys"."encrypted_private_jwk", '$.version') = 1 and
		json_extract("merchant_signing_keys"."encrypted_private_jwk", '$.algorithm') = 'A256GCM'
	),
	CONSTRAINT "merchant_signing_keys_validity_window_valid" CHECK("merchant_signing_keys"."valid_until" is null or "merchant_signing_keys"."valid_until" > "merchant_signing_keys"."valid_from"),
	CONSTRAINT "merchant_signing_keys_revocation_valid" CHECK("merchant_signing_keys"."revoked_at" is null or "merchant_signing_keys"."revoked_at" >= "merchant_signing_keys"."valid_from"),
	CONSTRAINT "merchant_signing_keys_created_at_valid" CHECK("merchant_signing_keys"."created_at" <= "merchant_signing_keys"."valid_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_signing_keys_merchant_kid_uq` ON `merchant_signing_keys` (`merchant_id`,`kid`);
--> statement-breakpoint
CREATE INDEX `merchant_signing_keys_active_purpose_idx` ON `merchant_signing_keys` (`merchant_id`,`purpose`,`valid_from`);
