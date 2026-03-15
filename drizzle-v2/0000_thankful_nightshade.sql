CREATE TABLE `edx_account_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`account_id` int NOT NULL,
	`address_type` enum('current','permanent','mailing') NOT NULL,
	`address_data` json NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_account_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_account_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`account_id` int NOT NULL,
	`document_type` varchar(50) NOT NULL,
	`title` varchar(191),
	`file_path` varchar(500) NOT NULL,
	`verified_at` timestamp,
	`metadata` json,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_account_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`user_id` int,
	`account_type` enum('student','staff','parent','driver') NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`email` varchar(191),
	`mobile` varchar(100),
	`date_of_birth` date,
	`gender_id` int,
	`photo` varchar(500),
	`metadata` json,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_enumerations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int,
	`domain` varchar(50) NOT NULL,
	`code` varchar(50) NOT NULL,
	`label` varchar(191) NOT NULL,
	`sort_order` int DEFAULT 0,
	`metadata` json,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_enumerations_id` PRIMARY KEY(`id`),
	CONSTRAINT `enum_unique` UNIQUE(`tenant_id`,`domain`,`code`)
);
--> statement-breakpoint
CREATE TABLE `edx_class_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`class_id` int NOT NULL,
	`section_id` int NOT NULL,
	`tenant_id` int NOT NULL,
	`academic_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_class_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`pass_mark` decimal(8,2),
	`academic_id` int NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`account_id` int NOT NULL,
	`class_id` int NOT NULL,
	`section_id` int NOT NULL,
	`academic_id` int NOT NULL,
	`roll_no` varchar(100),
	`is_default` tinyint DEFAULT 1,
	`status` enum('active','promoted','graduated','withdrawn') NOT NULL DEFAULT 'active',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_enrollments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(100),
	`type` enum('theory','practical') NOT NULL,
	`pass_mark` decimal(8,2),
	`academic_id` int NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_exam_marks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`exam_setup_id` int NOT NULL,
	`account_id` int NOT NULL,
	`total_marks` decimal(8,2),
	`is_absent` tinyint NOT NULL DEFAULT 0,
	`teacher_remarks` text,
	`graded_by` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_exam_marks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_exam_setups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`exam_id` int NOT NULL,
	`class_id` int,
	`section_id` int,
	`subject_id` int,
	`exam_mark` decimal(8,2) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_exam_setups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`exam_type` enum('term','continuous','mock','final') NOT NULL,
	`title` varchar(255) NOT NULL,
	`academic_id` int NOT NULL,
	`percentage` decimal(8,2),
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`point` decimal(8,2) NOT NULL,
	`from_mark` decimal(8,2) NOT NULL,
	`to_mark` decimal(8,2) NOT NULL,
	`description` varchar(500),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_grades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_attendances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`account_id` int NOT NULL,
	`actor_type` enum('student','staff') NOT NULL,
	`scope_type` enum('daily','subject','term_summary') NOT NULL,
	`scope_ref_id` int,
	`attendance_date` date,
	`status` enum('present','absent','late','half_day','excused') NOT NULL,
	`metadata` json,
	`recorded_by` int,
	`academic_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_attendances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_content_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`content_type` enum('page','news','event','testimonial','gallery') NOT NULL,
	`slug` varchar(255),
	`title` varchar(500) NOT NULL,
	`body` text,
	`published_status` tinyint NOT NULL DEFAULT 1,
	`author_id` int,
	`metadata` json,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_content_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_communication_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`channel` enum('notification','notice','message','email','sms','chat') NOT NULL,
	`sender_id` int,
	`target_type` enum('person','role','class','section','broadcast') NOT NULL,
	`target_ref_id` int,
	`subject` varchar(500),
	`body` text,
	`metadata` json,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_communication_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`owner_type` varchar(30) NOT NULL,
	`owner_id` int NOT NULL,
	`document_type` varchar(50) NOT NULL,
	`file_path` varchar(500) NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`metadata` json,
	`created_by` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`table_name` varchar(100) NOT NULL,
	`record_id` int NOT NULL,
	`action` enum('INSERT','UPDATE','DELETE') NOT NULL,
	`old_values` json,
	`new_values` json,
	`changed_by` int NOT NULL,
	`changed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `edx_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_domain_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`aggregate_type` varchar(50) NOT NULL,
	`aggregate_id` int NOT NULL,
	`actor_id` int,
	`payload` json NOT NULL,
	`metadata` json,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `edx_domain_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_dormitories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('boys','girls','mixed') NOT NULL,
	`address` varchar(500),
	`intake` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_dormitories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_facility_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`account_id` int NOT NULL,
	`facility_type` enum('transport','dormitory') NOT NULL,
	`facility_ref_id` int NOT NULL,
	`academic_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_facility_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`dormitory_id` int NOT NULL,
	`room_number` varchar(50) NOT NULL,
	`room_type` enum('standard','deluxe','suite') NOT NULL,
	`capacity` int NOT NULL,
	`cost_per_term` decimal(10,2),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_route_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`route_id` int NOT NULL,
	`vehicle_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_route_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`cost` decimal(10,2),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`vehicle_no` varchar(100) NOT NULL,
	`vehicle_model` varchar(100),
	`driver_id` int,
	`capacity` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_fee_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` varchar(500),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_fee_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_fee_masters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`fee_type_id` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`academic_id` int NOT NULL,
	`due_date` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_fee_masters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_fee_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`fee_group_id` int,
	`name` varchar(200) NOT NULL,
	`description` varchar(500),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_fee_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`transaction_type` enum('fee_payment','fee_waiver','salary','expense','income','refund','wallet_topup') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`account_id` int,
	`reference_type` varchar(50),
	`reference_id` int,
	`metadata` json,
	`posted_at` timestamp DEFAULT (now()),
	`created_by` int,
	`academic_id` int,
	CONSTRAINT `edx_ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`department_name` varchar(191) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_designations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`designation_name` varchar(191) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_designations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_leave_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`account_id` int NOT NULL,
	`leave_type` varchar(100) NOT NULL,
	`apply_date` date NOT NULL,
	`from_date` date NOT NULL,
	`to_date` date NOT NULL,
	`reason` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approved_by` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_leave_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_payroll_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`account_id` int NOT NULL,
	`payroll_month` varchar(20) NOT NULL,
	`payroll_year` varchar(20) NOT NULL,
	`basic_salary` decimal(12,2) NOT NULL,
	`total_earnings` decimal(12,2) NOT NULL,
	`total_deductions` decimal(12,2) NOT NULL,
	`net_salary` decimal(12,2) NOT NULL,
	`payment_generated` tinyint DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_payroll_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_book_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`category_name` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_book_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_book_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`book_id` int NOT NULL,
	`account_id` int NOT NULL,
	`issue_date` date NOT NULL,
	`due_date` date NOT NULL,
	`return_date` date,
	`status` enum('issued','returned','overdue') NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_book_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_books` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`category_id` int,
	`title` varchar(255) NOT NULL,
	`author` varchar(255),
	`isbn` varchar(100),
	`quantity` int NOT NULL DEFAULT 1,
	`available` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_books_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_policy_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int,
	`policy_name` varchar(100) NOT NULL,
	`resource` varchar(100) NOT NULL,
	`action` varchar(50) NOT NULL,
	`conditions` json NOT NULL,
	`effect` enum('allow','deny') NOT NULL DEFAULT 'allow',
	`priority` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_policy_definitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_role_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`account_id` int NOT NULL,
	`role_name` varchar(50) NOT NULL,
	`scope` json,
	`valid_from` timestamp DEFAULT (now()),
	`valid_to` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `edx_role_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`domain` varchar(50) NOT NULL,
	`config` json NOT NULL,
	`schema_version` int DEFAULT 1,
	`updated_by` int,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `edx_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_unique` UNIQUE(`tenant_id`,`domain`)
);
--> statement-breakpoint
CREATE TABLE `edx_ai_chats` (
	`id` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`title` varchar(255) NOT NULL,
	`model` varchar(255) NOT NULL,
	`user_id` int unsigned DEFAULT NULL,
	`visibility` varchar(10) NOT NULL DEFAULT 'private',
	CONSTRAINT `edx_ai_chats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_ai_documents` (
	`id` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`kind` varchar(20) NOT NULL DEFAULT 'text',
	`user_id` int unsigned DEFAULT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `edx_ai_documents_id_createdAt_pk` PRIMARY KEY(`id`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `edx_ai_messages` (
	`id` varchar(255) NOT NULL,
	`chatId` varchar(255) NOT NULL,
	`role` varchar(50) NOT NULL,
	`parts` json NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `edx_ai_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_ai_sessions` (
	`id` varchar(255) NOT NULL,
	`user_id` int unsigned NOT NULL,
	`expires_at` datetime DEFAULT NULL,
	`device_fingerprint` varchar(255) DEFAULT NULL,
	CONSTRAINT `edx_ai_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_ai_suggestions` (
	`id` varchar(255) NOT NULL,
	`documentId` varchar(255) NOT NULL,
	`documentCreatedAt` timestamp NOT NULL DEFAULT (now()),
	`originalText` varchar(255) NOT NULL,
	`suggestedText` varchar(255) NOT NULL,
	`description` text,
	`isResolved` boolean NOT NULL DEFAULT false,
	`user_id` int unsigned DEFAULT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `edx_ai_suggestions_id_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edx_ai_votes` (
	`chatId` varchar(255) NOT NULL,
	`messageId` varchar(255) NOT NULL,
	`isUpvoted` boolean NOT NULL,
	CONSTRAINT `edx_ai_votes_chatId_messageId_pk` PRIMARY KEY(`chatId`,`messageId`)
);
--> statement-breakpoint
ALTER TABLE `edx_account_addresses` ADD CONSTRAINT `edx_account_addresses_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_account_documents` ADD CONSTRAINT `edx_account_documents_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_class_sections` ADD CONSTRAINT `edx_class_sections_class_id_edx_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `edx_classes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_class_sections` ADD CONSTRAINT `edx_class_sections_section_id_edx_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `edx_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_enrollments` ADD CONSTRAINT `edx_enrollments_class_id_edx_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `edx_classes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_enrollments` ADD CONSTRAINT `edx_enrollments_section_id_edx_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `edx_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_marks` ADD CONSTRAINT `edx_exam_marks_exam_setup_id_edx_exam_setups_id_fk` FOREIGN KEY (`exam_setup_id`) REFERENCES `edx_exam_setups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_marks` ADD CONSTRAINT `edx_exam_marks_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_marks` ADD CONSTRAINT `edx_exam_marks_graded_by_edx_accounts_id_fk` FOREIGN KEY (`graded_by`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_setups` ADD CONSTRAINT `edx_exam_setups_exam_id_edx_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `edx_exams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_setups` ADD CONSTRAINT `edx_exam_setups_class_id_edx_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `edx_classes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_setups` ADD CONSTRAINT `edx_exam_setups_section_id_edx_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `edx_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_exam_setups` ADD CONSTRAINT `edx_exam_setups_subject_id_edx_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `edx_subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_attendances` ADD CONSTRAINT `edx_attendances_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_content_nodes` ADD CONSTRAINT `edx_content_nodes_author_id_edx_accounts_id_fk` FOREIGN KEY (`author_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_facility_allocations` ADD CONSTRAINT `edx_facility_allocations_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_rooms` ADD CONSTRAINT `edx_rooms_dormitory_id_edx_dormitories_id_fk` FOREIGN KEY (`dormitory_id`) REFERENCES `edx_dormitories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_route_assignments` ADD CONSTRAINT `edx_route_assignments_route_id_edx_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `edx_routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_route_assignments` ADD CONSTRAINT `edx_route_assignments_vehicle_id_edx_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `edx_vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_vehicles` ADD CONSTRAINT `edx_vehicles_driver_id_edx_accounts_id_fk` FOREIGN KEY (`driver_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_fee_masters` ADD CONSTRAINT `edx_fee_masters_fee_type_id_edx_fee_types_id_fk` FOREIGN KEY (`fee_type_id`) REFERENCES `edx_fee_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_fee_types` ADD CONSTRAINT `edx_fee_types_fee_group_id_edx_fee_groups_id_fk` FOREIGN KEY (`fee_group_id`) REFERENCES `edx_fee_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_ledger_entries` ADD CONSTRAINT `edx_ledger_entries_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_leave_requests` ADD CONSTRAINT `edx_leave_requests_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_leave_requests` ADD CONSTRAINT `edx_leave_requests_approved_by_edx_accounts_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_payroll_runs` ADD CONSTRAINT `edx_payroll_runs_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_book_issues` ADD CONSTRAINT `edx_book_issues_book_id_edx_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `edx_books`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_book_issues` ADD CONSTRAINT `edx_book_issues_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_books` ADD CONSTRAINT `edx_books_category_id_edx_book_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `edx_book_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_role_assignments` ADD CONSTRAINT `edx_role_assignments_account_id_edx_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `edx_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_ai_messages` ADD CONSTRAINT `edx_ai_messages_chatId_edx_ai_chats_id_fk` FOREIGN KEY (`chatId`) REFERENCES `edx_ai_chats`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_ai_suggestions` ADD CONSTRAINT `edx_ai_suggestions_doc_fk` FOREIGN KEY (`documentId`,`documentCreatedAt`) REFERENCES `edx_ai_documents`(`id`,`createdAt`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_ai_votes` ADD CONSTRAINT `edx_ai_votes_chatId_edx_ai_chats_id_fk` FOREIGN KEY (`chatId`) REFERENCES `edx_ai_chats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edx_ai_votes` ADD CONSTRAINT `edx_ai_votes_messageId_edx_ai_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `edx_ai_messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `aaddr_account_idx` ON `edx_account_addresses` (`account_id`);--> statement-breakpoint
CREATE INDEX `adoc_account_idx` ON `edx_account_documents` (`account_id`);--> statement-breakpoint
CREATE INDEX `acct_tenant_idx` ON `edx_accounts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `acct_tenant_type_idx` ON `edx_accounts` (`tenant_id`,`account_type`);--> statement-breakpoint
CREATE INDEX `acct_email_idx` ON `edx_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `acct_user_idx` ON `edx_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `enum_domain_idx` ON `edx_enumerations` (`tenant_id`,`domain`);--> statement-breakpoint
CREATE INDEX `clsec_class_sec_idx` ON `edx_class_sections` (`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `cls_tenant_academic_idx` ON `edx_classes` (`tenant_id`,`academic_id`);--> statement-breakpoint
CREATE INDEX `enr_student_academic_idx` ON `edx_enrollments` (`account_id`,`academic_id`);--> statement-breakpoint
CREATE INDEX `enr_tenant_class_idx` ON `edx_enrollments` (`tenant_id`,`class_id`);--> statement-breakpoint
CREATE INDEX `sec_tenant_idx` ON `edx_sections` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `sub_tenant_academic_idx` ON `edx_subjects` (`tenant_id`,`academic_id`);--> statement-breakpoint
CREATE INDEX `mark_exam_student_idx` ON `edx_exam_marks` (`exam_setup_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `exmset_exam_target_idx` ON `edx_exam_setups` (`exam_id`,`class_id`,`subject_id`);--> statement-breakpoint
CREATE INDEX `exam_tenant_academic_idx` ON `edx_exams` (`tenant_id`,`academic_id`);--> statement-breakpoint
CREATE INDEX `att_person_date_idx` ON `edx_attendances` (`account_id`,`attendance_date`);--> statement-breakpoint
CREATE INDEX `att_tenant_date_idx` ON `edx_attendances` (`tenant_id`,`attendance_date`);--> statement-breakpoint
CREATE INDEX `att_tenant_academic_idx` ON `edx_attendances` (`tenant_id`,`academic_id`);--> statement-breakpoint
CREATE INDEX `cms_tenant_type_idx` ON `edx_content_nodes` (`tenant_id`,`content_type`);--> statement-breakpoint
CREATE INDEX `comm_target_idx` ON `edx_communication_events` (`target_type`,`target_ref_id`);--> statement-breakpoint
CREATE INDEX `comm_tenant_idx` ON `edx_communication_events` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `comm_channel_idx` ON `edx_communication_events` (`tenant_id`,`channel`);--> statement-breakpoint
CREATE INDEX `doc_owner_idx` ON `edx_documents` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `doc_tenant_idx` ON `edx_documents` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `audit_record_idx` ON `edx_audit_log` (`table_name`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_tenant_idx` ON `edx_audit_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `evt_aggregate_idx` ON `edx_domain_events` (`aggregate_type`,`aggregate_id`);--> statement-breakpoint
CREATE INDEX `evt_tenant_event_idx` ON `edx_domain_events` (`tenant_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `evt_time_idx` ON `edx_domain_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `fac_alloc_idx` ON `edx_facility_allocations` (`facility_type`,`facility_ref_id`);--> statement-breakpoint
CREATE INDEX `fac_acct_idx` ON `edx_facility_allocations` (`account_id`);--> statement-breakpoint
CREATE INDEX `ledger_tenant_idx` ON `edx_ledger_entries` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `ledger_account_idx` ON `edx_ledger_entries` (`account_id`);--> statement-breakpoint
CREATE INDEX `ledger_type_idx` ON `edx_ledger_entries` (`tenant_id`,`transaction_type`);--> statement-breakpoint
CREATE INDEX `leave_account_idx` ON `edx_leave_requests` (`account_id`);--> statement-breakpoint
CREATE INDEX `pr_acct_period_idx` ON `edx_payroll_runs` (`account_id`,`payroll_month`,`payroll_year`);--> statement-breakpoint
CREATE INDEX `bissue_book_acct_idx` ON `edx_book_issues` (`book_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `book_tenant_cat_idx` ON `edx_books` (`tenant_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `policy_tenant_resource_idx` ON `edx_policy_definitions` (`tenant_id`,`resource`);--> statement-breakpoint
CREATE INDEX `role_account_idx` ON `edx_role_assignments` (`account_id`);--> statement-breakpoint
CREATE INDEX `role_tenant_idx` ON `edx_role_assignments` (`tenant_id`,`role_name`);--> statement-breakpoint
CREATE INDEX `ai_messages_chat_id_idx` ON `edx_ai_messages` (`chatId`);--> statement-breakpoint
CREATE INDEX `ai_messages_chat_id_created_at_idx` ON `edx_ai_messages` (`chatId`,`createdAt`);