CREATE TABLE `agent_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`kid` text NOT NULL,
	`public_jwk` text NOT NULL,
	`encrypted_private_jwk` text NOT NULL,
	`valid_from` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "agent_keys_id_valid" CHECK("agent_keys"."id" glob 'aky_*' and length("agent_keys"."id") = 30),
	CONSTRAINT "agent_keys_kid_valid" CHECK(length("agent_keys"."kid") between 1 and 128),
	CONSTRAINT "agent_keys_public_jwk_valid" CHECK(
        json_valid("agent_keys"."public_jwk") and
        json_extract("agent_keys"."public_jwk", '$.kty') = 'EC' and
        json_extract("agent_keys"."public_jwk", '$.crv') = 'P-256' and
        length(json_extract("agent_keys"."public_jwk", '$.x')) = 43 and
        length(json_extract("agent_keys"."public_jwk", '$.y')) = 43 and
        json_type("agent_keys"."public_jwk", '$.d') is null
      ),
	CONSTRAINT "agent_keys_encrypted_private_jwk_valid" CHECK(
        json_valid("agent_keys"."encrypted_private_jwk") and
        json_extract("agent_keys"."encrypted_private_jwk", '$.algorithm') = 'A256GCM' and
        json_extract("agent_keys"."encrypted_private_jwk", '$.version') = 1 and
        length(json_extract("agent_keys"."encrypted_private_jwk", '$.iv')) between 16 and 64 and
        length(json_extract("agent_keys"."encrypted_private_jwk", '$.ciphertext')) between 32 and 4096
      ),
	CONSTRAINT "agent_keys_revocation_valid" CHECK("agent_keys"."revoked_at" is null or "agent_keys"."revoked_at" >= "agent_keys"."valid_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_keys_agent_kid_uq` ON `agent_keys` (`agent_id`,`kid`);--> statement-breakpoint
CREATE INDEX `agent_keys_active_idx` ON `agent_keys` (`agent_id`,`revoked_at`,`valid_from`);--> statement-breakpoint
CREATE TABLE `agent_version_tools` (
	`agent_version_id` text NOT NULL,
	`tool_version_id` text NOT NULL,
	`scope_json` text NOT NULL,
	PRIMARY KEY(`agent_version_id`, `tool_version_id`),
	FOREIGN KEY (`agent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "agent_version_tools_tool_version_valid" CHECK(length(trim("agent_version_tools"."tool_version_id")) between 1 and 128),
	CONSTRAINT "agent_version_tools_scope_valid" CHECK(json_valid("agent_version_tools"."scope_json"))
);
--> statement-breakpoint
CREATE TABLE `agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version` text NOT NULL,
	`model_provider` text NOT NULL,
	`model_name` text NOT NULL,
	`system_policy` text NOT NULL,
	`system_policy_hash` text NOT NULL,
	`specialization` text NOT NULL,
	`configuration_json` text NOT NULL,
	`verification_status` text DEFAULT 'NOT_RUN' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "agent_versions_id_valid" CHECK("agent_versions"."id" glob 'agv_*' and length("agent_versions"."id") = 30),
	CONSTRAINT "agent_versions_semantic_version_valid" CHECK(length("agent_versions"."version") between 5 and 64 and instr("agent_versions"."version", '.') > 0),
	CONSTRAINT "agent_versions_model_valid" CHECK(length(trim("agent_versions"."model_provider")) between 1 and 128 and length(trim("agent_versions"."model_name")) between 1 and 128),
	CONSTRAINT "agent_versions_policy_valid" CHECK(length(trim("agent_versions"."system_policy")) between 20 and 20000),
	CONSTRAINT "agent_versions_policy_hash_valid" CHECK(length("agent_versions"."system_policy_hash") = 64 and "agent_versions"."system_policy_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_versions_specialization_valid" CHECK(length(trim("agent_versions"."specialization")) between 2 and 160),
	CONSTRAINT "agent_versions_configuration_valid" CHECK(json_valid("agent_versions"."configuration_json")),
	CONSTRAINT "agent_versions_verification_status_valid" CHECK("agent_versions"."verification_status" in ('NOT_RUN', 'PASSED', 'FAILED')),
	CONSTRAINT "agent_versions_publication_valid" CHECK("agent_versions"."published_at" is null or "agent_versions"."published_at" >= "agent_versions"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_versions_agent_version_uq` ON `agent_versions` (`agent_id`,`version`);--> statement-breakpoint
CREATE INDEX `agent_versions_agent_created_idx` ON `agent_versions` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`current_version_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "agents_id_valid" CHECK("agents"."id" glob 'agt_*' and length("agents"."id") = 30),
	CONSTRAINT "agents_name_valid" CHECK(length(trim("agents"."name")) between 2 and 120),
	CONSTRAINT "agents_slug_format" CHECK(
        length("agents"."slug") between 3 and 63 and
        "agents"."slug" = lower("agents"."slug") and
        "agents"."slug" not glob '*[^a-z0-9-]*' and
        substr("agents"."slug", 1, 1) != '-' and
        substr("agents"."slug", -1, 1) != '-'
      ),
	CONSTRAINT "agents_description_valid" CHECK(length(trim("agents"."description")) between 10 and 2000),
	CONSTRAINT "agents_status_valid" CHECK("agents"."status" in ('ACTIVE', 'ARCHIVED')),
	CONSTRAINT "agents_updated_after_created" CHECK("agents"."updated_at" >= "agents"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_organization_slug_uq` ON `agents` (`organization_id`,lower("slug"));--> statement-breakpoint
CREATE INDEX `agents_organization_status_idx` ON `agents` (`organization_id`,`status`);--> statement-breakpoint
CREATE TRIGGER agent_versions_no_update_when_published
BEFORE UPDATE ON agent_versions
WHEN OLD.published_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'published agent versions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER agent_versions_no_delete_when_published
BEFORE DELETE ON agent_versions
WHEN OLD.published_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'published agent versions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER agent_version_tools_no_insert_when_published
BEFORE INSERT ON agent_version_tools
WHEN EXISTS (
  SELECT 1 FROM agent_versions
  WHERE id = NEW.agent_version_id AND published_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'published agent tool bindings are immutable');
END;--> statement-breakpoint
CREATE TRIGGER agent_version_tools_no_update_when_published
BEFORE UPDATE ON agent_version_tools
WHEN EXISTS (
  SELECT 1 FROM agent_versions
  WHERE id = OLD.agent_version_id AND published_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'published agent tool bindings are immutable');
END;--> statement-breakpoint
CREATE TRIGGER agent_version_tools_no_delete_when_published
BEFORE DELETE ON agent_version_tools
WHEN EXISTS (
  SELECT 1 FROM agent_versions
  WHERE id = OLD.agent_version_id AND published_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'published agent tool bindings are immutable');
END;--> statement-breakpoint
CREATE TRIGGER agents_current_version_valid_on_insert
BEFORE INSERT ON agents
WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_versions
  WHERE id = NEW.current_version_id
    AND agent_id = NEW.id
    AND published_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'agent current version must be its published version');
END;--> statement-breakpoint
CREATE TRIGGER agents_current_version_valid_on_update
BEFORE UPDATE OF current_version_id ON agents
WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_versions
  WHERE id = NEW.current_version_id
    AND agent_id = NEW.id
    AND published_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'agent current version must be its published version');
END;
