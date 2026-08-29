CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL,
	CONSTRAINT "rate_limit_key_not_blank" CHECK(length(trim("rate_limit"."key")) between 1 and 1024),
	CONSTRAINT "rate_limit_count_positive" CHECK("rate_limit"."count" >= 1),
	CONSTRAINT "rate_limit_last_request_positive" CHECK("rate_limit"."last_request" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_uq` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE INDEX `rate_limit_last_request_idx` ON `rate_limit` (`last_request`);
