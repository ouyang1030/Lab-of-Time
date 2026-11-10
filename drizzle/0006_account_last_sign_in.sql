ALTER TABLE `accounts` ADD `last_sign_in_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing accounts start their idle clock at migration time, not at 1970.
UPDATE `accounts` SET `last_sign_in_at` = CAST(strftime('%s','now') AS INTEGER) * 1000;
