CREATE TABLE `agent_run_events` (
	`agent_run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`agent_run_id`, `sequence`),
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "agent_run_events_sequence_valid" CHECK("agent_run_events"."sequence" >= 0),
	CONSTRAINT "agent_run_events_type_valid" CHECK("agent_run_events"."event_type" in ('RUN_STARTED', 'INTENT_PARSED', 'MODEL_TEXT_DELTA', 'TOOL_CALL_STARTED', 'TOOL_CALL_COMPLETED', 'TOOL_CALL_FAILED', 'PROPOSAL_CREATED', 'FALLBACK_AVAILABLE', 'RUN_COMPLETED', 'RUN_FAILED')),
	CONSTRAINT "agent_run_events_payload_valid" CHECK(json_valid("agent_run_events"."payload_json")),
	CONSTRAINT "agent_run_events_payload_hash_valid" CHECK(length("agent_run_events"."payload_hash") = 64 and "agent_run_events"."payload_hash" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `agent_run_events_created_idx` ON `agent_run_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version_id` text NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`intent_summary` text,
	`decision_summary` text,
	`proposal_json` text,
	`failure_code` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`agent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "agent_runs_id_valid" CHECK("agent_runs"."id" glob 'run_*' and length("agent_runs"."id") = 30),
	CONSTRAINT "agent_runs_source_valid" CHECK("agent_runs"."source" in ('AI', 'MANUAL')),
	CONSTRAINT "agent_runs_status_valid" CHECK("agent_runs"."status" in ('RUNNING', 'SUCCEEDED', 'FAILED', 'PROVIDER_UNAVAILABLE')),
	CONSTRAINT "agent_runs_completion_valid" CHECK(
        ("agent_runs"."status" = 'RUNNING' and "agent_runs"."completed_at" is null) or
        ("agent_runs"."status" != 'RUNNING' and "agent_runs"."completed_at" is not null and "agent_runs"."completed_at" >= "agent_runs"."started_at")
      ),
	CONSTRAINT "agent_runs_summary_valid" CHECK(
        ("agent_runs"."intent_summary" is null or length(trim("agent_runs"."intent_summary")) between 2 and 500) and
        ("agent_runs"."decision_summary" is null or length(trim("agent_runs"."decision_summary")) between 10 and 500)
      ),
	CONSTRAINT "agent_runs_proposal_valid" CHECK("agent_runs"."proposal_json" is null or json_valid("agent_runs"."proposal_json")),
	CONSTRAINT "agent_runs_terminal_result_valid" CHECK(
        ("agent_runs"."status" = 'SUCCEEDED' and "agent_runs"."proposal_json" is not null and "agent_runs"."decision_summary" is not null and "agent_runs"."failure_code" is null) or
        ("agent_runs"."status" in ('FAILED', 'PROVIDER_UNAVAILABLE') and "agent_runs"."proposal_json" is null and "agent_runs"."failure_code" is not null) or
        ("agent_runs"."status" = 'RUNNING' and "agent_runs"."proposal_json" is null and "agent_runs"."failure_code" is null)
      )
);
--> statement-breakpoint
CREATE INDEX `agent_runs_organization_started_idx` ON `agent_runs` (`organization_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_agent_version_started_idx` ON `agent_runs` (`agent_version_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `agent_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`tool_version_id` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text,
	`input_hash` text NOT NULL,
	`output_hash` text,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`error_code` text,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "agent_tool_calls_id_valid" CHECK("agent_tool_calls"."id" glob 'tlc_*' and length("agent_tool_calls"."id") = 30),
	CONSTRAINT "agent_tool_calls_tool_valid" CHECK(length(trim("agent_tool_calls"."tool_version_id")) between 1 and 128),
	CONSTRAINT "agent_tool_calls_json_valid" CHECK(json_valid("agent_tool_calls"."input_json") and ("agent_tool_calls"."output_json" is null or json_valid("agent_tool_calls"."output_json"))),
	CONSTRAINT "agent_tool_calls_input_hash_valid" CHECK(length("agent_tool_calls"."input_hash") = 64 and "agent_tool_calls"."input_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_tool_calls_output_hash_valid" CHECK("agent_tool_calls"."output_hash" is null or (length("agent_tool_calls"."output_hash") = 64 and "agent_tool_calls"."output_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "agent_tool_calls_status_valid" CHECK("agent_tool_calls"."status" in ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT')),
	CONSTRAINT "agent_tool_calls_terminal_valid" CHECK(
        ("agent_tool_calls"."status" = 'RUNNING' and "agent_tool_calls"."output_json" is null and "agent_tool_calls"."output_hash" is null and "agent_tool_calls"."error_code" is null and "agent_tool_calls"."latency_ms" is null and "agent_tool_calls"."completed_at" is null) or
        ("agent_tool_calls"."status" = 'SUCCEEDED' and "agent_tool_calls"."output_json" is not null and "agent_tool_calls"."output_hash" is not null and "agent_tool_calls"."error_code" is null and "agent_tool_calls"."latency_ms" >= 0 and "agent_tool_calls"."completed_at" >= "agent_tool_calls"."created_at") or
        ("agent_tool_calls"."status" in ('FAILED', 'TIMED_OUT') and "agent_tool_calls"."output_json" is null and "agent_tool_calls"."output_hash" is null and "agent_tool_calls"."error_code" is not null and "agent_tool_calls"."latency_ms" >= 0 and "agent_tool_calls"."completed_at" >= "agent_tool_calls"."created_at")
      )
);
--> statement-breakpoint
CREATE INDEX `agent_tool_calls_run_created_idx` ON `agent_tool_calls` (`agent_run_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER agent_runs_require_published_version
BEFORE INSERT ON agent_runs
WHEN NOT EXISTS (
  SELECT 1
  FROM agents a
  JOIN agent_versions v ON v.id = NEW.agent_version_id AND v.agent_id = a.id
  WHERE a.id = NEW.agent_id
    AND a.organization_id = NEW.organization_id
    AND a.current_version_id = v.id
    AND a.status = 'ACTIVE'
    AND v.published_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'agent run requires the current published organization agent version');
END;
--> statement-breakpoint
CREATE TRIGGER agent_runs_identity_immutable
BEFORE UPDATE ON agent_runs
WHEN NEW.id != OLD.id
  OR NEW.organization_id != OLD.organization_id
  OR NEW.agent_id != OLD.agent_id
  OR NEW.agent_version_id != OLD.agent_version_id
  OR NEW.user_id != OLD.user_id
  OR NEW.source != OLD.source
  OR NEW.started_at != OLD.started_at
BEGIN
  SELECT RAISE(ABORT, 'agent run identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER agent_runs_terminal_no_update
BEFORE UPDATE ON agent_runs
WHEN OLD.status != 'RUNNING'
BEGIN
  SELECT RAISE(ABORT, 'terminal agent runs are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER agent_runs_no_delete
BEFORE DELETE ON agent_runs
BEGIN
  SELECT RAISE(ABORT, 'agent runs are evidence and cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER agent_tool_calls_require_bound_tool
BEFORE INSERT ON agent_tool_calls
WHEN NOT EXISTS (
  SELECT 1
  FROM agent_runs r
  JOIN agent_version_tools t ON t.agent_version_id = r.agent_version_id
  WHERE r.id = NEW.agent_run_id AND t.tool_version_id = NEW.tool_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'agent tool call requires an immutable version binding');
END;
--> statement-breakpoint
CREATE TRIGGER agent_tool_calls_identity_immutable
BEFORE UPDATE ON agent_tool_calls
WHEN NEW.id != OLD.id
  OR NEW.agent_run_id != OLD.agent_run_id
  OR NEW.tool_version_id != OLD.tool_version_id
  OR NEW.input_json != OLD.input_json
  OR NEW.input_hash != OLD.input_hash
  OR NEW.created_at != OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'agent tool call identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER agent_tool_calls_terminal_no_update
BEFORE UPDATE ON agent_tool_calls
WHEN OLD.status != 'RUNNING'
BEGIN
  SELECT RAISE(ABORT, 'terminal agent tool calls are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER agent_tool_calls_no_delete
BEFORE DELETE ON agent_tool_calls
BEGIN
  SELECT RAISE(ABORT, 'agent tool calls are evidence and cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER agent_run_events_contiguous_sequence
BEFORE INSERT ON agent_run_events
WHEN NEW.sequence != COALESCE(
  (SELECT MAX(sequence) + 1 FROM agent_run_events WHERE agent_run_id = NEW.agent_run_id),
  0
)
BEGIN
  SELECT RAISE(ABORT, 'agent run event sequence must be contiguous');
END;
--> statement-breakpoint
CREATE TRIGGER agent_run_events_no_update
BEFORE UPDATE ON agent_run_events
BEGIN
  SELECT RAISE(ABORT, 'agent run events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER agent_run_events_no_delete
BEFORE DELETE ON agent_run_events
BEGIN
  SELECT RAISE(ABORT, 'agent run events are append-only');
END;
