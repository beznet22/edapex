PRAGMA defer_foreign_keys=on;--> statement-breakpoint
CREATE TABLE `grade_change_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`result_id` integer,
	`student_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`exam_type_id` integer NOT NULL,
	`subject_id` integer,
	`actor_id` integer NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`result_id`) REFERENCES `sm_result_stores`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grade_change_audit_result_index` ON `grade_change_audit` (`school_id`,`result_id`);--> statement-breakpoint
CREATE INDEX `grade_change_audit_student_term_index` ON `grade_change_audit` (`school_id`,`student_id`,`academic_id`,`exam_type_id`);--> statement-breakpoint
CREATE TABLE `public_document_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`exam_type_id` integer NOT NULL,
	`version` integer NOT NULL,
	`jti` text NOT NULL,
	`token_hash` text NOT NULL,
	`issued_by` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_by` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_document_tokens_jti_unique` ON `public_document_tokens` (`jti`);--> statement-breakpoint
CREATE UNIQUE INDEX `public_document_tokens_hash_unique` ON `public_document_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `public_document_tokens_student_index` ON `public_document_tokens` (`school_id`,`student_id`,`academic_id`);--> statement-breakpoint
CREATE TABLE `__new_session_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` integer NOT NULL,
	`kind` text NOT NULL,
	`academic_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_json` text,
	`result_json` text,
	`payload_json` text,
	`error` text,
	`created_by` integer DEFAULT 0 NOT NULL,
	`approved_by` integer,
	`approval_token_hash` text,
	`approval_expires_at` integer,
	`approval_consumed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "session_jobs_kind_check" CHECK("__new_session_jobs"."kind" in ('bootstrap', 'archive', 'restore', 'promotion', 'wipe')),
	CONSTRAINT "session_jobs_status_check" CHECK("__new_session_jobs"."status" in ('queued', 'running', 'completed', 'failed', 'cancelled', 'awaiting_approval'))
);
--> statement-breakpoint
INSERT INTO `__new_session_jobs`("id", "school_id", "kind", "academic_id", "status", "progress_json", "result_json", "error", "created_at", "updated_at", "finished_at") SELECT "id", "school_id", "kind", "academic_id", "status", "progress_json", "result_json", "error", "created_at", "updated_at", "finished_at" FROM `session_jobs`;--> statement-breakpoint
DROP TABLE `session_jobs`;--> statement-breakpoint
ALTER TABLE `__new_session_jobs` RENAME TO `session_jobs`;--> statement-breakpoint
CREATE INDEX `session_jobs_school_kind_status_index` ON `session_jobs` (`school_id`,`kind`,`status`);--> statement-breakpoint
DROP INDEX `archive_objects_school_academic_student_unique`;--> statement-breakpoint
ALTER TABLE `archive_objects` ADD `exam_type_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `archive_objects` ADD `status` text DEFAULT 'archived' NOT NULL;--> statement-breakpoint
ALTER TABLE `archive_objects` ADD `published_at` integer;--> statement-breakpoint
ALTER TABLE `archive_objects` ADD `published_by` integer;--> statement-breakpoint
ALTER TABLE `archive_objects` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `archive_objects` ADD `error` text;--> statement-breakpoint
CREATE UNIQUE INDEX `archive_objects_school_academic_student_version_unique` ON `archive_objects` (`school_id`,`academic_id`,`student_id`,`version`);--> statement-breakpoint
CREATE INDEX `archive_objects_session_status_index` ON `archive_objects` (`school_id`,`academic_id`,`status`);--> statement-breakpoint
CREATE INDEX `archive_objects_student_term_index` ON `archive_objects` (`school_id`,`academic_id`,`student_id`,`exam_type_id`);