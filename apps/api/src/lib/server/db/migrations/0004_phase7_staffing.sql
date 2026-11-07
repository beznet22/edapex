ALTER TABLE `sm_class_sections` ADD `staffing_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `sm_class_sections` ADD `staffing_reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `sm_class_sections` ADD `staffing_reviewed_by` integer;--> statement-breakpoint
CREATE INDEX `sm_class_sections_school_academic_staffing_index` ON `sm_class_sections` (`school_id`,`academic_id`,`staffing_status`);