CREATE TABLE `merchant_service_versions` (
	`merchant_id` text NOT NULL,
	`service_id` text NOT NULL,
	`version` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`currency` text NOT NULL,
	`price_subunits` integer NOT NULL,
	`availability` text NOT NULL,
	`fulfilment_type` text NOT NULL,
	`fulfilment_tool_id` text NOT NULL,
	`estimated_delivery_seconds` integer NOT NULL,
	`privacy_url` text NOT NULL,
	`terms_url` text NOT NULL,
	`published_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`merchant_id`, `service_id`, `version`),
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_identity`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "merchant_service_versions_service_id_valid" CHECK(
		length("service_id") between 3 and 96 and
		"service_id" = lower("service_id") and
		"service_id" not glob '*[^a-z0-9_]*' and
		substr("service_id", 1, 1) glob '[a-z]' and
		substr("service_id", -1, 1) glob '[a-z0-9]' and
		instr("service_id", '__') = 0
	),
	CONSTRAINT "merchant_service_versions_version_valid" CHECK(
		length("version") between 5 and 32 and
		"version" not glob '*[^0-9.]*' and
		length("version") - length(replace("version", '.', '')) = 2 and
		substr("version", 1, 1) glob '[0-9]' and
		substr("version", -1, 1) glob '[0-9]'
	),
	CONSTRAINT "merchant_service_versions_name_valid" CHECK(length("name") between 2 and 160 and "name" = trim("name")),
	CONSTRAINT "merchant_service_versions_description_valid" CHECK(length("description") between 10 and 2000 and "description" = trim("description")),
	CONSTRAINT "merchant_service_versions_category_valid" CHECK(
		length("category") between 3 and 96 and
		"category" = lower("category") and
		"category" not glob '*[^a-z0-9_]*' and
		substr("category", 1, 1) glob '[a-z]' and
		substr("category", -1, 1) glob '[a-z0-9]' and
		instr("category", '__') = 0
	),
	CONSTRAINT "merchant_service_versions_currency_valid" CHECK("currency" = 'INR'),
	CONSTRAINT "merchant_service_versions_price_valid" CHECK(typeof("price_subunits") = 'integer' and "price_subunits" >= 0 and "price_subunits" <= 9007199254740991),
	CONSTRAINT "merchant_service_versions_availability_valid" CHECK("availability" in ('available', 'paused', 'unavailable')),
	CONSTRAINT "merchant_service_versions_fulfilment_type_valid" CHECK("fulfilment_type" in ('mcp', 'rest')),
	CONSTRAINT "merchant_service_versions_tool_id_valid" CHECK(
		length("fulfilment_tool_id") between 3 and 96 and
		"fulfilment_tool_id" = lower("fulfilment_tool_id") and
		"fulfilment_tool_id" not glob '*[^a-z0-9_]*' and
		substr("fulfilment_tool_id", 1, 1) glob '[a-z]' and
		substr("fulfilment_tool_id", -1, 1) glob '[a-z0-9]' and
		instr("fulfilment_tool_id", '__') = 0
	),
	CONSTRAINT "merchant_service_versions_delivery_valid" CHECK(typeof("estimated_delivery_seconds") = 'integer' and "estimated_delivery_seconds" between 1 and 86400),
	CONSTRAINT "merchant_service_versions_policy_origins_valid" CHECK(
		"privacy_url" glob 'https://merchant-demo.example.com/*' and
		"terms_url" glob 'https://merchant-demo.example.com/*'
	),
	CONSTRAINT "merchant_service_versions_timestamps_valid" CHECK("created_at" <= "published_at")
);
--> statement-breakpoint
CREATE INDEX `merchant_service_versions_catalog_idx` ON `merchant_service_versions` (`merchant_id`,`version`,`price_subunits`);
--> statement-breakpoint
CREATE TRIGGER `merchant_service_versions_reject_conflicting_insert`
BEFORE INSERT ON `merchant_service_versions`
WHEN EXISTS (
	SELECT 1
	FROM `merchant_service_versions` AS `stored`
	WHERE
		`stored`.`merchant_id` = NEW.`merchant_id` AND
		`stored`.`service_id` = NEW.`service_id` AND
		`stored`.`version` = NEW.`version` AND
		(
			`stored`.`name` IS NOT NEW.`name` OR
			`stored`.`description` IS NOT NEW.`description` OR
			`stored`.`category` IS NOT NEW.`category` OR
			`stored`.`currency` IS NOT NEW.`currency` OR
			`stored`.`price_subunits` IS NOT NEW.`price_subunits` OR
			`stored`.`availability` IS NOT NEW.`availability` OR
			`stored`.`fulfilment_type` IS NOT NEW.`fulfilment_type` OR
			`stored`.`fulfilment_tool_id` IS NOT NEW.`fulfilment_tool_id` OR
			`stored`.`estimated_delivery_seconds` IS NOT NEW.`estimated_delivery_seconds` OR
			`stored`.`privacy_url` IS NOT NEW.`privacy_url` OR
			`stored`.`terms_url` IS NOT NEW.`terms_url` OR
			`stored`.`published_at` IS NOT NEW.`published_at` OR
			`stored`.`created_at` IS NOT NEW.`created_at`
		)
)
BEGIN
	SELECT RAISE(ABORT, 'published service versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_service_versions_reject_update`
BEFORE UPDATE ON `merchant_service_versions`
BEGIN
	SELECT RAISE(ABORT, 'published service versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `merchant_service_versions_reject_delete`
BEFORE DELETE ON `merchant_service_versions`
BEGIN
	SELECT RAISE(ABORT, 'published service versions are immutable');
END;
