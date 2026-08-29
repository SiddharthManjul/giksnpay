CREATE TABLE `passkey_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`webauthn_user_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text NOT NULL,
	`aaguid` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "passkey_credentials_name_valid" CHECK("passkey_credentials"."name" is null or length(trim("passkey_credentials"."name")) between 1 and 64),
	CONSTRAINT "passkey_credentials_credential_id_valid" CHECK(length("passkey_credentials"."credential_id") between 1 and 1024),
	CONSTRAINT "passkey_credentials_public_key_valid" CHECK(length("passkey_credentials"."public_key") between 1 and 4096),
	CONSTRAINT "passkey_credentials_webauthn_user_id_valid" CHECK(length("passkey_credentials"."webauthn_user_id") between 1 and 128),
	CONSTRAINT "passkey_credentials_counter_valid" CHECK("passkey_credentials"."counter" >= 0),
	CONSTRAINT "passkey_credentials_device_type_valid" CHECK("passkey_credentials"."device_type" in ('singleDevice', 'multiDevice')),
	CONSTRAINT "passkey_credentials_transports_valid" CHECK(json_valid("passkey_credentials"."transports")),
	CONSTRAINT "passkey_credentials_aaguid_valid" CHECK(length("passkey_credentials"."aaguid") between 1 and 64),
	CONSTRAINT "passkey_credentials_updated_after_created" CHECK("passkey_credentials"."updated_at" >= "passkey_credentials"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credentials_credential_id_uq` ON `passkey_credentials` (`credential_id`);--> statement-breakpoint
CREATE INDEX `passkey_credentials_user_id_idx` ON `passkey_credentials` (`user_id`);--> statement-breakpoint
CREATE TABLE `passkey_registration_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`challenge_hash` text NOT NULL,
	`webauthn_user_id` text NOT NULL,
	`rp_id` text NOT NULL,
	`origin` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "passkey_registration_challenges_hash_valid" CHECK(length("passkey_registration_challenges"."challenge_hash") = 64 and "passkey_registration_challenges"."challenge_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "passkey_registration_challenges_webauthn_user_id_valid" CHECK(length("passkey_registration_challenges"."webauthn_user_id") between 1 and 128),
	CONSTRAINT "passkey_registration_challenges_rp_id_valid" CHECK(length("passkey_registration_challenges"."rp_id") between 1 and 253),
	CONSTRAINT "passkey_registration_challenges_origin_valid" CHECK(length("passkey_registration_challenges"."origin") between 8 and 2048),
	CONSTRAINT "passkey_registration_challenges_expires_after_created" CHECK("passkey_registration_challenges"."expires_at" > "passkey_registration_challenges"."created_at"),
	CONSTRAINT "passkey_registration_challenges_consumed_after_created" CHECK("passkey_registration_challenges"."consumed_at" is null or "passkey_registration_challenges"."consumed_at" >= "passkey_registration_challenges"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_registration_challenges_hash_uq` ON `passkey_registration_challenges` (`challenge_hash`);--> statement-breakpoint
CREATE INDEX `passkey_registration_challenges_session_idx` ON `passkey_registration_challenges` (`session_id`);--> statement-breakpoint
CREATE INDEX `passkey_registration_challenges_user_idx` ON `passkey_registration_challenges` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_registration_challenges_expires_at_idx` ON `passkey_registration_challenges` (`expires_at`);
