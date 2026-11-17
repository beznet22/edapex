CREATE TABLE `push_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`install_id` text NOT NULL,
	`keys_json` text,
	`prefs_json` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT "push_devices_platform_check" CHECK("platform" in ('android','web','ios')),
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_platform_token_unique` ON `push_devices` (`platform`,`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_user_install_unique` ON `push_devices` (`user_id`,`install_id`);--> statement-breakpoint
CREATE INDEX `push_devices_user_id_index` ON `push_devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`school_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	CONSTRAINT "push_jobs_status_check" CHECK("status" in ('queued','sent','failed','skipped')),
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_jobs_idempotency_key_unique` ON `push_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `push_jobs_user_created_index` ON `push_jobs` (`user_id`,`created_at`);
