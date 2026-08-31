DROP INDEX `approval_challenges_hash_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `approval_challenges_pending_hash_uq` ON `approval_challenges` (`challenge_hash`) WHERE "approval_challenges"."state" = 'PENDING';
