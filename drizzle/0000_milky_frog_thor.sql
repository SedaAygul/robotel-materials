CREATE TABLE `library_events` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`group_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`action` text NOT NULL,
	`record_key` text,
	`record_kind` text,
	`before` text,
	`after` text,
	`note` text NOT NULL,
	`proposal_id` text,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_events_revision_unique` ON `library_events` (`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_request` ON `library_events` (`actor_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `library_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_records` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`data` text,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`base_revision` integer NOT NULL,
	`status` text NOT NULL,
	`reviewed_at` text,
	`reviewer_name` text,
	`review_note` text,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_request` ON `proposals` (`actor_id`,`request_id`);