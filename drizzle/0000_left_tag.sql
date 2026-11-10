CREATE TABLE `attendance` (
	`item_id` text NOT NULL,
	`member_id` text NOT NULL,
	`response` text NOT NULL,
	PRIMARY KEY(`item_id`, `member_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_invite_code_unique` ON `groups` (`invite_code`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`end_time` text NOT NULL,
	`cycle` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`research` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
