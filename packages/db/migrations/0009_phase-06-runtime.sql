PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER transaction_approvals_require_tenant_binding;--> statement-breakpoint
CREATE TABLE `__new_approval_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`mandate_id` text,
	`credential_id` text,
	`transaction_id` text,
	`rp_id` text,
	`origin` text,
	`purpose` text NOT NULL,
	`challenge_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `passkey_credentials`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "approval_challenges_purpose_valid" CHECK("__new_approval_challenges"."purpose" in ('MANDATE_ACTIVATION', 'TRANSACTION_STEP_UP')),
	CONSTRAINT "approval_challenges_state_valid" CHECK("__new_approval_challenges"."state" in ('PENDING', 'CONSUMED', 'EXPIRED', 'CANCELLED')),
	CONSTRAINT "approval_challenges_challenge_hash_valid" CHECK(length("__new_approval_challenges"."challenge_hash") = 64 and "__new_approval_challenges"."challenge_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "approval_challenges_payload_hash_valid" CHECK(length("__new_approval_challenges"."payload_hash") = 64 and "__new_approval_challenges"."payload_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "approval_challenges_webauthn_context_valid" CHECK(
        ("__new_approval_challenges"."session_id" is null and "__new_approval_challenges"."mandate_id" is null and "__new_approval_challenges"."credential_id" is null and "__new_approval_challenges"."rp_id" is null and "__new_approval_challenges"."origin" is null) or
        ("__new_approval_challenges"."session_id" is not null and "__new_approval_challenges"."mandate_id" is not null and "__new_approval_challenges"."credential_id" is not null and length(trim("__new_approval_challenges"."rp_id")) between 1 and 253 and length(trim("__new_approval_challenges"."origin")) between 8 and 2048)
      ),
	CONSTRAINT "approval_challenges_expires_after_created" CHECK("__new_approval_challenges"."expires_at" > "__new_approval_challenges"."created_at"),
	CONSTRAINT "approval_challenges_consumption_valid" CHECK(
        ("__new_approval_challenges"."state" = 'CONSUMED' and "__new_approval_challenges"."consumed_at" is not null and "__new_approval_challenges"."consumed_at" >= "__new_approval_challenges"."created_at") or
        ("__new_approval_challenges"."state" != 'CONSUMED' and "__new_approval_challenges"."consumed_at" is null)
      )
);
--> statement-breakpoint
INSERT INTO `__new_approval_challenges`("id", "organization_id", "user_id", "session_id", "mandate_id", "credential_id", "transaction_id", "rp_id", "origin", "purpose", "challenge_hash", "payload_hash", "state", "expires_at", "consumed_at", "created_at") SELECT "id", "organization_id", "user_id", NULL, NULL, NULL, "transaction_id", NULL, NULL, "purpose", "challenge_hash", "payload_hash", "state", "expires_at", "consumed_at", "created_at" FROM `approval_challenges`;--> statement-breakpoint
DROP TABLE `approval_challenges`;--> statement-breakpoint
ALTER TABLE `__new_approval_challenges` RENAME TO `approval_challenges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `approval_challenges_hash_uq` ON `approval_challenges` (`challenge_hash`);--> statement-breakpoint
CREATE INDEX `approval_challenges_user_state_idx` ON `approval_challenges` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `approval_challenges_context_idx` ON `approval_challenges` (`organization_id`,`user_id`,`session_id`,`purpose`,`state`);--> statement-breakpoint
CREATE INDEX `approval_challenges_expires_at_idx` ON `approval_challenges` (`expires_at`);--> statement-breakpoint
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
END;--> statement-breakpoint
CREATE UNIQUE INDEX `mandate_proofs_activation_uq`
ON `mandate_proofs` (`mandate_id`, `proof_type`, `payload_hash`)
WHERE `proof_type` = 'WEBAUTHN_ASSERTION';--> statement-breakpoint
CREATE TRIGGER approval_challenges_require_webauthn_binding
BEFORE INSERT ON approval_challenges
FOR EACH ROW
WHEN NEW.session_id IS NOT NULL AND (
  NOT EXISTS (
    SELECT 1 FROM session
    WHERE id = NEW.session_id AND user_id = NEW.user_id AND expires_at > NEW.created_at
  ) OR NOT EXISTS (
    SELECT 1 FROM passkey_credentials
    WHERE id = NEW.credential_id AND user_id = NEW.user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM mandates
    WHERE id = NEW.mandate_id AND organization_id = NEW.organization_id AND user_id = NEW.user_id
  ) OR (
    NEW.purpose = 'MANDATE_ACTIVATION' AND NEW.transaction_id IS NOT NULL
  ) OR (
    NEW.purpose = 'TRANSACTION_STEP_UP' AND NOT EXISTS (
      SELECT 1 FROM transactions
      WHERE id = NEW.transaction_id AND organization_id = NEW.organization_id
        AND user_id = NEW.user_id AND mandate_id = NEW.mandate_id
        AND state = 'APPROVAL_REQUIRED'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'approval challenge WebAuthn binding is invalid');
END;--> statement-breakpoint
CREATE TRIGGER approval_challenges_context_immutable
BEFORE UPDATE ON approval_challenges
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.session_id IS NOT OLD.session_id
  OR NEW.mandate_id IS NOT OLD.mandate_id
  OR NEW.credential_id IS NOT OLD.credential_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.rp_id IS NOT OLD.rp_id
  OR NEW.origin IS NOT OLD.origin
  OR NEW.purpose IS NOT OLD.purpose
  OR NEW.challenge_hash IS NOT OLD.challenge_hash
  OR NEW.payload_hash IS NOT OLD.payload_hash
  OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'approval challenge context is immutable');
END;--> statement-breakpoint
CREATE TRIGGER spend_reservations_reserve_budget
BEFORE INSERT ON spend_reservations
FOR EACH ROW
WHEN NEW.status = 'RESERVED'
BEGIN
  UPDATE mandates
  SET reserved_subunits = reserved_subunits + NEW.amount_subunits,
      updated_at = MAX(updated_at, NEW.created_at)
  WHERE id = NEW.mandate_id
    AND organization_id = NEW.organization_id
    AND kind = 'PAYMENT'
    AND status = 'ACTIVE'
    AND expires_at > NEW.created_at
    AND NEW.amount_subunits <= max_transaction_subunits
    AND completed_transactions < max_transactions
    AND spent_subunits + reserved_subunits + NEW.amount_subunits <= budget_subunits;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'budget unavailable') END;
END;--> statement-breakpoint
CREATE TRIGGER spend_reservations_commit_budget
BEFORE UPDATE OF status ON spend_reservations
FOR EACH ROW
WHEN OLD.status = 'RESERVED' AND NEW.status = 'COMMITTED'
BEGIN
  UPDATE mandates
  SET reserved_subunits = reserved_subunits - OLD.amount_subunits,
      spent_subunits = spent_subunits + OLD.amount_subunits,
      completed_transactions = completed_transactions + 1,
      status = CASE
        WHEN spent_subunits + OLD.amount_subunits >= budget_subunits
          OR completed_transactions + 1 >= max_transactions THEN 'EXHAUSTED'
        ELSE status
      END,
      terminal_at = CASE
        WHEN spent_subunits + OLD.amount_subunits >= budget_subunits
          OR completed_transactions + 1 >= max_transactions THEN NEW.closed_at
        ELSE terminal_at
      END,
      updated_at = NEW.updated_at
  WHERE id = OLD.mandate_id
    AND organization_id = OLD.organization_id
    AND status = 'ACTIVE'
    AND reserved_subunits >= OLD.amount_subunits;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'reserved budget cannot be committed') END;
END;--> statement-breakpoint
CREATE TRIGGER spend_reservations_release_budget
BEFORE UPDATE OF status ON spend_reservations
FOR EACH ROW
WHEN OLD.status = 'RESERVED' AND NEW.status IN ('RELEASED', 'EXPIRED')
BEGIN
  UPDATE mandates
  SET reserved_subunits = reserved_subunits - OLD.amount_subunits,
      updated_at = NEW.updated_at
  WHERE id = OLD.mandate_id
    AND organization_id = OLD.organization_id
    AND reserved_subunits >= OLD.amount_subunits;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'reserved budget cannot be released') END;
END;--> statement-breakpoint
CREATE TRIGGER spend_reservations_terminal_once
BEFORE UPDATE OF status ON spend_reservations
FOR EACH ROW
WHEN OLD.status != 'RESERVED' OR NEW.status = 'RESERVED'
BEGIN
  SELECT RAISE(ABORT, 'spend reservation can close exactly once');
END;
