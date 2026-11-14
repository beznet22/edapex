CREATE TABLE `marksheet_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` integer NOT NULL,
	`class_id` integer NOT NULL,
	`section_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`exam_type_id` integer NOT NULL,
	`student_id` integer,
	`ocr_content_sha256` text NOT NULL,
	`ocr_parser_version` text NOT NULL,
	`file_name` text NOT NULL,
	`uploaded_by` integer NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`match_method` text,
	`match_score` real,
	`match_candidates_json` text,
	`ocr_name` text,
	`ocr_admission_no` text,
	`ocr_class_label` text,
	`ocr_term` text,
	`ocr_category` text,
	`validation_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_by` integer,
	`confirmed_at` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "marksheet_captures_status_check" CHECK("marksheet_captures"."status" in ('uploaded', 'extracted', 'needs_review', 'confirmed', 'committed', 'failed')),
	CONSTRAINT "marksheet_captures_match_method_check" CHECK("marksheet_captures"."match_method" in ('slot', 'name', 'admission_no', 'manual'))
);
--> statement-breakpoint
CREATE INDEX `marksheet_captures_school_status_index` ON `marksheet_captures` (`school_id`,`status`);--> statement-breakpoint
CREATE INDEX `marksheet_captures_class_exam_index` ON `marksheet_captures` (`school_id`,`class_id`,`section_id`,`exam_type_id`);--> statement-breakpoint
CREATE INDEX `marksheet_captures_ocr_index` ON `marksheet_captures` (`school_id`,`ocr_content_sha256`,`ocr_parser_version`);--> statement-breakpoint
CREATE INDEX `marksheet_captures_student_exam_index` ON `marksheet_captures` (`school_id`,`student_id`,`exam_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marksheet_captures_student_exam_unique` ON `marksheet_captures` (`school_id`,`student_id`,`exam_type_id`) WHERE "marksheet_captures"."student_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `marksheet_captures_file_unique` ON `marksheet_captures` (`school_id`,`class_id`,`section_id`,`exam_type_id`,`ocr_content_sha256`,`ocr_parser_version`);--> statement-breakpoint
CREATE TABLE `ocr_cache` (
	`school_id` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`parser_version` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer,
	`raw_text` text NOT NULL,
	`annotation_json` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`school_id`, `content_sha256`, `parser_version`),
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ocr_cache_expires_at_index` ON `ocr_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `report_settings` (
	`school_id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
