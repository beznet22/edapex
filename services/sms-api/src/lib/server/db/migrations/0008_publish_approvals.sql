CREATE TABLE `publish_approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`exam_id` integer NOT NULL,
	`requested_by` integer NOT NULL,
	`student_ids_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` integer,
	`decided_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "publish_approvals_status_check" CHECK("status" in ('pending','approved','denied'))
);
--> statement-breakpoint
CREATE INDEX `publish_approvals_school_status_index` ON `publish_approvals` (`school_id`,`status`);
