CREATE TABLE `sm_base_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_base_groups_school_id_foreign` ON `sm_base_groups` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_base_setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`base_setup_name` text NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`base_group_id` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	FOREIGN KEY (`base_group_id`) REFERENCES `sm_base_groups`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_base_setups_base_group_id_foreign` ON `sm_base_setups` (`base_group_id`);--> statement-breakpoint
CREATE INDEX `sm_base_setups_school_id_foreign` ON `sm_base_setups` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_class_rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_no` text,
	`capacity` integer,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_class_rooms_academic_id_foreign` ON `sm_class_rooms` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_class_rooms_school_id_foreign` ON `sm_class_rooms` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_class_times` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text,
	`period` text,
	`start_time` text,
	`end_time` text,
	`is_break` integer,
	`created_at` integer,
	`updated_at` integer,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_class_times_academic_id_foreign` ON `sm_class_times` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_class_times_school_id_foreign` ON `sm_class_times` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_name` text NOT NULL,
	`pass_mark` real,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer,
	`parent_id` integer,
	`stage` text,
	`next_class_id` integer,
	`sort_order` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`next_class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "sm_classes_stage_check" CHECK("sm_classes"."stage" in ('EARLY_YEARS', 'LOWER_BASIC', 'MIDDLE_BASIC', 'UPPER_BASIC'))
);
--> statement-breakpoint
CREATE INDEX `sm_classes_academic_id_foreign` ON `sm_classes` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_classes_school_id_foreign` ON `sm_classes` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_designations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_designations_school_id_foreign` ON `sm_designations` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_human_departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`is_saas` integer DEFAULT 0,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_human_departments_created_by_foreign` ON `sm_human_departments` (`created_by`);--> statement-breakpoint
CREATE INDEX `sm_human_departments_school_id_foreign` ON `sm_human_departments` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_human_departments_updated_by_foreign` ON `sm_human_departments` (`updated_by`);--> statement-breakpoint
CREATE TABLE `sm_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`section_name` text NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`un_academic_id` integer,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_sections_academic_id_foreign` ON `sm_sections` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_sections_school_id_foreign` ON `sm_sections` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_student_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_name` text,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_student_categories_academic_id_foreign` ON `sm_student_categories` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_student_categories_school_id_foreign` ON `sm_student_categories` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_name` text NOT NULL,
	`subject_code` text,
	`pass_mark` real,
	`subject_type` text NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`parent_id` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_subjects_academic_id_foreign` ON `sm_subjects` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_subjects_school_id_foreign` ON `sm_subjects` (`school_id`);--> statement-breakpoint
CREATE TABLE `class_attendances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`days_opened` integer,
	`days_absent` integer,
	`days_present` integer,
	`created_at` integer,
	`updated_at` integer,
	`exam_type_id` integer,
	`student_id` integer,
	`school_id` integer,
	`academic_id` integer,
	FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `class_attendances_academic_id_foreign` ON `class_attendances` (`academic_id`);--> statement-breakpoint
CREATE INDEX `class_attendances_exam_type_id_foreign` ON `class_attendances` (`exam_type_id`);--> statement-breakpoint
CREATE INDEX `class_attendances_school_id_foreign` ON `class_attendances` (`school_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_exam_unique` ON `class_attendances` (`student_id`,`exam_type_id`);--> statement-breakpoint
CREATE TABLE `exam_merit_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer,
	`section_id` integer,
	`exam_term_id` integer,
	`total_mark` real,
	`position` integer,
	`admission_no` integer,
	`gpa` real,
	`grade` text,
	`record_id` integer,
	`school_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`active_status` integer DEFAULT 1,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `sm_exam_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`exam_period_id` integer,
	`room_id` integer,
	`subject_id` integer,
	`exam_term_id` integer,
	`exam_id` integer,
	`class_id` integer,
	`section_id` integer,
	`start_time` text,
	`end_time` text,
	`teacher_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`exam_period_id`) REFERENCES `sm_class_times`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`exam_term_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_academic_id_foreign` ON `sm_exam_schedules` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_class_id_foreign` ON `sm_exam_schedules` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_exam_id_foreign` ON `sm_exam_schedules` (`exam_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_exam_period_id_foreign` ON `sm_exam_schedules` (`exam_period_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_exam_term_id_foreign` ON `sm_exam_schedules` (`exam_term_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_school_id_foreign` ON `sm_exam_schedules` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_section_id_foreign` ON `sm_exam_schedules` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_subject_id_foreign` ON `sm_exam_schedules` (`subject_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_schedules_teacher_id_foreign` ON `sm_exam_schedules` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `sm_exam_setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_title` text,
	`exam_mark` real,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`exam_id` integer,
	`class_id` integer,
	`subject_id` integer,
	`section_id` integer,
	`exam_term_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`exam_term_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_exam_setups_academic_id_foreign` ON `sm_exam_setups` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_setups_class_id_foreign` ON `sm_exam_setups` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_setups_exam_id_foreign` ON `sm_exam_setups` (`exam_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_setups_exam_term_id_foreign` ON `sm_exam_setups` (`exam_term_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_setups_school_id_foreign` ON `sm_exam_setups` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_setups_section_id_foreign` ON `sm_exam_setups` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_setups_subject_id_foreign` ON `sm_exam_setups` (`subject_id`);--> statement-breakpoint
CREATE TABLE `sm_exam_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`parent_id` integer DEFAULT 0,
	`sequence` integer NOT NULL,
	`starts_on` text,
	`ends_on` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`grading` text,
	`legacy_suffix` text,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	CONSTRAINT "sm_exam_types_status_check" CHECK("sm_exam_types"."status" in ('planned', 'active', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `sm_exam_types_academic_id_foreign` ON `sm_exam_types` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_exam_types_school_id_foreign` ON `sm_exam_types` (`school_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sm_exam_types_academic_id_sequence_unique` ON `sm_exam_types` (`academic_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `sm_exam_types_academic_id_name_unique` ON `sm_exam_types` (`academic_id`,`name`);--> statement-breakpoint
CREATE TABLE `sm_exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer DEFAULT 0,
	`exam_mark` real,
	`pass_mark` real,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`exam_type_id` integer,
	`class_id` integer,
	`section_id` integer,
	`subject_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_exams_academic_id_foreign` ON `sm_exams` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_exams_class_id_foreign` ON `sm_exams` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_exams_exam_type_id_foreign` ON `sm_exams` (`exam_type_id`);--> statement-breakpoint
CREATE INDEX `sm_exams_school_id_foreign` ON `sm_exams` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_exams_section_id_foreign` ON `sm_exams` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_exams_subject_id_foreign` ON `sm_exams` (`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sm_exams_school_academic_term_class_section_subject_unique` ON `sm_exams` (`school_id`,`academic_id`,`exam_type_id`,`class_id`,`section_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `sm_mark_stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_roll_no` integer DEFAULT 1 NOT NULL,
	`student_addmission_no` integer DEFAULT 1 NOT NULL,
	`total_marks` real NOT NULL,
	`is_absent` integer DEFAULT 1 NOT NULL,
	`teacher_remarks` text,
	`created_at` integer,
	`updated_at` integer,
	`subject_id` integer,
	`exam_term_id` integer,
	`exam_setup_id` integer,
	`student_id` integer,
	`student_record_id` integer,
	`class_id` integer,
	`section_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`active_status` integer DEFAULT 1,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`exam_term_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`exam_setup_id`) REFERENCES `sm_exam_setups`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_mark_stores_academic_id_foreign` ON `sm_mark_stores` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_class_id_foreign` ON `sm_mark_stores` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_exam_setup_id_foreign` ON `sm_mark_stores` (`exam_setup_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_exam_term_id_foreign` ON `sm_mark_stores` (`exam_term_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_school_id_foreign` ON `sm_mark_stores` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_section_id_foreign` ON `sm_mark_stores` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_student_id_foreign` ON `sm_mark_stores` (`student_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_student_record_id_foreign` ON `sm_mark_stores` (`student_record_id`);--> statement-breakpoint
CREATE INDEX `sm_mark_stores_subject_id_foreign` ON `sm_mark_stores` (`subject_id`);--> statement-breakpoint
CREATE TABLE `sm_marks_grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grade_name` text,
	`gpa` real,
	`from` real,
	`up` real,
	`percent_from` real,
	`percent_upto` real,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_marks_grades_academic_id_foreign` ON `sm_marks_grades` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_marks_grades_school_id_foreign` ON `sm_marks_grades` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_result_stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_roll_no` integer DEFAULT 1 NOT NULL,
	`student_addmission_no` integer DEFAULT 1 NOT NULL,
	`is_absent` integer DEFAULT 0 NOT NULL,
	`total_marks` real NOT NULL,
	`total_gpa_point` real,
	`total_gpa_grade` text DEFAULT '0',
	`teacher_remarks` text,
	`created_at` integer,
	`updated_at` integer,
	`exam_type_id` integer,
	`subject_id` integer,
	`active_status` integer DEFAULT 1,
	`exam_setup_id` integer,
	`student_id` integer,
	`student_record_id` integer,
	`class_id` integer,
	`section_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`exam_setup_id`) REFERENCES `sm_exam_setups`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_result_stores_academic_id_foreign` ON `sm_result_stores` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_class_id_foreign` ON `sm_result_stores` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_exam_setup_id_foreign` ON `sm_result_stores` (`exam_setup_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_exam_type_id_foreign` ON `sm_result_stores` (`exam_type_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_school_id_foreign` ON `sm_result_stores` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_section_id_foreign` ON `sm_result_stores` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_student_id_foreign` ON `sm_result_stores` (`student_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_student_record_id_foreign` ON `sm_result_stores` (`student_record_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_subject_id_foreign` ON `sm_result_stores` (`subject_id`);--> statement-breakpoint
CREATE TABLE `sm_student_attendances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attendance_type` text,
	`notes` text,
	`attendance_date` text,
	`created_at` integer,
	`updated_at` integer,
	`student_id` integer,
	`record_id` integer,
	`student_record_id` integer,
	`class_id` integer,
	`section_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`active_status` integer DEFAULT 1,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_student_attendances_academic_id_foreign` ON `sm_student_attendances` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_student_attendances_class_id_foreign` ON `sm_student_attendances` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_student_attendances_school_id_foreign` ON `sm_student_attendances` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_student_attendances_section_id_foreign` ON `sm_student_attendances` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_student_attendances_student_id_foreign` ON `sm_student_attendances` (`student_id`);--> statement-breakpoint
CREATE TABLE `student_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate` integer,
	`attribute` text,
	`color` text,
	`remark` text,
	`created_at` integer,
	`updated_at` integer,
	`student_id` integer,
	`exam_type_id` integer,
	`academic_id` integer,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_id_exam_type_id_attribute` ON `student_ratings` (`student_id`,`exam_type_id`,`attribute`);--> statement-breakpoint
CREATE INDEX `student_ratings_academic_id_foreign` ON `student_ratings` (`academic_id`);--> statement-breakpoint
CREATE INDEX `student_ratings_exam_type_id_foreign` ON `student_ratings` (`exam_type_id`);--> statement-breakpoint
CREATE TABLE `teacher_remarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`remark` text,
	`created_at` integer,
	`updated_at` integer,
	`teacher_id` integer,
	`student_id` integer,
	`exam_type_id` integer,
	`academic_id` integer,
	FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tr_student_exam_academic_unq` ON `teacher_remarks` (`student_id`,`exam_type_id`,`academic_id`);--> statement-breakpoint
CREATE INDEX `teacher_remarks_academic_id_foreign` ON `teacher_remarks` (`academic_id`);--> statement-breakpoint
CREATE INDEX `teacher_remarks_exam_type_id_foreign` ON `teacher_remarks` (`exam_type_id`);--> statement-breakpoint
CREATE INDEX `teacher_remarks_teacher_id_foreign` ON `teacher_remarks` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `auth_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`issued_by` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "auth_codes_subject_type_check" CHECK("auth_codes"."subject_type" in ('student', 'staff', 'parent'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_codes_code_hash_unique` ON `auth_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `auth_codes_subject_type_subject_id_index` ON `auth_codes` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`user_id` integer,
	`email` text,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `auth_events_user_id_created_at_index` ON `auth_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_events_type_created_at_index` ON `auth_events` (`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email_at_provider` text,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_provider_provider_user_id_unique` ON `auth_identities` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE INDEX `auth_identities_user_id_index` ON `auth_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`requested_ip` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_magic_links_token_hash_unique` ON `auth_magic_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_magic_links_email_created_at_index` ON `auth_magic_links` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`device_fingerprint` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_expires_at_index` ON `auth_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `sm_bank_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank_name` text,
	`account_name` text,
	`account_number` text,
	`account_type` text,
	`opening_balance` integer NOT NULL,
	`current_balance` integer NOT NULL,
	`note` text,
	`active_status` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_bank_accounts_academic_id_foreign` ON `sm_bank_accounts` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_bank_accounts_school_id_foreign` ON `sm_bank_accounts` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_fees_assigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`fees_amount` integer,
	`applied_discount` integer,
	`fees_master_id` integer,
	`fees_discount_id` integer,
	`record_id` integer,
	`student_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`class_id` integer,
	`section_id` integer,
	FOREIGN KEY (`fees_master_id`) REFERENCES `sm_fees_masters`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_fees_assigns_academic_id_foreign` ON `sm_fees_assigns` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_assigns_fees_discount_id_foreign` ON `sm_fees_assigns` (`fees_discount_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_assigns_fees_master_id_foreign` ON `sm_fees_assigns` (`fees_master_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_assigns_school_id_foreign` ON `sm_fees_assigns` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_assigns_student_id_foreign` ON `sm_fees_assigns` (`student_id`);--> statement-breakpoint
CREATE TABLE `sm_fees_discounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`code` text,
	`type` text,
	`amount` integer,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`record_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_fees_discounts_academic_id_foreign` ON `sm_fees_discounts` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_discounts_school_id_foreign` ON `sm_fees_discounts` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_fees_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`type` text,
	`start_date` text,
	`end_date` text,
	`due_date` text,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`un_semester_label_id` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_fees_groups_academic_id_foreign` ON `sm_fees_groups` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_groups_school_id_foreign` ON `sm_fees_groups` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_fees_masters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text,
	`amount` integer,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`fees_group_id` integer,
	`fees_type_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`class_id` integer,
	`section_id` integer,
	`un_semester_label_id` integer,
	FOREIGN KEY (`fees_group_id`) REFERENCES `sm_fees_groups`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`fees_type_id`) REFERENCES `sm_fees_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_fees_masters_academic_id_foreign` ON `sm_fees_masters` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_masters_fees_group_id_foreign` ON `sm_fees_masters` (`fees_group_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_masters_fees_type_id_foreign` ON `sm_fees_masters` (`fees_type_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_masters_school_id_foreign` ON `sm_fees_masters` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_fees_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discount_month` integer,
	`discount_amount` integer,
	`fine` integer,
	`amount` integer,
	`payment_date` text,
	`payment_mode` text,
	`note` text,
	`slip` text,
	`fine_title` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`assign_id` integer,
	`bank_id` integer,
	`fees_discount_id` integer,
	`fees_type_id` integer,
	`record_id` integer,
	`student_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`direct_fees_installment_assign_id` integer,
	`installment_payment_id` integer,
	FOREIGN KEY (`assign_id`) REFERENCES `sm_fees_assigns`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`bank_id`) REFERENCES `sm_bank_accounts`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`fees_type_id`) REFERENCES `sm_fees_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_fees_payments_academic_id_foreign` ON `sm_fees_payments` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_payments_assign_id_foreign` ON `sm_fees_payments` (`assign_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_payments_bank_id_foreign` ON `sm_fees_payments` (`bank_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_payments_fees_discount_id_foreign` ON `sm_fees_payments` (`fees_discount_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_payments_fees_type_id_foreign` ON `sm_fees_payments` (`fees_type_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_payments_school_id_foreign` ON `sm_fees_payments` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_payments_student_id_foreign` ON `sm_fees_payments` (`student_id`);--> statement-breakpoint
CREATE TABLE `sm_fees_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`fees_group_id` integer DEFAULT 1,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`un_semester_label_id` integer,
	FOREIGN KEY (`fees_group_id`) REFERENCES `sm_fees_groups`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_fees_types_academic_id_foreign` ON `sm_fees_types` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_types_fees_group_id_foreign` ON `sm_fees_types` (`fees_group_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_types_school_id_foreign` ON `sm_fees_types` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_homework_students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`marks` text,
	`teacher_comments` text,
	`complete_status` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`student_id` integer,
	`homework_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`homework_id`) REFERENCES `sm_homeworks`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_homework_students_academic_id_foreign` ON `sm_homework_students` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_homework_students_homework_id_foreign` ON `sm_homework_students` (`homework_id`);--> statement-breakpoint
CREATE INDEX `sm_homework_students_school_id_foreign` ON `sm_homework_students` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_homework_students_student_id_foreign` ON `sm_homework_students` (`student_id`);--> statement-breakpoint
CREATE TABLE `sm_homeworks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`homework_date` text,
	`submission_date` text,
	`evaluation_date` text,
	`file` text,
	`marks` text,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`evaluated_by` integer,
	`class_id` integer,
	`record_id` integer,
	`section_id` integer,
	`subject_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`course_id` integer,
	`lesson_id` integer,
	`chapter_id` integer,
	FOREIGN KEY (`evaluated_by`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_homeworks_academic_id_foreign` ON `sm_homeworks` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_homeworks_class_id_foreign` ON `sm_homeworks` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_homeworks_evaluated_by_foreign` ON `sm_homeworks` (`evaluated_by`);--> statement-breakpoint
CREATE INDEX `sm_homeworks_school_id_foreign` ON `sm_homeworks` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_homeworks_subject_id_foreign` ON `sm_homeworks` (`subject_id`);--> statement-breakpoint
CREATE TABLE `archive_objects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`student_record_id` integer,
	`object_key` text NOT NULL,
	`checksum` text NOT NULL,
	`bytes` integer NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_objects_object_key_unique` ON `archive_objects` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `archive_objects_school_academic_student_unique` ON `archive_objects` (`school_id`,`academic_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `migration_resolutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`finding_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`archive_key` text,
	`applied_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `migration_resolutions_school_finding_index` ON `migration_resolutions` (`school_id`,`finding_id`);--> statement-breakpoint
CREATE TABLE `promotion_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`from_class_id` integer,
	`to_class_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`student_count` integer DEFAULT 0 NOT NULL,
	`promoted_count` integer DEFAULT 0 NOT NULL,
	`quarantined_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`from_class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`to_class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "promotion_batches_status_check" CHECK("promotion_batches"."status" in ('pending', 'running', 'completed', 'failed', 'reversed'))
);
--> statement-breakpoint
CREATE INDEX `promotion_batches_school_academic_index` ON `promotion_batches` (`school_id`,`academic_id`);--> statement-breakpoint
CREATE TABLE `promotion_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`from_record_id` integer,
	`to_record_id` integer,
	`outcome` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `promotion_batches`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`from_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`to_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "promotion_outcomes_outcome_check" CHECK("promotion_outcomes"."outcome" in ('promoted', 'graduated', 'repeated', 'withdrawn', 'quarantined'))
);
--> statement-breakpoint
CREATE INDEX `promotion_outcomes_batch_index` ON `promotion_outcomes` (`batch_id`);--> statement-breakpoint
CREATE INDEX `promotion_outcomes_student_index` ON `promotion_outcomes` (`student_id`);--> statement-breakpoint
CREATE TABLE `session_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` integer NOT NULL,
	`kind` text NOT NULL,
	`academic_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_json` text,
	`result_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "session_jobs_kind_check" CHECK("session_jobs"."kind" in ('bootstrap', 'archive', 'restore', 'promotion')),
	CONSTRAINT "session_jobs_status_check" CHECK("session_jobs"."status" in ('queued', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `session_jobs_school_kind_status_index` ON `session_jobs` (`school_id`,`kind`,`status`);--> statement-breakpoint
CREATE TABLE `session_result_summary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`academic_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`total` real,
	`average` real,
	`grade` text,
	`gpa` real,
	`position` integer,
	`subject_count` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `sm_exam_types`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_result_summary_term_unique` ON `session_result_summary` (`school_id`,`academic_id`,`student_id`,`term_id`);--> statement-breakpoint
CREATE INDEX `session_result_summary_student_index` ON `session_result_summary` (`school_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `sm_dormitory_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dormitory_name` text NOT NULL,
	`type` text NOT NULL,
	`address` text,
	`intake` integer,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_dormitory_lists_academic_id_foreign` ON `sm_dormitory_lists` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_dormitory_lists_school_id_foreign` ON `sm_dormitory_lists` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_parents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fathers_name` text,
	`fathers_mobile` text,
	`fathers_occupation` text,
	`fathers_photo` text,
	`mothers_name` text,
	`mothers_mobile` text,
	`mothers_occupation` text,
	`mothers_photo` text,
	`relation` text,
	`guardians_name` text,
	`guardians_mobile` text,
	`guardians_email` text,
	`guardians_occupation` text,
	`guardians_relation` text,
	`guardians_photo` text,
	`guardians_address` text,
	`is_guardian` integer,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`user_id` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_parents_academic_id_foreign` ON `sm_parents` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_parents_school_id_foreign` ON `sm_parents` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_parents_user_id_foreign` ON `sm_parents` (`user_id`);--> statement-breakpoint
CREATE TABLE `sm_room_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`number_of_bed` integer NOT NULL,
	`cost_per_bed` integer,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`dormitory_id` integer DEFAULT 1,
	`room_type_id` integer DEFAULT 1,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`dormitory_id`) REFERENCES `sm_dormitory_lists`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `sm_room_types`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_room_lists_academic_id_foreign` ON `sm_room_lists` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_room_lists_dormitory_id_foreign` ON `sm_room_lists` (`dormitory_id`);--> statement-breakpoint
CREATE INDEX `sm_room_lists_room_type_id_foreign` ON `sm_room_lists` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `sm_room_lists_school_id_foreign` ON `sm_room_lists` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_room_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_room_types_academic_id_foreign` ON `sm_room_types` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_room_types_school_id_foreign` ON `sm_room_types` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_routes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`far` integer NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_routes_academic_id_foreign` ON `sm_routes` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_routes_school_id_foreign` ON `sm_routes` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_staffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_no` integer,
	`first_name` text,
	`last_name` text,
	`full_name` text,
	`fathers_name` text,
	`mothers_name` text,
	`date_of_birth` text DEFAULT '2024-11-04',
	`date_of_joining` text DEFAULT '2024-11-04',
	`email` text,
	`mobile` text,
	`emergency_mobile` text,
	`marital_status` text,
	`merital_status` text,
	`staff_photo` text,
	`current_address` text,
	`permanent_address` text,
	`qualification` text,
	`experience` text,
	`epf_no` text,
	`basic_salary` text,
	`contract_type` text,
	`location` text,
	`casual_leave` text,
	`medical_leave` text,
	`metarnity_leave` text,
	`bank_account_name` text,
	`bank_account_no` text,
	`bank_name` text,
	`bank_brach` text,
	`facebook_url` text,
	`twiteer_url` text,
	`linkedin_url` text,
	`instragram_url` text,
	`joining_letter` text,
	`resume` text,
	`other_document` text,
	`notes` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`show_public` integer DEFAULT 0 NOT NULL,
	`driving_license` text,
	`driving_license_ex_date` text,
	`custom_field` text,
	`custom_field_form_name` text,
	`created_at` integer,
	`updated_at` integer,
	`designation_id` integer DEFAULT 1,
	`department_id` integer DEFAULT 1,
	`user_id` integer DEFAULT 1,
	`parent_id` integer,
	`role_id` integer DEFAULT 1,
	`previous_role_id` integer,
	`gender_id` integer DEFAULT 1,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`is_saas` integer DEFAULT 0,
	FOREIGN KEY (`designation_id`) REFERENCES `sm_designations`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `sm_human_departments`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`gender_id`) REFERENCES `sm_base_setups`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_staffs_department_id_foreign` ON `sm_staffs` (`department_id`);--> statement-breakpoint
CREATE INDEX `sm_staffs_designation_id_foreign` ON `sm_staffs` (`designation_id`);--> statement-breakpoint
CREATE INDEX `sm_staffs_gender_id_foreign` ON `sm_staffs` (`gender_id`);--> statement-breakpoint
CREATE INDEX `sm_staffs_role_id_foreign` ON `sm_staffs` (`role_id`);--> statement-breakpoint
CREATE INDEX `sm_staffs_school_id_foreign` ON `sm_staffs` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_staffs_user_id_foreign` ON `sm_staffs` (`user_id`);--> statement-breakpoint
CREATE TABLE `sm_student_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group` text NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_student_groups_academic_id_foreign` ON `sm_student_groups` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_student_groups_school_id_foreign` ON `sm_student_groups` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_student_promotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_status` text,
	`created_at` integer,
	`updated_at` integer,
	`previous_class_id` integer,
	`current_class_id` integer,
	`previous_section_id` integer,
	`current_section_id` integer,
	`previous_session_id` integer,
	`current_session_id` integer,
	`student_id` integer,
	`admission_number` integer,
	`student_info` text,
	`merit_student_info` text,
	`previous_roll_number` integer,
	`current_roll_number` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`previous_class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`current_class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`previous_section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`current_section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`previous_session_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`current_session_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_student_promotions_academic_id_foreign` ON `sm_student_promotions` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_current_class_id_foreign` ON `sm_student_promotions` (`current_class_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_current_section_id_foreign` ON `sm_student_promotions` (`current_section_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_current_session_id_foreign` ON `sm_student_promotions` (`current_session_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_previous_class_id_foreign` ON `sm_student_promotions` (`previous_class_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_previous_section_id_foreign` ON `sm_student_promotions` (`previous_section_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_previous_session_id_foreign` ON `sm_student_promotions` (`previous_session_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_school_id_foreign` ON `sm_student_promotions` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_student_promotions_student_id_foreign` ON `sm_student_promotions` (`student_id`);--> statement-breakpoint
CREATE TABLE `sm_student_timelines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_student_id` integer NOT NULL,
	`title` text,
	`date` text,
	`description` text,
	`file` text,
	`type` text,
	`visible_to_student` integer DEFAULT 0 NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_student_timelines_academic_id_foreign` ON `sm_student_timelines` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_student_timelines_school_id_foreign` ON `sm_student_timelines` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admission_no` integer,
	`roll_no` integer,
	`first_name` text,
	`last_name` text,
	`full_name` text,
	`date_of_birth` text,
	`caste` text,
	`email` text,
	`mobile` text,
	`admission_date` text,
	`student_photo` text,
	`age` text,
	`height` text,
	`weight` text,
	`current_address` text,
	`permanent_address` text,
	`driver_id` text,
	`national_id_no` text,
	`local_id_no` text,
	`bank_account_no` text,
	`bank_name` text,
	`previous_school_details` text,
	`aditional_notes` text,
	`ifsc_code` text,
	`document_title_1` text,
	`document_file_1` text,
	`document_title_2` text,
	`document_file_2` text,
	`document_title_3` text,
	`document_file_3` text,
	`document_title_4` text,
	`document_file_4` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`custom_field` text,
	`custom_field_form_name` text,
	`created_at` integer,
	`updated_at` integer,
	`bloodgroup_id` integer DEFAULT 1,
	`religion_id` integer DEFAULT 1,
	`route_list_id` integer DEFAULT 1,
	`dormitory_id` integer DEFAULT 1,
	`vechile_id` integer DEFAULT 1,
	`room_id` integer DEFAULT 1,
	`student_category_id` integer DEFAULT 1,
	`student_group_id` integer DEFAULT 1,
	`class_id` integer DEFAULT 1,
	`section_id` integer DEFAULT 1,
	`parent_id` integer DEFAULT 1,
	`user_id` integer DEFAULT 1,
	`role_id` integer,
	`gender_id` integer DEFAULT 1,
	`school_id` integer DEFAULT 1 NOT NULL,
	`academic_id` integer,
	`current_record_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`bloodgroup_id`) REFERENCES `sm_base_setups`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`religion_id`) REFERENCES `sm_base_setups`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`route_list_id`) REFERENCES `sm_routes`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`dormitory_id`) REFERENCES `sm_dormitory_lists`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`vechile_id`) REFERENCES `sm_vehicles`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`room_id`) REFERENCES `sm_room_lists`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`student_category_id`) REFERENCES `sm_student_categories`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`student_group_id`) REFERENCES `sm_student_groups`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `sm_parents`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`gender_id`) REFERENCES `sm_base_setups`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`current_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "sm_students_status_check" CHECK("sm_students"."status" in ('active', 'graduated', 'withdrawn', 'left'))
);
--> statement-breakpoint
CREATE INDEX `sm_students_academic_id_foreign` ON `sm_students` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_students_bloodgroup_id_foreign` ON `sm_students` (`bloodgroup_id`);--> statement-breakpoint
CREATE INDEX `sm_students_class_id_foreign` ON `sm_students` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_students_dormitory_id_foreign` ON `sm_students` (`dormitory_id`);--> statement-breakpoint
CREATE INDEX `sm_students_gender_id_foreign` ON `sm_students` (`gender_id`);--> statement-breakpoint
CREATE INDEX `sm_students_parent_id_foreign` ON `sm_students` (`parent_id`);--> statement-breakpoint
CREATE INDEX `sm_students_religion_id_foreign` ON `sm_students` (`religion_id`);--> statement-breakpoint
CREATE INDEX `sm_students_role_id_foreign` ON `sm_students` (`role_id`);--> statement-breakpoint
CREATE INDEX `sm_students_room_id_foreign` ON `sm_students` (`room_id`);--> statement-breakpoint
CREATE INDEX `sm_students_route_list_id_foreign` ON `sm_students` (`route_list_id`);--> statement-breakpoint
CREATE INDEX `sm_students_school_id_foreign` ON `sm_students` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_students_section_id_foreign` ON `sm_students` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_students_student_category_id_foreign` ON `sm_students` (`student_category_id`);--> statement-breakpoint
CREATE INDEX `sm_students_student_group_id_foreign` ON `sm_students` (`student_group_id`);--> statement-breakpoint
CREATE INDEX `sm_students_user_id_foreign` ON `sm_students` (`user_id`);--> statement-breakpoint
CREATE INDEX `sm_students_vechile_id_foreign` ON `sm_students` (`vechile_id`);--> statement-breakpoint
CREATE TABLE `sm_vehicles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_no` text NOT NULL,
	`vehicle_model` text NOT NULL,
	`made_year` integer,
	`note` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`driver_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_vehicles_academic_id_foreign` ON `sm_vehicles` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_vehicles_school_id_foreign` ON `sm_vehicles` (`school_id`);--> statement-breakpoint
CREATE TABLE `student_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer,
	`section_id` integer,
	`roll_no` text,
	`is_promote` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`school_id` integer DEFAULT 1 NOT NULL,
	`academic_id` integer,
	`student_id` integer,
	`active_status` integer DEFAULT 1,
	`created_at` integer,
	`updated_at` integer,
	`is_graduate` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'current' NOT NULL,
	`promoted_from_record_id` integer,
	`promotion_batch_id` integer,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`promoted_from_record_id`) REFERENCES `student_records`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "student_records_status_check" CHECK("student_records"."status" in ('current', 'promoted', 'repeated', 'graduated', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `student_records_academic_id_foreign` ON `student_records` (`academic_id`);--> statement-breakpoint
CREATE INDEX `student_records_class_id_foreign` ON `student_records` (`class_id`);--> statement-breakpoint
CREATE INDEX `student_records_school_id_foreign` ON `student_records` (`school_id`);--> statement-breakpoint
CREATE INDEX `student_records_section_id_foreign` ON `student_records` (`section_id`);--> statement-breakpoint
CREATE INDEX `student_records_student_id_foreign` ON `student_records` (`student_id`);--> statement-breakpoint
CREATE TABLE `infix_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`type` text DEFAULT 'System' NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT '1',
	`updated_by` text DEFAULT '1',
	`created_at` integer,
	`updated_at` integer,
	`school_id` integer DEFAULT 1,
	`is_saas` integer DEFAULT 0,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `infix_roles_school_id_foreign` ON `infix_roles` (`school_id`);--> statement-breakpoint
CREATE TABLE `languages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`native` text NOT NULL,
	`rtl` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`active_status` integer DEFAULT 0 NOT NULL,
	`school_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `languages_school_id_foreign` ON `languages` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_academic_years` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` text NOT NULL,
	`title` text NOT NULL,
	`starting_date` text NOT NULL,
	`ending_date` text NOT NULL,
	`copy_with_academic_year` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`status` text DEFAULT 'planned' NOT NULL,
	`archived_at` integer,
	`archive_manifest_key` text,
	`copied_from_id` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`copied_from_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null,
	CONSTRAINT "sm_academic_years_status_check" CHECK("sm_academic_years"."status" in ('planned', 'active', 'closing', 'archived', 'restoring', 'archived_readable'))
);
--> statement-breakpoint
CREATE INDEX `sm_academic_years_school_id_foreign` ON `sm_academic_years` (`school_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sm_academic_years_school_year_unique` ON `sm_academic_years` (`school_id`,`year`);--> statement-breakpoint
CREATE TABLE `sm_date_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`format` text,
	`normal_view` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_date_formats_school_id_foreign` ON `sm_date_formats` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_general_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer DEFAULT 1,
	`academic_id` integer,
	`session_id` integer,
	`language_id` integer DEFAULT 1,
	`date_format_id` integer DEFAULT 1,
	`school_name` text,
	`phone` text,
	`email` text,
	`address` text,
	`logo` text,
	`identity` text,
	`extras` text,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`language_id`) REFERENCES `sm_languages`(`id`) ON UPDATE restrict ON DELETE set null,
	FOREIGN KEY (`date_format_id`) REFERENCES `sm_date_formats`(`id`) ON UPDATE restrict ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sm_general_settings_academic_id_foreign` ON `sm_general_settings` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_general_settings_date_format_id_foreign` ON `sm_general_settings` (`date_format_id`);--> statement-breakpoint
CREATE INDEX `sm_general_settings_language_id_foreign` ON `sm_general_settings` (`language_id`);--> statement-breakpoint
CREATE INDEX `sm_general_settings_school_id_foreign` ON `sm_general_settings` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_general_settings_session_id_foreign` ON `sm_general_settings` (`session_id`);--> statement-breakpoint
CREATE TABLE `sm_languages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`language_name` text,
	`native` text,
	`language_universal` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`lang_id` integer DEFAULT 1,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	FOREIGN KEY (`lang_id`) REFERENCES `languages`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_languages_lang_id_foreign` ON `sm_languages` (`lang_id`);--> statement-breakpoint
CREATE INDEX `sm_languages_school_id_foreign` ON `sm_languages` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_schools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_name` text,
	`created_by` integer DEFAULT 1 NOT NULL,
	`updated_by` integer DEFAULT 1 NOT NULL,
	`email` text,
	`domain` text DEFAULT 'school' NOT NULL,
	`address` text,
	`phone` text,
	`school_code` text,
	`is_email_verified` integer DEFAULT 0 NOT NULL,
	`starting_date` text,
	`ending_date` text,
	`package_id` integer,
	`plan_type` text,
	`region` integer,
	`contact_type` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`is_enabled` text DEFAULT 'yes' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text,
	`username` text,
	`phone_number` text,
	`email` text,
	`password` text,
	`usertype` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`random_code` text,
	`notification_token` text,
	`remember_token` text,
	`created_at` integer,
	`updated_at` integer,
	`language` text DEFAULT 'en',
	`style_id` integer DEFAULT 1,
	`rtl_ltl` integer DEFAULT 2,
	`selected_session` integer DEFAULT 1,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`access_status` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`role_id` integer,
	`is_administrator` text DEFAULT 'no' NOT NULL,
	`is_registered` integer DEFAULT 0 NOT NULL,
	`device_token` text,
	`stripe_id` text,
	`card_brand` text,
	`card_last_four` text,
	`verified` text,
	`trial_ends_at` integer,
	`wallet_balance` integer DEFAULT 0 NOT NULL,
	`email_verified_at` integer,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `users_role_id_foreign` ON `users` (`role_id`);--> statement-breakpoint
CREATE INDEX `users_school_id_foreign` ON `users` (`school_id`);--> statement-breakpoint
CREATE INDEX `users_email_index` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `chat_group_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`role` integer DEFAULT 1 NOT NULL,
	`added_by` integer NOT NULL,
	`removed_by` integer,
	`deleted_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `chat_group_users_group_id_user_id_index` ON `chat_group_users` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `chat_group_users_user_id_index` ON `chat_group_users` (`user_id`);--> statement-breakpoint
CREATE TABLE `chat_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`photo_url` text,
	`privacy` integer,
	`read_only` integer DEFAULT 0 NOT NULL,
	`group_type` integer DEFAULT 1 NOT NULL,
	`created_by` integer NOT NULL,
	`class_id` integer,
	`section_id` integer,
	`subject_id` integer,
	`teacher_id` integer,
	`school_id` integer,
	`academic_id` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_groups_academic_id_foreign` ON `chat_groups` (`academic_id`);--> statement-breakpoint
CREATE INDEX `chat_groups_class_id_foreign` ON `chat_groups` (`class_id`);--> statement-breakpoint
CREATE INDEX `chat_groups_school_id_foreign` ON `chat_groups` (`school_id`);--> statement-breakpoint
CREATE INDEX `chat_groups_section_id_foreign` ON `chat_groups` (`section_id`);--> statement-breakpoint
CREATE INDEX `chat_groups_subject_id_foreign` ON `chat_groups` (`subject_id`);--> statement-breakpoint
CREATE INDEX `chat_groups_teacher_id_foreign` ON `chat_groups` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `sm_assign_class_teachers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`class_id` integer,
	`section_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_assign_class_teachers_academic_id_foreign` ON `sm_assign_class_teachers` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_class_teachers_class_id_foreign` ON `sm_assign_class_teachers` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_class_teachers_school_id_foreign` ON `sm_assign_class_teachers` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_class_teachers_section_id_foreign` ON `sm_assign_class_teachers` (`section_id`);--> statement-breakpoint
CREATE TABLE `sm_assign_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`teacher_id` integer,
	`class_id` integer,
	`section_id` integer,
	`subject_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`parent_id` integer,
	FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_academic_id_foreign` ON `sm_assign_subjects` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_class_id_foreign` ON `sm_assign_subjects` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_school_id_foreign` ON `sm_assign_subjects` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_section_id_foreign` ON `sm_assign_subjects` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_subject_id_foreign` ON `sm_assign_subjects` (`subject_id`);--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_teacher_id_foreign` ON `sm_assign_subjects` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `sm_class_routine_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` integer,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`start_time` text,
	`end_time` text,
	`is_break` integer,
	`room_id` integer,
	`teacher_id` integer,
	`class_period_id` integer,
	`subject_id` integer,
	`class_id` integer,
	`section_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`room_id`) REFERENCES `sm_class_rooms`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_period_id`) REFERENCES `sm_class_times`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_academic_id_foreign` ON `sm_class_routine_updates` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_class_id_foreign` ON `sm_class_routine_updates` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_class_period_id_foreign` ON `sm_class_routine_updates` (`class_period_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_room_id_foreign` ON `sm_class_routine_updates` (`room_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_school_id_foreign` ON `sm_class_routine_updates` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_section_id_foreign` ON `sm_class_routine_updates` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_subject_id_foreign` ON `sm_class_routine_updates` (`subject_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routine_updates_teacher_id_foreign` ON `sm_class_routine_updates` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `sm_class_routines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monday` text,
	`monday_start_from` text,
	`monday_end_to` text,
	`monday_room_id` integer,
	`tuesday` text,
	`tuesday_start_from` text,
	`tuesday_end_to` text,
	`tuesday_room_id` integer,
	`wednesday` text,
	`wednesday_start_from` text,
	`wednesday_end_to` text,
	`wednesday_room_id` integer,
	`thursday` text,
	`thursday_start_from` text,
	`thursday_end_to` text,
	`thursday_room_id` integer,
	`friday` text,
	`friday_start_from` text,
	`friday_end_to` text,
	`friday_room_id` integer,
	`saturday` text,
	`saturday_start_from` text,
	`saturday_end_to` text,
	`saturday_room_id` integer,
	`sunday` text,
	`sunday_start_from` text,
	`sunday_end_to` text,
	`sunday_room_id` integer,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`class_id` integer,
	`section_id` integer,
	`subject_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_class_routines_academic_id_foreign` ON `sm_class_routines` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routines_class_id_foreign` ON `sm_class_routines` (`class_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routines_school_id_foreign` ON `sm_class_routines` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routines_section_id_foreign` ON `sm_class_routines` (`section_id`);--> statement-breakpoint
CREATE INDEX `sm_class_routines_subject_id_foreign` ON `sm_class_routines` (`subject_id`);--> statement-breakpoint
CREATE TABLE `sm_class_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`class_id` integer,
	`section_id` integer,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	`parent_id` integer,
	FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_class_sections_academic_id_foreign` ON `sm_class_sections` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_class_sections_class_id_section_id_index` ON `sm_class_sections` (`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `sm_class_sections_school_id_foreign` ON `sm_class_sections` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_class_sections_section_id_foreign` ON `sm_class_sections` (`section_id`);--> statement-breakpoint
CREATE TABLE `sm_class_teachers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`teacher_id` integer,
	`assign_class_teacher_id` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`assign_class_teacher_id`) REFERENCES `sm_assign_class_teachers`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_class_teachers_academic_id_foreign` ON `sm_class_teachers` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_class_teachers_assign_class_teacher_id_foreign` ON `sm_class_teachers` (`assign_class_teacher_id`);--> statement-breakpoint
CREATE INDEX `sm_class_teachers_school_id_foreign` ON `sm_class_teachers` (`school_id`);--> statement-breakpoint
CREATE INDEX `sm_class_teachers_teacher_id_foreign` ON `sm_class_teachers` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `sm_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_title` text,
	`for_whom` text,
	`role_ids` text,
	`url` text,
	`event_location` text,
	`event_des` text,
	`from_date` text,
	`to_date` text,
	`uplad_image_file` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_events_academic_id_foreign` ON `sm_events` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_events_school_id_foreign` ON `sm_events` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holiday_title` text,
	`details` text,
	`from_date` text,
	`to_date` text,
	`upload_image_file` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_holidays_academic_id_foreign` ON `sm_holidays` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_holidays_school_id_foreign` ON `sm_holidays` (`school_id`);--> statement-breakpoint
CREATE TABLE `sm_notice_boards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notice_title` text,
	`notice_message` text,
	`notice_date` text,
	`publish_on` text,
	`inform_to` text,
	`active_status` integer DEFAULT 1 NOT NULL,
	`is_published` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	`created_by` integer DEFAULT 1,
	`updated_by` integer DEFAULT 1,
	`school_id` integer DEFAULT 1,
	`academic_id` integer DEFAULT 1,
	FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON UPDATE restrict ON DELETE cascade,
	FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON UPDATE restrict ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sm_notice_boards_academic_id_foreign` ON `sm_notice_boards` (`academic_id`);--> statement-breakpoint
CREATE INDEX `sm_notice_boards_school_id_foreign` ON `sm_notice_boards` (`school_id`);