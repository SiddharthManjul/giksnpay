CREATE TABLE `agent_model_capacity_leases` (
	`key` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "agent_model_capacity_leases_key_not_blank" CHECK(length(trim("agent_model_capacity_leases"."key")) between 1 and 1024),
	CONSTRAINT "agent_model_capacity_leases_lease_id_not_blank" CHECK(length(trim("agent_model_capacity_leases"."lease_id")) between 1 and 128),
	CONSTRAINT "agent_model_capacity_leases_expiry_positive" CHECK("agent_model_capacity_leases"."expires_at" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_model_capacity_leases_lease_id_uq` ON `agent_model_capacity_leases` (`lease_id`);--> statement-breakpoint
CREATE INDEX `agent_model_capacity_leases_expires_at_idx` ON `agent_model_capacity_leases` (`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_model_usage_windows` (
	`key` text PRIMARY KEY NOT NULL,
	`used_tokens` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	CONSTRAINT "agent_model_usage_windows_key_not_blank" CHECK(length(trim("agent_model_usage_windows"."key")) between 1 and 1024),
	CONSTRAINT "agent_model_usage_windows_tokens_positive" CHECK("agent_model_usage_windows"."used_tokens" > 0),
	CONSTRAINT "agent_model_usage_windows_started_at_positive" CHECK("agent_model_usage_windows"."window_started_at" > 0)
);
--> statement-breakpoint
CREATE INDEX `agent_model_usage_windows_started_at_idx` ON `agent_model_usage_windows` (`window_started_at`);
