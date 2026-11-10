CREATE TABLE `calendar_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`member_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_sync_at` integer DEFAULT 0 NOT NULL,
	`last_ok` integer DEFAULT true NOT NULL,
	`last_message` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_subscriptions_member_name` ON `calendar_subscriptions` (`member_id`,`name`);--> statement-breakpoint
ALTER TABLE `items` ADD `source_data` text DEFAULT '' NOT NULL;