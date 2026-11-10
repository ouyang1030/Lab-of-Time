ALTER TABLE `items` ADD `series_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `repeat_every` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `repeat_until` text DEFAULT '' NOT NULL;