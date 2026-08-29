CREATE TRIGGER `organization_members_preserve_owner_on_update`
BEFORE UPDATE ON `organization_members`
WHEN
  OLD.`role` = 'OWNER' AND
  (
    NEW.`role` != 'OWNER' OR
    NEW.`organization_id` != OLD.`organization_id` OR
    NEW.`user_id` != OLD.`user_id`
  ) AND
  NOT EXISTS (
    SELECT 1
    FROM `organization_members`
    WHERE
      `organization_id` = OLD.`organization_id` AND
      `role` = 'OWNER' AND
      `user_id` != OLD.`user_id`
  )
BEGIN
	SELECT RAISE(ABORT, 'organization requires at least one owner');
END;--> statement-breakpoint
CREATE TRIGGER `organization_members_preserve_owner_on_delete`
BEFORE DELETE ON `organization_members`
WHEN
  OLD.`role` = 'OWNER' AND
  NOT EXISTS (
    SELECT 1
    FROM `organization_members`
    WHERE
      `organization_id` = OLD.`organization_id` AND
      `role` = 'OWNER' AND
      `user_id` != OLD.`user_id`
  )
BEGIN
	SELECT RAISE(ABORT, 'organization requires at least one owner');
END;
