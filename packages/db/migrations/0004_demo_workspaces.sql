CREATE TABLE `demo_workspaces` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "demo_workspaces_expiry_valid" CHECK("demo_workspaces"."expires_at" > "demo_workspaces"."created_at")
);
--> statement-breakpoint
CREATE INDEX `demo_workspaces_expires_at_idx` ON `demo_workspaces` (`expires_at`);
