ALTER TABLE `items` ADD `end_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `all_day` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `source_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `import_batch` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `imported_by` text DEFAULT '' NOT NULL;