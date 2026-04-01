CREATE TABLE `absent_notification_time_setups` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`time_from` varchar(191) DEFAULT NULL,
	`time_to` varchar(191) DEFAULT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `absent_notification_time_setups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admit_card_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_photo` tinyint DEFAULT NULL,
	`student_name` tinyint DEFAULT NULL,
	`admission_no` tinyint DEFAULT NULL,
	`class_section` tinyint DEFAULT NULL,
	`exam_name` tinyint DEFAULT NULL,
	`academic_year` tinyint DEFAULT NULL,
	`principal_signature` tinyint DEFAULT NULL,
	`class_teacher_signature` tinyint DEFAULT NULL,
	`gaurdian_name` tinyint DEFAULT NULL,
	`school_address` tinyint DEFAULT NULL,
	`student_download` tinyint DEFAULT NULL,
	`parent_download` tinyint DEFAULT NULL,
	`student_notification` tinyint DEFAULT NULL,
	`parent_notification` tinyint DEFAULT NULL,
	`principal_signature_photo` varchar(191) DEFAULT NULL,
	`teacher_signature_photo` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`admit_layout` int NOT NULL DEFAULT 1,
	`admit_sub_title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admit_card_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admit_cards` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_record_id` int NOT NULL,
	`exam_type_id` int NOT NULL,
	`created_by` int NOT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admit_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `all_exam_wise_positions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`total_mark` double(8,2) DEFAULT NULL,
	`position` int DEFAULT NULL,
	`roll_no` int DEFAULT NULL,
	`admission_no` int DEFAULT NULL,
	`gpa` double(8,2) DEFAULT NULL,
	`grade` double(8,2) DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`school_id` int NOT NULL,
	`academic_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `all_exam_wise_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assign_incident_comments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int DEFAULT NULL,
	`comment` longtext DEFAULT NULL,
	`incident_id` int NOT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assign_incident_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assign_incidents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`point` int DEFAULT NULL,
	`incident_id` int NOT NULL,
	`record_id` int NOT NULL,
	`student_id` int DEFAULT NULL,
	`added_by` int NOT NULL,
	`academic_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assign_incidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assign_permissions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`permission_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`status` tinyint NOT NULL DEFAULT 1,
	`menu_status` tinyint NOT NULL DEFAULT 1,
	`saas_schools` text DEFAULT NULL,
	`created_by` int NOT NULL DEFAULT 1,
	`updated_by` int NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assign_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `behaviour_record_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_comment` int DEFAULT NULL,
	`parent_comment` int DEFAULT NULL,
	`student_view` int DEFAULT NULL,
	`parent_view` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `behaviour_record_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_block_users` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`block_by` bigint NOT NULL,
	`block_to` bigint NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_block_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`from_id` bigint DEFAULT NULL,
	`to_id` bigint DEFAULT NULL,
	`message` text DEFAULT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`message_type` tinyint NOT NULL DEFAULT 0,
	`file_name` text DEFAULT NULL,
	`original_file_name` text DEFAULT NULL,
	`initial` tinyint NOT NULL DEFAULT 0,
	`reply` bigint DEFAULT NULL,
	`forward` bigint DEFAULT NULL,
	`deleted_by_to` tinyint NOT NULL DEFAULT 0,
	`deleted_at` timestamp DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_group_message_recipients` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`conversation_id` bigint NOT NULL,
	`group_id` varchar(191) NOT NULL,
	`read_at` datetime DEFAULT NULL,
	`deleted_at` timestamp DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_group_message_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_group_message_removes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`group_message_recipient_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_group_message_removes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_group_users` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`group_id` char(36) NOT NULL,
	`user_id` bigint NOT NULL,
	`role` int NOT NULL DEFAULT 1,
	`added_by` bigint NOT NULL,
	`removed_by` bigint DEFAULT NULL,
	`deleted_at` datetime DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_group_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_groups` (
	`id` char(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` varchar(191) DEFAULT NULL,
	`photo_url` varchar(191) DEFAULT NULL,
	`privacy` int DEFAULT NULL,
	`read_only` tinyint NOT NULL DEFAULT 0,
	`group_type` int NOT NULL DEFAULT 1,
	`created_by` bigint NOT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`teacher_id` int DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `chat_invitation_types` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`invitation_id` bigint NOT NULL,
	`type` enum('one-to-one','group','class-teacher') NOT NULL DEFAULT 'one-to-one',
	`section_id` bigint DEFAULT NULL,
	`class_teacher_id` bigint DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_invitation_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_invitations` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`from` int NOT NULL,
	`to` int NOT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_invitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_statuses` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_statuses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `check_classes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `check_classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `class_attendances` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`days_opened` int DEFAULT NULL,
	`days_absent` int DEFAULT NULL,
	`days_present` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_type_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `class_attendances_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_exam_unique` UNIQUE(`student_id`,`exam_type_id`)
);
--> statement-breakpoint
CREATE TABLE `color_theme` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`color_id` bigint DEFAULT NULL,
	`value` varchar(191) DEFAULT NULL,
	`theme_id` bigint DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `color_theme_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `colors` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`is_color` tinyint DEFAULT 1,
	`status` tinyint DEFAULT 1,
	`default_value` varchar(191) DEFAULT NULL,
	`lawn_green` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `colors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comment_pivots` (
	`comment_id` bigint DEFAULT NULL,
	`comment_tag_id` bigint DEFAULT NULL
);
--> statement-breakpoint
CREATE TABLE `comment_tags` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tag` varchar(256) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `comment_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `comment_tags_tag_unique` UNIQUE(`tag`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`text` text NOT NULL,
	`is_flagged` tinyint NOT NULL DEFAULT 0,
	`type` varchar(256) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_share_lists` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`share_date` date DEFAULT NULL,
	`valid_upto` date DEFAULT NULL,
	`description` text DEFAULT NULL,
	`send_type` varchar(191) DEFAULT NULL,
	`content_ids` longtext DEFAULT NULL,
	`gr_role_ids` longtext DEFAULT NULL,
	`ind_user_ids` longtext DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_ids` longtext DEFAULT NULL,
	`url` text DEFAULT NULL,
	`shared_by` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`academic_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	CONSTRAINT `content_share_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_ids` CHECK(json_valid(`content_ids`)),
	CONSTRAINT `gr_role_ids` CHECK(json_valid(`gr_role_ids`)),
	CONSTRAINT `ind_user_ids` CHECK(json_valid(`ind_user_ids`)),
	CONSTRAINT `section_ids` CHECK(json_valid(`section_ids`))
);
--> statement-breakpoint
CREATE TABLE `content_types` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`academic_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	CONSTRAINT `content_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`file_name` varchar(191) DEFAULT NULL,
	`file_size` int DEFAULT NULL,
	`content_type_id` int NOT NULL,
	`youtube_link` varchar(191) DEFAULT NULL,
	`upload_file` varchar(200) DEFAULT NULL,
	`uploaded_by` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`academic_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	CONSTRAINT `contents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `continents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `continents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `continets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(255) DEFAULT NULL,
	`name` varchar(255) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `continets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `countries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`native` varchar(191) NOT NULL,
	`phone` varchar(191) NOT NULL,
	`continent` varchar(191) NOT NULL,
	`capital` varchar(191) NOT NULL,
	`currency` varchar(191) NOT NULL,
	`languages` varchar(191) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `countries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_result_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exam_type_id` int DEFAULT NULL,
	`exam_percentage` double(8,2) DEFAULT NULL,
	`merit_list_setting` varchar(191) NOT NULL,
	`print_status` varchar(191) DEFAULT NULL,
	`profile_image` varchar(191) DEFAULT NULL,
	`header_background` varchar(191) DEFAULT NULL,
	`body_background` varchar(191) DEFAULT NULL,
	`academic_year` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`vertical_boarder` varchar(191) DEFAULT NULL,
	CONSTRAINT `custom_result_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_sms_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`gateway_id` int NOT NULL,
	`gateway_name` varchar(191) NOT NULL,
	`set_auth` varchar(191) DEFAULT NULL,
	`gateway_url` varchar(191) NOT NULL,
	`request_method` varchar(191) NOT NULL,
	`send_to_parameter_name` varchar(191) NOT NULL,
	`messege_to_parameter_name` varchar(191) NOT NULL,
	`param_key_1` varchar(191) DEFAULT NULL,
	`param_value_1` varchar(191) DEFAULT NULL,
	`param_key_2` varchar(191) DEFAULT NULL,
	`param_value_2` varchar(191) DEFAULT NULL,
	`param_key_3` varchar(191) DEFAULT NULL,
	`param_value_3` varchar(191) DEFAULT NULL,
	`param_key_4` varchar(191) DEFAULT NULL,
	`param_value_4` varchar(191) DEFAULT NULL,
	`param_key_5` varchar(191) DEFAULT NULL,
	`param_value_5` varchar(191) DEFAULT NULL,
	`param_key_6` varchar(191) DEFAULT NULL,
	`param_value_6` varchar(191) DEFAULT NULL,
	`param_key_7` varchar(191) DEFAULT NULL,
	`param_value_7` varchar(191) DEFAULT NULL,
	`param_key_8` varchar(191) DEFAULT NULL,
	`param_value_8` varchar(191) DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_sms_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dire_fees_installment_child_payments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`direct_fees_installment_assign_id` int NOT NULL,
	`invoice_no` int NOT NULL DEFAULT 1,
	`amount` double(10,2) DEFAULT NULL,
	`paid_amount` double(10,2) DEFAULT NULL,
	`balance_amount` double(10,2) DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`payment_mode` varchar(100) DEFAULT NULL,
	`note` text DEFAULT NULL,
	`slip` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`bank_id` int DEFAULT NULL,
	`discount_amount` double(10,2),
	`fees_type_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`created_by` int DEFAULT NULL,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dire_fees_installment_child_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `direct_fees_installment_assigns` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`fees_installment_id` int NOT NULL,
	`fees_master_ids` text DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`paid_amount` double(10,2) DEFAULT NULL,
	`due_date` date DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`payment_mode` varchar(100) DEFAULT NULL,
	`note` text DEFAULT NULL,
	`slip` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`assign_ids` text DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`discount_amount` double(10,2),
	`fees_discount_id` int DEFAULT NULL,
	`fees_type_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`collected_by` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_by` int DEFAULT NULL,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `direct_fees_installment_assigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `direct_fees_installments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`fees_master_id` int NOT NULL,
	`percentange` double(8,2) NOT NULL,
	`amount` double(8,2) NOT NULL,
	`due_date` date NOT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `direct_fees_installments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `direct_fees_reminders` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`due_date_before` int NOT NULL,
	`notification_types` varchar(191) NOT NULL,
	`academic_id` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `direct_fees_reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `direct_fees_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`fees_installment` tinyint NOT NULL DEFAULT 0,
	`fees_reminder` tinyint NOT NULL DEFAULT 0,
	`reminder_before` int NOT NULL DEFAULT 5,
	`no_installment` int NOT NULL DEFAULT 0,
	`due_date_from_sem` int NOT NULL DEFAULT 10,
	`end_day` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `direct_fees_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `due_fees_login_prevents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `due_fees_login_prevents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_merit_positions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`exam_term_id` int DEFAULT NULL,
	`total_mark` double DEFAULT NULL,
	`position` int DEFAULT NULL,
	`admission_no` int DEFAULT NULL,
	`gpa` double(8,2) DEFAULT NULL,
	`grade` varchar(191) DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`school_id` int NOT NULL,
	`academic_id` int NOT NULL,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_merit_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_step_skips` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(50) DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_step_skips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `failed_jobs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`uuid` varchar(191) NOT NULL,
	`connection` text NOT NULL,
	`queue` text NOT NULL,
	`payload` longtext NOT NULL,
	`exception` longtext NOT NULL,
	`failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `failed_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `failed_jobs_uuid_unique` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `fees_carry_forward_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_record_id` int NOT NULL,
	`note` text NOT NULL,
	`amount` double(8,2) NOT NULL,
	`amount_type` varchar(191) NOT NULL,
	`created_by` int DEFAULT NULL,
	`updated_by` int DEFAULT NULL,
	`type` varchar(191) NOT NULL,
	`date` timestamp NOT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fees_carry_forward_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fees_carry_forward_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`fees_due_days` int NOT NULL,
	`payment_gateway` varchar(191) NOT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fees_carry_forward_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fees_installment_credits` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`student_record_id` int NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`school_id` int NOT NULL,
	`amount` double(8,2) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fees_installment_credits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fees_invoice_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`per_th` int NOT NULL DEFAULT 2,
	`invoice_type` varchar(191) NOT NULL DEFAULT 'invoice',
	`student_name` tinyint NOT NULL DEFAULT 1,
	`student_section` tinyint NOT NULL DEFAULT 1,
	`student_class` tinyint NOT NULL DEFAULT 1,
	`student_roll` tinyint NOT NULL DEFAULT 1,
	`student_group` tinyint NOT NULL DEFAULT 1,
	`student_admission_no` tinyint NOT NULL DEFAULT 1,
	`footer_1` varchar(255) DEFAULT 'Parent/Student',
	`footer_2` varchar(255) NOT NULL DEFAULT 'Casier',
	`footer_3` varchar(255) NOT NULL DEFAULT 'Officer',
	`signature_p` tinyint NOT NULL DEFAULT 1,
	`signature_c` tinyint NOT NULL DEFAULT 1,
	`signature_o` tinyint NOT NULL DEFAULT 1,
	`c_signature_p` tinyint NOT NULL DEFAULT 1,
	`c_signature_c` tinyint NOT NULL DEFAULT 0,
	`c_signature_o` tinyint NOT NULL DEFAULT 1,
	`copy_s` varchar(255) DEFAULT 'Parent/Student',
	`copy_o` varchar(255) NOT NULL DEFAULT 'Office',
	`copy_c` varchar(255) NOT NULL DEFAULT 'Casier',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`copy_write_msg` text DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `fees_invoice_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fees_invoices` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`prefix` varchar(191) DEFAULT NULL,
	`start_form` int DEFAULT NULL,
	`un_academic_id` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fees_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_groups` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_fees_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_invoice_chields` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`fees_invoice_id` bigint DEFAULT NULL,
	`fees_type` int DEFAULT NULL,
	`amount` double(8,2) DEFAULT NULL,
	`weaver` double(8,2) DEFAULT NULL,
	`fine` double(8,2) DEFAULT NULL,
	`sub_total` double(8,2) DEFAULT NULL,
	`paid_amount` double(8,2) DEFAULT NULL,
	`service_charge` double(8,2) DEFAULT NULL,
	`due_amount` double(8,2) DEFAULT NULL,
	`note` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_fees_invoice_chields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_invoice_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`invoice_positions` text DEFAULT NULL,
	`uniq_id_start` varchar(191) DEFAULT NULL,
	`prefix` varchar(191) DEFAULT NULL,
	`class_limit` int DEFAULT NULL,
	`section_limit` int DEFAULT NULL,
	`admission_limit` int DEFAULT NULL,
	`weaver` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_fees_invoice_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_invoices` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`invoice_id` varchar(191) NOT NULL,
	`student_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`create_date` date DEFAULT NULL,
	`due_date` date DEFAULT NULL,
	`payment_status` varchar(191) DEFAULT NULL,
	`payment_method` varchar(191) DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`type` varchar(191) DEFAULT 'fees',
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`record_id` bigint DEFAULT NULL,
	CONSTRAINT `fm_fees_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_transaction_chields` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`fees_type` varchar(191) DEFAULT NULL,
	`paid_amount` double(8,2) DEFAULT NULL,
	`service_charge` double(8,2) DEFAULT NULL,
	`fine` double(8,2) DEFAULT NULL,
	`weaver` double(8,2) DEFAULT NULL,
	`note` varchar(191) DEFAULT NULL,
	`fees_transaction_id` bigint DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_fees_transaction_chields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_transactions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`invoice_number` varchar(191) DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`payment_method` varchar(191) DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`add_wallet_money` double(8,2) DEFAULT NULL,
	`payment_note` varchar(191) DEFAULT NULL,
	`file` text DEFAULT NULL,
	`paid_status` varchar(191) DEFAULT NULL,
	`fees_invoice_id` bigint DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`service_charge` double(8,2) DEFAULT NULL,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`record_id` bigint DEFAULT NULL,
	`total_paid_amount` varchar(191) DEFAULT NULL,
	CONSTRAINT `fm_fees_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_types` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(230) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`fees_group_id` int DEFAULT 1,
	`type` varchar(191) DEFAULT 'fees',
	`course_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_fees_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_fees_weavers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`fees_invoice_id` bigint DEFAULT NULL,
	`fees_type` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`weaver` double(8,2) DEFAULT NULL,
	`note` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_fees_weavers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `front_academic_calendars` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`publish_date` varchar(191) DEFAULT NULL,
	`calendar_file` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `front_academic_calendars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `front_class_routines` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`publish_date` varchar(191) DEFAULT NULL,
	`result_file` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `front_class_routines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `front_exam_routines` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`publish_date` varchar(191) DEFAULT NULL,
	`result_file` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `front_exam_routines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `front_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`publish_date` varchar(191) DEFAULT NULL,
	`result_file` varchar(191) DEFAULT NULL,
	`link` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `front_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `frontend_exam_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`main_title` varchar(191) DEFAULT NULL,
	`main_description` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`main_image` varchar(191) DEFAULT NULL,
	`button_text` varchar(191) DEFAULT NULL,
	`button_url` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `frontend_exam_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graduates` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`record_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT NULL,
	`un_department_id` int DEFAULT NULL,
	`un_faculty_id` int DEFAULT NULL,
	`graduation_date` int DEFAULT NULL,
	`un_session_id` int DEFAULT 1,
	`school_id` int NOT NULL DEFAULT 1,
	`session_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `graduates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `home_sliders` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`image` varchar(191) NOT NULL,
	`link` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `home_sliders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`point` int DEFAULT NULL,
	`description` text DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infix_module_infos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module_id` int DEFAULT NULL,
	`module_name` varchar(191) DEFAULT NULL,
	`parent_id` int DEFAULT 0,
	`name` varchar(191) DEFAULT NULL,
	`is_saas` tinyint NOT NULL DEFAULT 0,
	`route` varchar(191) DEFAULT NULL,
	`parent_route` varchar(191) DEFAULT NULL,
	`lang_name` varchar(191) DEFAULT NULL,
	`icon_class` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT NULL,
	`type` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `infix_module_infos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infix_module_managers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(200) DEFAULT NULL,
	`email` varchar(200) DEFAULT NULL,
	`notes` varchar(255) DEFAULT NULL,
	`version` varchar(200) DEFAULT NULL,
	`update_url` varchar(200) DEFAULT NULL,
	`purchase_code` varchar(200) DEFAULT NULL,
	`checksum` varchar(200) DEFAULT NULL,
	`installed_domain` varchar(200) DEFAULT NULL,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`addon_url` varchar(191) DEFAULT NULL,
	`activated_date` date DEFAULT NULL,
	`lang_type` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `infix_module_managers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infix_module_student_parent_infos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module_id` int DEFAULT NULL,
	`parent_id` int DEFAULT 0,
	`name` varchar(191) DEFAULT NULL,
	`route` varchar(191) DEFAULT NULL,
	`lang_name` varchar(191) DEFAULT NULL,
	`icon_class` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`type` int DEFAULT NULL,
	`user_type` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`admin_section` varchar(191) DEFAULT NULL,
	CONSTRAINT `infix_module_student_parent_infos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infix_permission_assigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`module_id` int DEFAULT NULL,
	`module_info` varchar(191) DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`saas_schools` text DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `infix_permission_assigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infix_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) DEFAULT NULL,
	`type` varchar(191) NOT NULL DEFAULT 'System',
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` varchar(191) DEFAULT '1',
	`updated_by` varchar(191) DEFAULT '1',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`is_saas` int DEFAULT 0,
	CONSTRAINT `infix_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infixedu__pages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text DEFAULT NULL,
	`slug` varchar(191) DEFAULT NULL,
	`settings` longtext DEFAULT NULL,
	`home_page` tinyint DEFAULT 0,
	`is_default` tinyint DEFAULT 0,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`created_by` int DEFAULT NULL,
	`updated_by` int DEFAULT NULL,
	`published_by` int DEFAULT NULL,
	`school_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `infixedu__pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infixedu__settings` (
	`section` varchar(191) NOT NULL,
	`key` varchar(191) NOT NULL,
	`value` text DEFAULT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`per_th` int NOT NULL DEFAULT 2,
	`prefix` varchar(191) DEFAULT NULL,
	`student_name` tinyint NOT NULL DEFAULT 1,
	`student_section` tinyint NOT NULL DEFAULT 1,
	`student_class` tinyint NOT NULL DEFAULT 1,
	`student_roll` tinyint NOT NULL DEFAULT 1,
	`student_group` tinyint NOT NULL DEFAULT 1,
	`student_admission_no` tinyint NOT NULL DEFAULT 1,
	`footer_1` varchar(255) DEFAULT 'Parent/Student',
	`footer_2` varchar(255) NOT NULL DEFAULT 'Casier',
	`footer_3` varchar(255) NOT NULL DEFAULT 'Officer',
	`signature_p` tinyint NOT NULL DEFAULT 1,
	`signature_c` tinyint NOT NULL DEFAULT 1,
	`signature_o` tinyint NOT NULL DEFAULT 1,
	`c_signature_p` tinyint NOT NULL DEFAULT 1,
	`c_signature_c` tinyint NOT NULL DEFAULT 0,
	`c_signature_o` tinyint NOT NULL DEFAULT 1,
	`copy_s` varchar(255) DEFAULT 'Parent/Student',
	`copy_o` varchar(255) NOT NULL DEFAULT 'Office',
	`copy_c` varchar(255) NOT NULL DEFAULT 'Casier',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`copy_write_msg` text DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `invoice_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`queue` varchar(191) NOT NULL,
	`payload` longtext NOT NULL,
	`attempts` tinyint NOT NULL,
	`reserved_at` int DEFAULT NULL,
	`available_at` int NOT NULL,
	`created_at` int NOT NULL,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `languages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`native` varchar(191) NOT NULL,
	`rtl` tinyint NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`school_id` int DEFAULT 1,
	CONSTRAINT `languages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_objectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`objectives` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`exam_type_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `learning_objectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_plan_topics` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sub_topic_title` varchar(191) NOT NULL,
	`topic_id` int DEFAULT NULL,
	`lesson_planner_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lesson_plan_topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_planners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lesson_id` int DEFAULT NULL,
	`topic_id` int DEFAULT NULL,
	`lesson_detail_id` int NOT NULL,
	`topic_detail_id` int DEFAULT NULL,
	`sub_topic` varchar(191) DEFAULT NULL,
	`lecture_youube_link` text DEFAULT NULL,
	`lecture_vedio` text DEFAULT NULL,
	`attachment` text DEFAULT NULL,
	`teaching_method` text DEFAULT NULL,
	`general_objectives` text DEFAULT NULL,
	`previous_knowlege` text DEFAULT NULL,
	`comp_question` text DEFAULT NULL,
	`zoom_setup` text DEFAULT NULL,
	`presentation` text DEFAULT NULL,
	`note` text DEFAULT NULL,
	`lesson_date` date NOT NULL,
	`competed_date` date DEFAULT NULL,
	`completed_status` varchar(191) DEFAULT NULL,
	`room_id` int DEFAULT NULL,
	`teacher_id` int DEFAULT NULL,
	`class_period_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`routine_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `lesson_planners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `library_subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subject_name` varchar(255) NOT NULL,
	`sb_category_id` varchar(255) DEFAULT NULL,
	`subject_code` varchar(255) DEFAULT NULL,
	`subject_type` varchar(191) NOT NULL DEFAULT 'T',
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `library_subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT 'We will be back soon!',
	`sub_title` varchar(191) DEFAULT '''Sorry for the inconvenience but we are performing some maintenance at the moment.''',
	`image` varchar(191) DEFAULT NULL,
	`applicable_for` varchar(191) DEFAULT NULL,
	`maintenance_mode` tinyint DEFAULT 0,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `migrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`migration` varchar(191) NOT NULL,
	`batch` int NOT NULL,
	CONSTRAINT `migrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`verification_token` varchar(191) DEFAULT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`verified_at` timestamp DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `newsletters_id` PRIMARY KEY(`id`),
	CONSTRAINT `newsletters_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`type` varchar(191) NOT NULL,
	`notifiable_type` varchar(191) NOT NULL,
	`notifiable_id` bigint NOT NULL,
	`data` text NOT NULL,
	`read_at` timestamp DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `oauth_access_tokens` (
	`id` varchar(191) NOT NULL,
	`user_id` bigint DEFAULT NULL,
	`client_id` int NOT NULL,
	`name` varchar(100) DEFAULT NULL,
	`scopes` varchar(100) DEFAULT NULL,
	`revoked` varchar(100) NOT NULL,
	`expires_at` datetime DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `oauth_auth_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`client_id` int NOT NULL,
	`scopes` text DEFAULT NULL,
	`revoked` tinyint NOT NULL,
	`expires_at` datetime DEFAULT NULL,
	CONSTRAINT `oauth_auth_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` bigint DEFAULT NULL,
	`provider` varchar(191) DEFAULT NULL,
	`name` varchar(191) NOT NULL,
	`secret` varchar(200) NOT NULL,
	`redirect` text NOT NULL,
	`personal_access_client` tinyint NOT NULL,
	`password_client` tinyint NOT NULL,
	`revoked` tinyint NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_personal_access_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_personal_access_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_refresh_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`access_token_id` bigint DEFAULT NULL,
	`revoked` tinyint NOT NULL,
	`expires_at` datetime DEFAULT NULL,
	CONSTRAINT `oauth_refresh_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `online_exam_student_answer_markings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`online_exam_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`question_id` int DEFAULT NULL,
	`user_answer` varchar(191) DEFAULT NULL,
	`answer_status` varchar(191) DEFAULT NULL,
	`obtain_marks` int DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`marked_by` int NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `online_exam_student_answer_markings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`email` varchar(100) NOT NULL,
	`token` varchar(191) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `payroll_payments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sm_hr_payroll_generate_id` int DEFAULT NULL,
	`amount` double DEFAULT NULL,
	`payment_mode` varchar(191) DEFAULT NULL,
	`payment_method_id` int DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`note` varchar(200) DEFAULT NULL,
	`created_by` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permission_sections` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`position` int NOT NULL DEFAULT 9999,
	`user_id` int NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`saas` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permission_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`module` varchar(191) DEFAULT NULL,
	`sidebar_menu` varchar(191) DEFAULT NULL,
	`old_id` int DEFAULT NULL,
	`section_id` int DEFAULT 1,
	`parent_id` int DEFAULT 0,
	`name` varchar(191) DEFAULT NULL,
	`route` varchar(191) DEFAULT NULL,
	`parent_route` varchar(191) DEFAULT NULL,
	`type` int DEFAULT NULL,
	`lang_name` varchar(191) DEFAULT NULL,
	`icon` text DEFAULT NULL,
	`svg` text DEFAULT NULL,
	`status` tinyint NOT NULL DEFAULT 1,
	`menu_status` tinyint NOT NULL DEFAULT 1,
	`position` int NOT NULL DEFAULT 1,
	`is_saas` tinyint NOT NULL DEFAULT 0,
	`relate_to_child` tinyint DEFAULT 0,
	`is_menu` tinyint DEFAULT NULL,
	`is_admin` tinyint DEFAULT 0,
	`is_teacher` tinyint DEFAULT 0,
	`is_student` tinyint DEFAULT 0,
	`is_parent` tinyint DEFAULT 0,
	`is_alumni` tinyint DEFAULT 0,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`permission_section` tinyint DEFAULT NULL,
	`alternate_module` varchar(191) DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`school_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_access_tokens` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tokenable_type` varchar(191) NOT NULL,
	`tokenable_id` bigint NOT NULL,
	`name` varchar(191) NOT NULL,
	`token` varchar(64) NOT NULL,
	`abilities` text DEFAULT NULL,
	`last_used_at` timestamp DEFAULT NULL,
	`expires_at` timestamp DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `personal_access_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`is_enable` tinyint NOT NULL DEFAULT 0,
	`availability` varchar(191) NOT NULL DEFAULT 'both',
	`show_admin_panel` tinyint NOT NULL DEFAULT 0,
	`show_website` tinyint NOT NULL DEFAULT 1,
	`showing_page` varchar(191) NOT NULL DEFAULT 'all',
	`applicable_for` varchar(191) DEFAULT NULL,
	`position` varchar(191) DEFAULT NULL,
	`short_code` varchar(50) DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plugins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) DEFAULT NULL,
	`type` varchar(191) NOT NULL DEFAULT 'System',
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` varchar(191) DEFAULT '1',
	`updated_by` varchar(191) DEFAULT '1',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `school_modules` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`modules` longtext DEFAULT NULL,
	`menus` longtext DEFAULT NULL,
	`module_name` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`updated_by` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `school_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seat_plan_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`school_name` tinyint DEFAULT NULL,
	`student_photo` tinyint DEFAULT NULL,
	`student_name` tinyint DEFAULT NULL,
	`admission_no` tinyint DEFAULT NULL,
	`class_section` tinyint DEFAULT NULL,
	`exam_name` tinyint DEFAULT NULL,
	`roll_no` tinyint DEFAULT NULL,
	`academic_year` tinyint DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seat_plan_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seat_plans` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_record_id` int NOT NULL,
	`exam_type_id` int NOT NULL,
	`created_by` int NOT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seat_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sidebars` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`permission_id` int DEFAULT NULL,
	`position` int DEFAULT NULL,
	`section_id` int DEFAULT 1,
	`parent` int DEFAULT NULL,
	`parent_route` int DEFAULT NULL,
	`level` int DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`is_saas` tinyint NOT NULL DEFAULT 0,
	`ignore` int NOT NULL DEFAULT 0,
	`role_id` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sidebars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_about_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`main_title` varchar(191) DEFAULT NULL,
	`main_description` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`main_image` varchar(191) DEFAULT NULL,
	`button_text` varchar(191) DEFAULT NULL,
	`button_url` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_about_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_academic_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` varchar(200) NOT NULL,
	`title` varchar(200) NOT NULL,
	`starting_date` date NOT NULL,
	`ending_date` date NOT NULL,
	`copy_with_academic_year` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` varchar(191) DEFAULT NULL,
	`updated_at` varchar(191) DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_academic_years_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_add_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`item_receive_id` int DEFAULT NULL,
	`inventory_id` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`expense_head_id` int DEFAULT NULL,
	`account_id` int DEFAULT NULL,
	`payment_method_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`payroll_payment_id` int DEFAULT NULL,
	CONSTRAINT `sm_add_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_add_incomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`item_sell_id` int DEFAULT NULL,
	`fees_collection_id` int DEFAULT NULL,
	`inventory_id` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`income_head_id` int DEFAULT NULL,
	`account_id` int DEFAULT NULL,
	`payment_method_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`installment_payment_id` int DEFAULT NULL,
	CONSTRAINT `sm_add_incomes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_add_ons` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_add_ons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_admission_queries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`phone` varchar(191) DEFAULT NULL,
	`email` varchar(191) DEFAULT NULL,
	`address` text DEFAULT NULL,
	`description` text DEFAULT NULL,
	`date` date DEFAULT NULL,
	`follow_up_date` date DEFAULT NULL,
	`next_follow_up_date` date DEFAULT NULL,
	`assigned` varchar(191) DEFAULT NULL,
	`reference` int DEFAULT NULL,
	`source` int DEFAULT NULL,
	`no_of_child` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_admission_queries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_admission_query_followups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`response` text DEFAULT NULL,
	`note` text DEFAULT NULL,
	`date` date DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`admission_query_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_admission_query_followups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_amount_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`amount` int DEFAULT NULL,
	`purpose` varchar(191) DEFAULT NULL,
	`from_payment_method` int DEFAULT NULL,
	`from_bank_name` int DEFAULT NULL,
	`to_payment_method` int DEFAULT NULL,
	`to_bank_name` int DEFAULT NULL,
	`transfer_date` date DEFAULT NULL,
	`active_status` tinyint DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_amount_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_assign_class_teachers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_assign_class_teachers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_assign_subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`teacher_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`parent_id` int DEFAULT NULL,
	CONSTRAINT `sm_assign_subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_assign_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`vehicle_id` int DEFAULT NULL,
	`route_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_assign_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_background_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) DEFAULT NULL,
	`type` varchar(255) DEFAULT NULL,
	`image` varchar(255) DEFAULT NULL,
	`color` varchar(255) DEFAULT NULL,
	`is_default` int NOT NULL DEFAULT 0,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_background_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_name` varchar(255) DEFAULT NULL,
	`source_link` varchar(255) DEFAULT NULL,
	`file_type` tinyint DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`lang_type` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_backups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bank_name` varchar(191) DEFAULT NULL,
	`account_name` varchar(191) DEFAULT NULL,
	`account_number` varchar(191) DEFAULT NULL,
	`account_type` varchar(191) DEFAULT NULL,
	`opening_balance` double NOT NULL,
	`current_balance` double NOT NULL,
	`note` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_bank_payment_slips` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`slip` varchar(191) DEFAULT NULL,
	`note` text DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`approve_status` tinyint NOT NULL DEFAULT 0,
	`payment_mode` varchar(191) NOT NULL,
	`reason` text DEFAULT NULL,
	`fees_discount_id` int DEFAULT NULL,
	`fees_type_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`assign_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`child_payment_id` int DEFAULT NULL,
	`installment_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active_status` int DEFAULT 1,
	CONSTRAINT `sm_bank_payment_slips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_bank_statements` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`bank_id` int DEFAULT NULL,
	`after_balance` int DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`type` varchar(11) DEFAULT NULL,
	`payment_method` int DEFAULT NULL,
	`details` varchar(500) DEFAULT NULL,
	`item_receive_id` int DEFAULT NULL,
	`item_receive_bank_statement_id` int DEFAULT NULL,
	`item_sell_bank_statement_id` int DEFAULT NULL,
	`item_sell_id` int DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`fees_payment_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`payroll_payment_id` int DEFAULT NULL,
	CONSTRAINT `sm_bank_statements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_base_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_base_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_base_setups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`base_setup_name` varchar(255) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`base_group_id` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_base_setups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_book_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(200) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_book_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_book_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quantity` int DEFAULT NULL,
	`given_date` date DEFAULT NULL,
	`due_date` date DEFAULT NULL,
	`issue_status` varchar(191) DEFAULT NULL,
	`note` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`book_id` int DEFAULT NULL,
	`member_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_book_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_books` (
	`id` int AUTO_INCREMENT NOT NULL,
	`book_title` varchar(200) DEFAULT NULL,
	`book_number` varchar(200) DEFAULT NULL,
	`isbn_no` varchar(200) DEFAULT NULL,
	`publisher_name` varchar(200) DEFAULT NULL,
	`author_name` varchar(200) DEFAULT NULL,
	`rack_number` varchar(50) DEFAULT NULL,
	`quantity` int DEFAULT 0,
	`book_price` int DEFAULT NULL,
	`post_date` date DEFAULT NULL,
	`details` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`book_subject_id` int DEFAULT NULL,
	`book_category_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_books_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_calendar_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`menu_name` varchar(191) NOT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`font_color` varchar(191) NOT NULL,
	`bg_color` varchar(191) NOT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_calendar_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_chart_of_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`head` varchar(200) DEFAULT NULL,
	`type` varchar(1) DEFAULT NULL,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_chart_of_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_exam_routine_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`main_title` varchar(191) DEFAULT NULL,
	`main_description` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`main_image` varchar(191) DEFAULT NULL,
	`button_text` varchar(191) DEFAULT NULL,
	`button_url` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`is_parent` tinyint NOT NULL DEFAULT 1,
	`class_routine` varchar(191) NOT NULL DEFAULT 'show',
	`exam_routine` varchar(191) NOT NULL DEFAULT 'show',
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_class_exam_routine_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_optional_subject` (
	`id` int AUTO_INCREMENT NOT NULL,
	`class_id` int NOT NULL,
	`gpa_above` double(8,2) NOT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_class_optional_subject_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`room_no` varchar(50) DEFAULT NULL,
	`capacity` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_class_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_routine_updates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`start_time` time DEFAULT NULL,
	`end_time` time DEFAULT NULL,
	`is_break` tinyint DEFAULT NULL,
	`room_id` int DEFAULT NULL,
	`teacher_id` int DEFAULT NULL,
	`class_period_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_class_routine_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_routines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monday` varchar(200) DEFAULT NULL,
	`monday_start_from` varchar(200) DEFAULT NULL,
	`monday_end_to` varchar(200) DEFAULT NULL,
	`monday_room_id` int DEFAULT NULL,
	`tuesday` varchar(200) DEFAULT NULL,
	`tuesday_start_from` varchar(200) DEFAULT NULL,
	`tuesday_end_to` varchar(200) DEFAULT NULL,
	`tuesday_room_id` int DEFAULT NULL,
	`wednesday` varchar(200) DEFAULT NULL,
	`wednesday_start_from` varchar(200) DEFAULT NULL,
	`wednesday_end_to` varchar(200) DEFAULT NULL,
	`wednesday_room_id` int DEFAULT NULL,
	`thursday` varchar(200) DEFAULT NULL,
	`thursday_start_from` varchar(200) DEFAULT NULL,
	`thursday_end_to` varchar(200) DEFAULT NULL,
	`thursday_room_id` int DEFAULT NULL,
	`friday` varchar(200) DEFAULT NULL,
	`friday_start_from` varchar(200) DEFAULT NULL,
	`friday_end_to` varchar(200) DEFAULT NULL,
	`friday_room_id` int DEFAULT NULL,
	`saturday` varchar(200) DEFAULT NULL,
	`saturday_start_from` varchar(200) DEFAULT NULL,
	`saturday_end_to` varchar(200) DEFAULT NULL,
	`saturday_room_id` int DEFAULT NULL,
	`sunday` varchar(200) DEFAULT NULL,
	`sunday_start_from` varchar(200) DEFAULT NULL,
	`sunday_end_to` varchar(200) DEFAULT NULL,
	`sunday_room_id` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_class_routines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`parent_id` int DEFAULT NULL,
	CONSTRAINT `sm_class_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_teachers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`teacher_id` int DEFAULT NULL,
	`assign_class_teacher_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_class_teachers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_class_times` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('exam','class') DEFAULT NULL,
	`period` varchar(191) DEFAULT NULL,
	`start_time` time DEFAULT NULL,
	`end_time` time DEFAULT NULL,
	`is_break` tinyint DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_class_times_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`class_name` varchar(200) NOT NULL,
	`pass_mark` double(8,2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`parent_id` int DEFAULT NULL,
	CONSTRAINT `sm_classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_complaints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`complaint_by` varchar(191) DEFAULT NULL,
	`complaint_type` tinyint DEFAULT NULL,
	`complaint_source` tinyint DEFAULT NULL,
	`phone` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`description` text DEFAULT NULL,
	`action_taken` varchar(191) DEFAULT NULL,
	`assigned` varchar(191) DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_complaints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_contact_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`phone` varchar(191) DEFAULT NULL,
	`email` varchar(191) DEFAULT NULL,
	`subject` varchar(191) DEFAULT NULL,
	`message` text DEFAULT NULL,
	`view_status` tinyint NOT NULL DEFAULT 0,
	`reply_status` tinyint NOT NULL DEFAULT 0,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_contact_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`button_text` varchar(191) DEFAULT NULL,
	`button_url` varchar(191) DEFAULT NULL,
	`address` varchar(191) DEFAULT NULL,
	`address_text` varchar(191) DEFAULT NULL,
	`phone` varchar(191) DEFAULT NULL,
	`phone_text` varchar(191) DEFAULT NULL,
	`email` varchar(191) DEFAULT NULL,
	`email_text` varchar(191) DEFAULT NULL,
	`latitude` varchar(191) DEFAULT NULL,
	`longitude` varchar(191) DEFAULT NULL,
	`zoom_level` int DEFAULT NULL,
	`google_map_address` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_contact_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_content_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type_name` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_content_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_countries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(255) DEFAULT NULL,
	`name` varchar(255) DEFAULT NULL,
	`native` varchar(255) DEFAULT NULL,
	`phone` varchar(255) DEFAULT NULL,
	`continent` varchar(255) DEFAULT NULL,
	`capital` varchar(255) DEFAULT NULL,
	`currency` varchar(255) DEFAULT NULL,
	`languages` varchar(255) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_countries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_course_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(191) DEFAULT NULL,
	`category_image` text DEFAULT NULL,
	`school_id` bigint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_course_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_course_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`main_title` varchar(191) DEFAULT NULL,
	`main_description` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`main_image` varchar(191) DEFAULT NULL,
	`button_text` varchar(191) DEFAULT NULL,
	`button_url` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`is_parent` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_course_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`image` text NOT NULL,
	`category_id` int NOT NULL,
	`overview` text DEFAULT NULL,
	`outline` text DEFAULT NULL,
	`prerequisites` text DEFAULT NULL,
	`resources` text DEFAULT NULL,
	`stats` text DEFAULT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_courses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_currencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`code` varchar(191) DEFAULT NULL,
	`symbol` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`currency_type` varchar(2) DEFAULT '2',
	`currency_position` varchar(2) DEFAULT '2',
	`space` tinyint DEFAULT 1,
	`decimal_digit` int DEFAULT NULL,
	`decimal_separator` varchar(1) DEFAULT NULL,
	`thousand_separator` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_currencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_custom_fields` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`form_name` varchar(191) NOT NULL,
	`label` varchar(191) NOT NULL,
	`type` varchar(191) NOT NULL,
	`min_max_length` varchar(191) DEFAULT NULL,
	`min_max_value` varchar(191) DEFAULT NULL,
	`name_value` varchar(191) DEFAULT NULL,
	`width` varchar(191) DEFAULT NULL,
	`required` tinyint DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_custom_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_custom_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title1` varchar(255) DEFAULT NULL,
	`title2` varchar(255) DEFAULT NULL,
	`title3` varchar(255) DEFAULT NULL,
	`title4` varchar(255) DEFAULT NULL,
	`link_label1` varchar(255) DEFAULT NULL,
	`link_href1` varchar(255) DEFAULT NULL,
	`link_label2` varchar(255) DEFAULT NULL,
	`link_href2` varchar(255) DEFAULT NULL,
	`link_label3` varchar(255) DEFAULT NULL,
	`link_href3` varchar(255) DEFAULT NULL,
	`link_label4` varchar(255) DEFAULT NULL,
	`link_href4` varchar(255) DEFAULT NULL,
	`link_label5` varchar(255) DEFAULT NULL,
	`link_href5` varchar(255) DEFAULT NULL,
	`link_label6` varchar(255) DEFAULT NULL,
	`link_href6` varchar(255) DEFAULT NULL,
	`link_label7` varchar(255) DEFAULT NULL,
	`link_href7` varchar(255) DEFAULT NULL,
	`link_label8` varchar(255) DEFAULT NULL,
	`link_href8` varchar(255) DEFAULT NULL,
	`link_label9` varchar(255) DEFAULT NULL,
	`link_href9` varchar(255) DEFAULT NULL,
	`link_label10` varchar(255) DEFAULT NULL,
	`link_href10` varchar(255) DEFAULT NULL,
	`link_label11` varchar(255) DEFAULT NULL,
	`link_href11` varchar(255) DEFAULT NULL,
	`link_label12` varchar(255) DEFAULT NULL,
	`link_href12` varchar(255) DEFAULT NULL,
	`link_label13` varchar(255) DEFAULT NULL,
	`link_href13` varchar(255) DEFAULT NULL,
	`link_label14` varchar(255) DEFAULT NULL,
	`link_href14` varchar(255) DEFAULT NULL,
	`link_label15` varchar(255) DEFAULT NULL,
	`link_href15` varchar(255) DEFAULT NULL,
	`link_label16` varchar(255) DEFAULT NULL,
	`link_href16` varchar(255) DEFAULT NULL,
	`facebook_url` varchar(255) DEFAULT NULL,
	`twitter_url` varchar(255) DEFAULT NULL,
	`dribble_url` varchar(255) DEFAULT NULL,
	`linkedin_url` varchar(255) DEFAULT NULL,
	`behance_url` varchar(255) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_custom_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_custom_temporary_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int DEFAULT NULL,
	`admission_no` varchar(200) DEFAULT NULL,
	`full_name` varchar(200) DEFAULT NULL,
	`term1` varchar(200) DEFAULT NULL,
	`gpa1` varchar(200) DEFAULT NULL,
	`term2` varchar(200) DEFAULT NULL,
	`gpa2` varchar(200) DEFAULT NULL,
	`term3` varchar(200) DEFAULT NULL,
	`gpa3` varchar(200) DEFAULT NULL,
	`final_result` varchar(200) DEFAULT NULL,
	`final_grade` varchar(200) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_custom_temporary_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_dashboard_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dashboard_sec_id` int NOT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`role_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_dashboard_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_date_formats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`format` varchar(191) DEFAULT NULL,
	`normal_view` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_date_formats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_designations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`is_saas` int DEFAULT 0,
	CONSTRAINT `sm_designations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_donors` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`full_name` varchar(200) DEFAULT NULL,
	`profession` varchar(200) DEFAULT NULL,
	`date_of_birth` date DEFAULT NULL,
	`email` varchar(200) DEFAULT NULL,
	`mobile` varchar(200) DEFAULT NULL,
	`photo` varchar(191) DEFAULT NULL,
	`age` varchar(200) DEFAULT NULL,
	`current_address` varchar(500) DEFAULT NULL,
	`permanent_address` varchar(500) DEFAULT NULL,
	`show_public` tinyint NOT NULL DEFAULT 1,
	`custom_field` text DEFAULT NULL,
	`custom_field_form_name` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`bloodgroup_id` int DEFAULT NULL,
	`religion_id` int DEFAULT NULL,
	`gender_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_donors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_dormitory_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dormitory_name` varchar(200) NOT NULL,
	`type` varchar(191) NOT NULL,
	`address` varchar(191) DEFAULT NULL,
	`intake` int DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_dormitory_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_email_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email_engine_type` varchar(191) DEFAULT NULL,
	`from_name` varchar(191) DEFAULT NULL,
	`from_email` varchar(191) DEFAULT NULL,
	`mail_driver` varchar(191) DEFAULT NULL,
	`mail_host` varchar(191) DEFAULT NULL,
	`mail_port` varchar(191) DEFAULT NULL,
	`mail_username` varchar(191) DEFAULT NULL,
	`mail_password` varchar(191) DEFAULT NULL,
	`mail_encryption` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_email_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_email_sms_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`description` varchar(191) DEFAULT NULL,
	`gmail_message_id` varchar(191) DEFAULT NULL,
	`delivery_status` enum('sent','delivered','read','bounced','failed') NOT NULL DEFAULT 'sent',
	`send_date` date DEFAULT NULL,
	`send_through` varchar(191) DEFAULT NULL,
	`send_to` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_email_sms_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_title` varchar(200) DEFAULT NULL,
	`for_whom` varchar(200) DEFAULT NULL,
	`role_ids` text DEFAULT NULL,
	`url` text DEFAULT NULL,
	`event_location` varchar(200) DEFAULT NULL,
	`event_des` varchar(500) DEFAULT NULL,
	`from_date` date DEFAULT NULL,
	`to_date` date DEFAULT NULL,
	`uplad_image_file` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_attendance_children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendance_type` varchar(2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_attendance_id` int DEFAULT NULL,
	`student_record_id` bigint DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_attendance_children_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_attendances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`subject_id` int DEFAULT NULL,
	`exam_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_attendances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_marks_registers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`obtained_marks` varchar(200) DEFAULT NULL,
	`exam_date` date DEFAULT NULL,
	`comments` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_id` int NOT NULL,
	`student_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_marks_registers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_schedule_subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date DEFAULT NULL,
	`start_time` varchar(200) DEFAULT NULL,
	`end_time` varchar(200) DEFAULT NULL,
	`room` varchar(200) DEFAULT NULL,
	`full_mark` int DEFAULT NULL,
	`pass_mark` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_schedule_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_schedule_subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_period_id` int DEFAULT NULL,
	`room_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`exam_term_id` int DEFAULT NULL,
	`exam_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`start_time` time DEFAULT NULL,
	`end_time` time DEFAULT NULL,
	`teacher_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exam_type` int DEFAULT NULL,
	`title` varchar(191) DEFAULT NULL,
	`publish_date` date DEFAULT NULL,
	`start_date` date DEFAULT NULL,
	`end_date` date DEFAULT NULL,
	`file` varchar(200) DEFAULT NULL,
	`active_status` tinyint DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_setups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exam_title` varchar(255) DEFAULT NULL,
	`exam_mark` double(8,2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`exam_term_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exam_setups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_signatures` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`signature` text NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_exam_signatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exam_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`title` varchar(255) NOT NULL,
	`is_average` tinyint NOT NULL DEFAULT 0,
	`percentage` double(8,2) DEFAULT NULL,
	`average_mark` double(8,2) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`parent_id` int DEFAULT 0,
	`percantage` double(8,2) DEFAULT 100,
	CONSTRAINT `sm_exam_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int DEFAULT 0,
	`exam_mark` double(8,2) DEFAULT NULL,
	`pass_mark` double(8,2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_type_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_expense_heads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_expense_heads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_expert_teachers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`staff_id` tinyint NOT NULL,
	`created_by` tinyint DEFAULT NULL,
	`updated_by` tinyint DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `sm_expert_teachers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_assign_discounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`fees_discount_id` int DEFAULT NULL,
	`fees_type_id` int DEFAULT NULL,
	`fees_group_id` int DEFAULT NULL,
	`applied_amount` double,
	`unapplied_amount` double DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_fees_assign_discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_assigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`fees_amount` double(10,2) DEFAULT NULL,
	`applied_discount` double(10,2) DEFAULT NULL,
	`fees_master_id` int DEFAULT NULL,
	`fees_discount_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	CONSTRAINT `sm_fees_assigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_carry_forwards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`balance` double(16,2) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`notes` varchar(191) NOT NULL DEFAULT 'Fees Carry Forward',
	`balance_type` varchar(191) DEFAULT NULL,
	`due_date` timestamp DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_fees_carry_forwards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_discounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) DEFAULT NULL,
	`code` varchar(200) DEFAULT NULL,
	`type` enum('once','year') DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`record_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_fees_discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) DEFAULT NULL,
	`type` varchar(200) DEFAULT NULL,
	`start_date` date DEFAULT NULL,
	`end_date` date DEFAULT NULL,
	`due_date` date DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`un_semester_label_id` int DEFAULT NULL,
	CONSTRAINT `sm_fees_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_masters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`fees_group_id` int DEFAULT NULL,
	`fees_type_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`un_semester_label_id` int DEFAULT NULL,
	CONSTRAINT `sm_fees_masters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discount_month` tinyint DEFAULT NULL,
	`discount_amount` double(8,2) DEFAULT NULL,
	`fine` double(8,2) DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`payment_mode` varchar(100) DEFAULT NULL,
	`note` text DEFAULT NULL,
	`slip` varchar(191) DEFAULT NULL,
	`fine_title` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`assign_id` int DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`fees_discount_id` int DEFAULT NULL,
	`fees_type_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`direct_fees_installment_assign_id` int DEFAULT NULL,
	`installment_payment_id` int DEFAULT NULL,
	CONSTRAINT `sm_fees_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_fees_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(230) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`fees_group_id` int DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`un_semester_label_id` int DEFAULT NULL,
	CONSTRAINT `sm_fees_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_form_downloads` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`short_description` varchar(200) DEFAULT NULL,
	`publish_date` date DEFAULT NULL,
	`link` varchar(191) DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`show_public` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_form_downloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_frontend_persmissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) DEFAULT NULL,
	`parent_id` int NOT NULL DEFAULT 0,
	`is_published` int NOT NULL DEFAULT 0,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_frontend_persmissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_general_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_name` varchar(191) DEFAULT NULL,
	`site_title` varchar(191) DEFAULT NULL,
	`school_code` varchar(191) DEFAULT NULL,
	`address` varchar(191) DEFAULT NULL,
	`phone` varchar(191) DEFAULT NULL,
	`email` varchar(191) DEFAULT NULL,
	`file_size` varchar(191) NOT NULL DEFAULT '102400',
	`currency` varchar(191) DEFAULT 'USD',
	`currency_symbol` varchar(191) DEFAULT '$',
	`currency_format` varchar(191) DEFAULT '''symbol_amount''',
	`promotionSetting` int DEFAULT 0,
	`logo` varchar(191) DEFAULT NULL,
	`favicon` varchar(191) DEFAULT NULL,
	`system_version` varchar(191) DEFAULT '8.2.3',
	`active_status` int DEFAULT 1,
	`currency_code` varchar(191) DEFAULT 'USD',
	`language_name` varchar(191) DEFAULT 'en',
	`session_year` varchar(191) DEFAULT '2020',
	`system_purchase_code` text DEFAULT NULL,
	`system_activated_date` date DEFAULT NULL,
	`last_update` date DEFAULT NULL,
	`envato_user` varchar(191) DEFAULT NULL,
	`envato_item_id` varchar(191) DEFAULT NULL,
	`system_domain` varchar(191) DEFAULT NULL,
	`copyright_text` text DEFAULT NULL,
	`api_url` int NOT NULL DEFAULT 1,
	`website_btn` int NOT NULL DEFAULT 1,
	`dashboard_btn` int NOT NULL DEFAULT 1,
	`report_btn` int NOT NULL DEFAULT 1,
	`style_btn` int NOT NULL DEFAULT 1,
	`ltl_rtl_btn` int NOT NULL DEFAULT 1,
	`lang_btn` int NOT NULL DEFAULT 1,
	`website_url` varchar(191) DEFAULT NULL,
	`ttl_rtl` int NOT NULL DEFAULT 2,
	`phone_number_privacy` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`week_start_id` int DEFAULT NULL,
	`time_zone_id` int DEFAULT NULL,
	`attendance_layout` int DEFAULT 1,
	`session_id` int DEFAULT NULL,
	`language_id` int DEFAULT 1,
	`date_format_id` int DEFAULT 1,
	`ss_page_load` int DEFAULT 3,
	`sub_topic_enable` tinyint NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`software_version` varchar(100) DEFAULT NULL,
	`email_driver` varchar(191) NOT NULL DEFAULT 'php',
	`fcm_key` text DEFAULT NULL,
	`multiple_roll` tinyint DEFAULT 0,
	`Lesson` int DEFAULT 1,
	`Chat` int DEFAULT 1,
	`FeesCollection` int DEFAULT 0,
	`income_head_id` int DEFAULT 0,
	`InfixBiometrics` int DEFAULT 0,
	`ResultReports` int DEFAULT 0,
	`TemplateSettings` int DEFAULT 1,
	`MenuManage` int DEFAULT 1,
	`RolePermission` int DEFAULT 1,
	`RazorPay` int DEFAULT 0,
	`Saas` int DEFAULT 1,
	`StudentAbsentNotification` int DEFAULT 1,
	`ParentRegistration` int DEFAULT 0,
	`Zoom` int DEFAULT 0,
	`BBB` int DEFAULT 0,
	`VideoWatch` int DEFAULT 0,
	`Jitsi` int DEFAULT 0,
	`OnlineExam` int DEFAULT 0,
	`SaasRolePermission` int DEFAULT 0,
	`BulkPrint` int DEFAULT 1,
	`HimalayaSms` int DEFAULT 1,
	`XenditPayment` int DEFAULT 1,
	`Wallet` int DEFAULT 1,
	`Lms` int DEFAULT 0,
	`ExamPlan` int DEFAULT 1,
	`University` int DEFAULT 0,
	`Gmeet` int DEFAULT 0,
	`KhaltiPayment` int DEFAULT 0,
	`Raudhahpay` int DEFAULT 0,
	`AppSlider` int DEFAULT 1,
	`BehaviourRecords` int DEFAULT 0,
	`DownloadCenter` int DEFAULT 1,
	`AiContent` int DEFAULT 0,
	`WhatsappSupport` int DEFAULT 0,
	`InAppLiveClass` int DEFAULT 0,
	`fees_status` int DEFAULT 1,
	`lms_checkout` int DEFAULT 0,
	`academic_id` int DEFAULT NULL,
	`is_comment` tinyint DEFAULT 0,
	`auto_approve` tinyint DEFAULT 0,
	`blog_search` tinyint DEFAULT 1,
	`recent_blog` tinyint DEFAULT 1,
	`un_academic_id` int DEFAULT 1,
	`direct_fees_assign` tinyint NOT NULL DEFAULT 0,
	`with_guardian` tinyint NOT NULL DEFAULT 1,
	`result_type` varchar(191) DEFAULT NULL,
	`preloader_status` tinyint NOT NULL DEFAULT 1,
	`preloader_style` tinyint NOT NULL DEFAULT 3,
	`preloader_type` tinyint NOT NULL DEFAULT 1,
	`preloader_image` varchar(191) NOT NULL DEFAULT 'public/uploads/settings/preloader/preloader1.gif',
	`due_fees_login` tinyint NOT NULL DEFAULT 0,
	`two_factor` tinyint NOT NULL DEFAULT 0,
	`active_theme` varchar(191) NOT NULL DEFAULT 'edulia',
	`queue_connection` varchar(191) NOT NULL DEFAULT 'database',
	`is_custom_saas` int NOT NULL DEFAULT 0,
	CONSTRAINT `sm_general_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_header_menu_managers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`type` varchar(191) NOT NULL,
	`element_id` bigint DEFAULT NULL,
	`title` varchar(191) DEFAULT NULL,
	`link` varchar(191) DEFAULT NULL,
	`parent_id` bigint DEFAULT NULL,
	`position` int NOT NULL DEFAULT 0,
	`show` tinyint NOT NULL DEFAULT 0,
	`is_newtab` tinyint NOT NULL DEFAULT 0,
	`theme` varchar(191) NOT NULL DEFAULT 'default',
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_header_menu_managers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_holidays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`holiday_title` varchar(200) DEFAULT NULL,
	`details` varchar(500) DEFAULT NULL,
	`from_date` date DEFAULT NULL,
	`to_date` date DEFAULT NULL,
	`upload_image_file` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_holidays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_home_page_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) DEFAULT NULL,
	`long_title` varchar(255) DEFAULT NULL,
	`short_description` text DEFAULT NULL,
	`link_label` varchar(255) DEFAULT NULL,
	`link_url` varchar(255) DEFAULT NULL,
	`image` varchar(255) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_home_page_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_homework_students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`marks` varchar(200) DEFAULT NULL,
	`teacher_comments` varchar(255) DEFAULT NULL,
	`complete_status` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`homework_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_homework_students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_homeworks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`homework_date` date DEFAULT NULL,
	`submission_date` date DEFAULT NULL,
	`evaluation_date` date DEFAULT NULL,
	`file` varchar(200) DEFAULT NULL,
	`marks` varchar(200) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`evaluated_by` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`course_id` bigint DEFAULT NULL,
	`lesson_id` bigint DEFAULT NULL,
	`chapter_id` bigint DEFAULT NULL,
	CONSTRAINT `sm_homeworks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_hourly_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grade` varchar(191) DEFAULT NULL,
	`rate` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_hourly_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_hr_payroll_earn_deducs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type_name` varchar(191) DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`earn_dedc_type` varchar(5) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`payroll_generate_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_hr_payroll_earn_deducs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_hr_payroll_generates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`basic_salary` double DEFAULT NULL,
	`total_earning` double DEFAULT NULL,
	`total_deduction` double DEFAULT NULL,
	`gross_salary` double DEFAULT NULL,
	`tax` double DEFAULT NULL,
	`net_salary` double DEFAULT NULL,
	`payroll_month` varchar(191) DEFAULT NULL,
	`payroll_year` varchar(191) DEFAULT NULL,
	`payroll_status` varchar(191) DEFAULT NULL,
	`payment_mode` varchar(191) DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`note` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`paid_amount` int DEFAULT NULL,
	`is_partial` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`staff_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_hr_payroll_generates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_hr_salary_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`salary_grades` varchar(200) DEFAULT NULL,
	`salary_basic` varchar(200) DEFAULT NULL,
	`overtime_rate` varchar(200) DEFAULT NULL,
	`house_rent` int DEFAULT NULL,
	`provident_fund` int DEFAULT NULL,
	`gross_salary` int DEFAULT NULL,
	`total_deduction` int DEFAULT NULL,
	`net_salary` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_hr_salary_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_human_departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`is_saas` int DEFAULT 0,
	CONSTRAINT `sm_human_departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_income_heads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_income_heads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_instructions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_instructions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_inventory_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_receive_sell_id` int DEFAULT NULL,
	`payment_date` date DEFAULT NULL,
	`amount` double(10,2) DEFAULT NULL,
	`reference_no` varchar(50) DEFAULT NULL,
	`payment_type` varchar(11) DEFAULT NULL,
	`payment_method` int DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_inventory_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(100) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`issue_to` int DEFAULT NULL,
	`issue_by` int DEFAULT NULL,
	`issue_date` date DEFAULT NULL,
	`due_date` date DEFAULT NULL,
	`quantity` int DEFAULT NULL,
	`issue_status` varchar(191) DEFAULT NULL,
	`note` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`role_id` int DEFAULT NULL,
	`item_category_id` int DEFAULT NULL,
	`item_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_receive_children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_price` decimal(20,2) DEFAULT NULL,
	`quantity` decimal(20,2) DEFAULT NULL,
	`sub_total` decimal(20,2) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`item_id` int DEFAULT NULL,
	`item_receive_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_receive_children_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_receives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receive_date` date DEFAULT NULL,
	`reference_no` varchar(191) DEFAULT NULL,
	`grand_total` decimal(20,2) DEFAULT NULL,
	`total_quantity` decimal(20,2) DEFAULT NULL,
	`total_paid` decimal(20,2) DEFAULT NULL,
	`total_due` decimal(20,2) DEFAULT NULL,
	`expense_head_id` int DEFAULT NULL,
	`account_id` int DEFAULT NULL,
	`payment_method` varchar(191) DEFAULT NULL,
	`paid_status` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`supplier_id` int DEFAULT NULL,
	`store_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_receives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_sell_children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sell_price` decimal(20,2) DEFAULT NULL,
	`quantity` decimal(20,2) DEFAULT NULL,
	`sub_total` decimal(20,2) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`item_sell_id` int DEFAULT NULL,
	`item_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_sell_children_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_sells` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_staff_id` int DEFAULT NULL,
	`sell_date` date DEFAULT NULL,
	`reference_no` varchar(50) DEFAULT NULL,
	`grand_total` decimal(20,2) DEFAULT NULL,
	`total_quantity` decimal(20,2) DEFAULT NULL,
	`total_paid` decimal(20,2) DEFAULT NULL,
	`total_due` decimal(20,2) DEFAULT NULL,
	`income_head_id` int DEFAULT NULL,
	`account_id` int DEFAULT NULL,
	`payment_method` varchar(191) DEFAULT NULL,
	`paid_status` varchar(191) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`role_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_sells_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_item_stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`store_name` varchar(100) DEFAULT NULL,
	`store_no` varchar(100) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_item_stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_name` varchar(100) DEFAULT NULL,
	`total_in_stock` double(8,2) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`item_category_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_language_phrases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modules` text DEFAULT NULL,
	`default_phrases` text DEFAULT NULL,
	`en` text DEFAULT NULL,
	`es` text DEFAULT NULL,
	`bn` text DEFAULT NULL,
	`fr` text DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_language_phrases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_languages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`language_name` varchar(191) DEFAULT NULL,
	`native` varchar(191) DEFAULT NULL,
	`language_universal` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lang_id` int DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_languages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_leave_deduction_infos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`staff_id` int DEFAULT NULL,
	`payroll_id` int DEFAULT NULL,
	`extra_leave` int DEFAULT NULL,
	`salary_deduct` int DEFAULT NULL,
	`pay_month` varchar(191) DEFAULT NULL,
	`pay_year` varchar(191) DEFAULT NULL,
	`active_status` tinyint DEFAULT 0,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_leave_deduction_infos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_leave_defines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`days` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`role_id` int DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`type_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`total_days` int DEFAULT 0,
	CONSTRAINT `sm_leave_defines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_leave_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apply_date` date DEFAULT NULL,
	`leave_from` date DEFAULT NULL,
	`leave_to` date DEFAULT NULL,
	`reason` text DEFAULT NULL,
	`note` text DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`approve_status` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`leave_define_id` int DEFAULT NULL,
	`staff_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`type_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_leave_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_leave_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(191) DEFAULT NULL,
	`total_days` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_leave_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_lesson_details` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`lesson_id` int NOT NULL,
	`lesson_title` varchar(191) DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_lesson_details_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_lesson_topic_details` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int DEFAULT NULL,
	`topic_title` varchar(191) NOT NULL,
	`completed_status` varchar(191) DEFAULT NULL,
	`competed_date` date DEFAULT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`topic_id` int DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`user_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_lesson_topic_details_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_lesson_topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int NOT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`active_status` int NOT NULL DEFAULT 1,
	`user_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_lesson_topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_lessons` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`lesson_title` varchar(191) DEFAULT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`user_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_library_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_ud_id` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`member_type` int DEFAULT NULL,
	`student_staff_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_library_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_mark_stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_roll_no` int NOT NULL DEFAULT 1,
	`student_addmission_no` int NOT NULL DEFAULT 1,
	`total_marks` double(8,2) NOT NULL,
	`is_absent` tinyint NOT NULL DEFAULT 1,
	`teacher_remarks` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`subject_id` int DEFAULT NULL,
	`exam_term_id` int DEFAULT NULL,
	`exam_setup_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`student_record_id` bigint DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`active_status` int DEFAULT 1,
	CONSTRAINT `sm_mark_stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_marks_grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grade_name` varchar(191) DEFAULT NULL,
	`gpa` double(8,2) DEFAULT NULL,
	`from` double(8,2) DEFAULT NULL,
	`up` double(8,2) DEFAULT NULL,
	`percent_from` double(8,2) DEFAULT NULL,
	`percent_upto` double(8,2) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_marks_grades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_marks_register_children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`marks` int DEFAULT NULL,
	`abs` int NOT NULL DEFAULT 0,
	`gpa_point` double(8,2) DEFAULT NULL,
	`gpa_grade` varchar(55) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`marks_register_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_marks_register_children_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_marks_registers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`exam_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_marks_registers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_marks_send_sms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sms_send_status` tinyint NOT NULL DEFAULT 1,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_marks_send_sms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_module_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module_id` int DEFAULT NULL,
	`name` varchar(191) DEFAULT NULL,
	`route` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_module_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_module_permission_assigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`module_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_module_permission_assigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_module_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dashboard_id` int DEFAULT NULL,
	`name` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_module_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`order` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_news` (
	`id` int AUTO_INCREMENT NOT NULL,
	`news_title` varchar(191) NOT NULL,
	`view_count` int DEFAULT NULL,
	`active_status` int DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`image_thumb` varchar(191) DEFAULT NULL,
	`news_body` longtext DEFAULT NULL,
	`publish_date` date DEFAULT NULL,
	`status` tinyint DEFAULT 1,
	`is_global` tinyint DEFAULT 1,
	`auto_approve` tinyint DEFAULT 0,
	`is_comment` tinyint DEFAULT 0,
	`order` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`category_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_news_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_news_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(191) NOT NULL,
	`type` varchar(191) NOT NULL DEFAULT 'news',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` bigint NOT NULL DEFAULT 1,
	CONSTRAINT `sm_news_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_news_comments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`message` text NOT NULL,
	`news_id` int DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`parent_id` int DEFAULT NULL,
	`status` tinyint DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_news_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_news_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`title` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`main_title` varchar(191) DEFAULT NULL,
	`main_description` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`main_image` varchar(191) DEFAULT NULL,
	`button_text` varchar(191) DEFAULT NULL,
	`button_url` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_news_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_notice_boards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notice_title` varchar(200) DEFAULT NULL,
	`notice_message` text DEFAULT NULL,
	`notice_date` date DEFAULT NULL,
	`publish_on` date DEFAULT NULL,
	`inform_to` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`is_published` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_notice_boards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_notification_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`event` varchar(191) DEFAULT NULL,
	`destination` varchar(191) DEFAULT NULL,
	`recipient` varchar(191) DEFAULT NULL,
	`subject` varchar(191) DEFAULT NULL,
	`template` longtext DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`shortcode` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_notification_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date DEFAULT NULL,
	`message` varchar(191) DEFAULT NULL,
	`url` varchar(191) DEFAULT NULL,
	`is_read` tinyint NOT NULL DEFAULT 0,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`user_id` int DEFAULT 1,
	`role_id` int NOT NULL DEFAULT 1,
	`created_by` int NOT NULL DEFAULT 1,
	`updated_by` int NOT NULL DEFAULT 1,
	`school_id` int NOT NULL DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_online_exam_marks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`marks` int DEFAULT NULL,
	`abs` int NOT NULL DEFAULT 0,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`exam_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_online_exam_marks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_online_exam_question_assigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`online_exam_id` int DEFAULT NULL,
	`question_bank_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_online_exam_question_assigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_online_exam_question_mu_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`status` tinyint DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`online_exam_question_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_online_exam_question_mu_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_online_exam_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(1) DEFAULT NULL,
	`mark` int DEFAULT NULL,
	`title` text DEFAULT NULL,
	`trueFalse` varchar(1) DEFAULT NULL,
	`suitable_words` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`online_exam_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_online_exam_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_online_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`start_time` varchar(200) DEFAULT NULL,
	`end_time` varchar(200) DEFAULT NULL,
	`end_date_time` varchar(191) DEFAULT NULL,
	`percentage` int DEFAULT NULL,
	`instruction` text DEFAULT NULL,
	`status` tinyint DEFAULT NULL,
	`is_taken` tinyint DEFAULT 0,
	`is_closed` tinyint DEFAULT 0,
	`is_waiting` tinyint DEFAULT 0,
	`is_running` tinyint DEFAULT 0,
	`auto_mark` tinyint DEFAULT 0,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_online_exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_optional_subject_assigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int DEFAULT NULL,
	`record_id` bigint DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`session_id` int NOT NULL,
	`academic_id` int DEFAULT 1,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_optional_subject_assigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`sub_title` varchar(191) DEFAULT NULL,
	`slug` varchar(191) DEFAULT NULL,
	`header_image` text DEFAULT NULL,
	`details` longtext DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`is_dynamic` tinyint NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `sm_pages_sub_title_unique` UNIQUE(`sub_title`)
);
--> statement-breakpoint
CREATE TABLE `sm_parents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fathers_name` varchar(200) DEFAULT NULL,
	`fathers_mobile` varchar(200) DEFAULT NULL,
	`fathers_occupation` varchar(200) DEFAULT NULL,
	`fathers_photo` varchar(200) DEFAULT NULL,
	`mothers_name` varchar(200) DEFAULT NULL,
	`mothers_mobile` varchar(200) DEFAULT NULL,
	`mothers_occupation` varchar(200) DEFAULT NULL,
	`mothers_photo` varchar(200) DEFAULT NULL,
	`relation` varchar(200) DEFAULT NULL,
	`guardians_name` varchar(200) DEFAULT NULL,
	`guardians_mobile` varchar(200) DEFAULT NULL,
	`guardians_email` varchar(200) DEFAULT NULL,
	`guardians_occupation` varchar(200) DEFAULT NULL,
	`guardians_relation` varchar(30) DEFAULT NULL,
	`guardians_photo` varchar(200) DEFAULT NULL,
	`guardians_address` varchar(200) DEFAULT NULL,
	`is_guardian` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`user_id` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_parents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_payment_gateway_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway_name` varchar(191) DEFAULT NULL,
	`gateway_username` varchar(191) DEFAULT NULL,
	`gateway_password` varchar(191) DEFAULT NULL,
	`gateway_signature` varchar(191) DEFAULT NULL,
	`gateway_client_id` varchar(191) DEFAULT NULL,
	`gateway_mode` varchar(191) DEFAULT NULL,
	`gateway_secret_key` varchar(191) DEFAULT NULL,
	`gateway_secret_word` varchar(191) DEFAULT NULL,
	`gateway_publisher_key` varchar(191) DEFAULT NULL,
	`gateway_private_key` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`bank_details` text DEFAULT NULL,
	`cheque_details` text DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`service_charge` tinyint DEFAULT 0,
	`charge_type` varchar(2) DEFAULT NULL,
	`charge` double(8,2),
	CONSTRAINT `sm_payment_gateway_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_payment_methhods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`method` varchar(255) NOT NULL,
	`type` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`gateway_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_payment_methhods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_phone_call_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`phone` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`description` text DEFAULT NULL,
	`next_follow_up_date` date DEFAULT NULL,
	`call_duration` varchar(100) DEFAULT NULL,
	`call_type` varchar(2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_phone_call_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_photo_galleries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`parent_id` int DEFAULT NULL,
	`name` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`feature_image` varchar(191) DEFAULT NULL,
	`gallery_image` varchar(191) DEFAULT NULL,
	`is_publish` tinyint NOT NULL DEFAULT 1,
	`position` int NOT NULL DEFAULT 0,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_photo_galleries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_postal_dispatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`to_title` varchar(191) DEFAULT NULL,
	`from_title` varchar(191) DEFAULT NULL,
	`reference_no` varchar(191) DEFAULT NULL,
	`address` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`note` text DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_postal_dispatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_postal_receives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`from_title` varchar(191) DEFAULT NULL,
	`to_title` varchar(191) DEFAULT NULL,
	`reference_no` varchar(191) DEFAULT NULL,
	`address` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`note` text DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_postal_receives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_product_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchase_date` date NOT NULL,
	`expaire_date` date NOT NULL,
	`price` double(10,2) DEFAULT NULL,
	`paid_amount` double(10,2) DEFAULT NULL,
	`due_amount` double(10,2) DEFAULT NULL,
	`package` varchar(10) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`user_id` int DEFAULT NULL,
	`staff_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_product_purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_question_bank_mu_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`status` tinyint DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`question_bank_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_question_bank_mu_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_question_banks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(2) NOT NULL,
	`question` text DEFAULT NULL,
	`marks` int DEFAULT NULL,
	`trueFalse` varchar(1) DEFAULT NULL,
	`suitable_words` text DEFAULT NULL,
	`number_of_option` varchar(2) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`q_group_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_question_banks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_question_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_question_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_question_levels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`level` varchar(200) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_question_levels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_result_stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_roll_no` int NOT NULL DEFAULT 1,
	`student_addmission_no` int NOT NULL DEFAULT 1,
	`is_absent` int NOT NULL DEFAULT 0,
	`total_marks` double(8,2) NOT NULL,
	`total_gpa_point` double(8,2) DEFAULT NULL,
	`total_gpa_grade` varchar(255) DEFAULT '0',
	`teacher_remarks` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_type_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`active_status` int DEFAULT 1,
	`exam_setup_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`student_record_id` bigint DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_result_stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`module_link_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_role_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_room_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`number_of_bed` int NOT NULL,
	`cost_per_bed` double(16,2) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`dormitory_id` int DEFAULT 1,
	`room_type_id` int DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_room_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_room_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(255) NOT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_room_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`far` double(10,2) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_name` varchar(200) DEFAULT NULL,
	`created_by` tinyint NOT NULL DEFAULT 1,
	`updated_by` tinyint NOT NULL DEFAULT 1,
	`email` varchar(200) DEFAULT NULL,
	`domain` varchar(191) NOT NULL DEFAULT 'school',
	`address` text DEFAULT NULL,
	`phone` varchar(20) DEFAULT NULL,
	`school_code` varchar(200) DEFAULT NULL,
	`is_email_verified` tinyint NOT NULL DEFAULT 0,
	`starting_date` date DEFAULT NULL,
	`ending_date` date DEFAULT NULL,
	`package_id` int DEFAULT NULL,
	`plan_type` varchar(200) DEFAULT NULL,
	`region` int DEFAULT NULL,
	`contact_type` enum('yearly','monthly','once') DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`is_enabled` varchar(20) NOT NULL DEFAULT 'yes',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_schools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_seat_plan_children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`room_id` tinyint DEFAULT NULL,
	`assign_students` int DEFAULT NULL,
	`start_time` time DEFAULT NULL,
	`end_time` time DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`seat_plan_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_seat_plan_children_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_seat_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_seat_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int DEFAULT NULL,
	`section_name` varchar(200) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`un_academic_id` int DEFAULT NULL,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_send_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`message_title` varchar(200) DEFAULT NULL,
	`message_des` varchar(500) DEFAULT NULL,
	`notice_date` date DEFAULT NULL,
	`publish_on` date DEFAULT NULL,
	`message_to` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_send_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session` varchar(255) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_setup_admins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` tinyint DEFAULT NULL,
	`name` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_setup_admins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_sms_gateways` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway_name` varchar(255) DEFAULT NULL,
	`type` varchar(5) DEFAULT 'com',
	`clickatell_username` varchar(255) DEFAULT NULL,
	`clickatell_password` varchar(255) DEFAULT NULL,
	`clickatell_api_id` varchar(255) DEFAULT NULL,
	`twilio_account_sid` varchar(255) DEFAULT NULL,
	`twilio_authentication_token` varchar(255) DEFAULT NULL,
	`twilio_registered_no` varchar(255) DEFAULT NULL,
	`msg91_authentication_key_sid` varchar(255) DEFAULT NULL,
	`msg91_sender_id` varchar(255) DEFAULT NULL,
	`msg91_route` varchar(255) DEFAULT NULL,
	`msg91_country_code` varchar(255) DEFAULT NULL,
	`textlocal_username` varchar(255) DEFAULT NULL,
	`textlocal_hash` varchar(255) DEFAULT NULL,
	`textlocal_sender` varchar(255) DEFAULT NULL,
	`device_info` text DEFAULT NULL,
	`africatalking_username` varchar(255) DEFAULT NULL,
	`africatalking_api_key` varchar(255) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`gateway_type` varchar(191) DEFAULT NULL,
	CONSTRAINT `sm_sms_gateways_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_social_media_icons` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`url` varchar(191) DEFAULT NULL,
	`icon` varchar(191) DEFAULT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_social_media_icons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_staff_attendance_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendence_date` date DEFAULT NULL,
	`in_time` varchar(50) DEFAULT NULL,
	`out_time` varchar(50) DEFAULT NULL,
	`attendance_type` varchar(10) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`staff_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_staff_attendance_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_staff_attendences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendence_type` varchar(10) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`attendence_date` date DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`staff_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_staff_attendences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_staff_registration_fields` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`field_name` varchar(191) DEFAULT NULL,
	`label_name` varchar(191) DEFAULT NULL,
	`active_status` tinyint DEFAULT 1,
	`is_required` tinyint DEFAULT 0,
	`staff_edit` tinyint DEFAULT 0,
	`required_type` tinyint DEFAULT NULL,
	`position` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_staff_registration_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_staffs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_no` int DEFAULT NULL,
	`first_name` varchar(100) DEFAULT NULL,
	`last_name` varchar(100) DEFAULT NULL,
	`full_name` varchar(200) DEFAULT NULL,
	`fathers_name` varchar(100) DEFAULT NULL,
	`mothers_name` varchar(100) DEFAULT NULL,
	`date_of_birth` date DEFAULT '2024-11-04',
	`date_of_joining` date DEFAULT '2024-11-04',
	`email` varchar(50) DEFAULT NULL,
	`mobile` varchar(50) DEFAULT NULL,
	`emergency_mobile` varchar(50) DEFAULT NULL,
	`marital_status` varchar(30) DEFAULT NULL,
	`merital_status` varchar(30) DEFAULT NULL,
	`staff_photo` varchar(191) DEFAULT NULL,
	`current_address` varchar(500) DEFAULT NULL,
	`permanent_address` varchar(500) DEFAULT NULL,
	`qualification` varchar(200) DEFAULT NULL,
	`experience` varchar(200) DEFAULT NULL,
	`epf_no` varchar(20) DEFAULT NULL,
	`basic_salary` varchar(200) DEFAULT NULL,
	`contract_type` varchar(200) DEFAULT NULL,
	`location` varchar(50) DEFAULT NULL,
	`casual_leave` varchar(15) DEFAULT NULL,
	`medical_leave` varchar(15) DEFAULT NULL,
	`metarnity_leave` varchar(15) DEFAULT NULL,
	`bank_account_name` varchar(50) DEFAULT NULL,
	`bank_account_no` varchar(50) DEFAULT NULL,
	`bank_name` varchar(20) DEFAULT NULL,
	`bank_brach` varchar(30) DEFAULT NULL,
	`facebook_url` varchar(100) DEFAULT NULL,
	`twiteer_url` varchar(100) DEFAULT NULL,
	`linkedin_url` varchar(100) DEFAULT NULL,
	`instragram_url` varchar(100) DEFAULT NULL,
	`joining_letter` varchar(500) DEFAULT NULL,
	`resume` varchar(500) DEFAULT NULL,
	`other_document` varchar(500) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`show_public` tinyint NOT NULL DEFAULT 0,
	`driving_license` varchar(255) DEFAULT NULL,
	`driving_license_ex_date` date DEFAULT NULL,
	`custom_field` text DEFAULT NULL,
	`custom_field_form_name` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`designation_id` int DEFAULT 1,
	`department_id` int DEFAULT 1,
	`user_id` int DEFAULT 1,
	`parent_id` int DEFAULT NULL,
	`role_id` int DEFAULT 1,
	`previous_role_id` int DEFAULT NULL,
	`gender_id` int DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`is_saas` int DEFAULT 0,
	CONSTRAINT `sm_staffs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_attendance_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendance_date` date DEFAULT NULL,
	`in_time` varchar(50) DEFAULT NULL,
	`out_time` varchar(50) DEFAULT NULL,
	`attendance_type` varchar(10) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_attendance_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_attendances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendance_type` varchar(10) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`attendance_date` date DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`record_id` int DEFAULT NULL,
	`student_record_id` bigint DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`active_status` int DEFAULT 1,
	CONSTRAINT `sm_student_attendances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(255) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`header_left_text` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`body` text DEFAULT NULL,
	`body_two` text DEFAULT NULL,
	`certificate_no` text DEFAULT NULL,
	`type` varchar(191) DEFAULT 'school',
	`footer_left_text` varchar(191) DEFAULT NULL,
	`footer_center_text` varchar(191) DEFAULT NULL,
	`footer_right_text` varchar(191) DEFAULT NULL,
	`student_photo` tinyint NOT NULL DEFAULT 1,
	`file` varchar(191) DEFAULT NULL,
	`layout` int DEFAULT NULL,
	`body_font_family` varchar(191) DEFAULT '''Arial''',
	`body_font_size` varchar(191) DEFAULT '2em',
	`height` varchar(50) DEFAULT NULL,
	`width` varchar(50) DEFAULT NULL,
	`default_for` varchar(50) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_certificates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`student_staff_id` int DEFAULT NULL,
	`type` varchar(191) DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_excel_formats` (
	`roll_no` varchar(191) DEFAULT NULL,
	`first_name` varchar(191) DEFAULT NULL,
	`last_name` varchar(191) DEFAULT NULL,
	`date_of_birth` varchar(191) DEFAULT NULL,
	`religion` varchar(191) DEFAULT NULL,
	`caste` varchar(191) DEFAULT NULL,
	`mobile` varchar(191) DEFAULT NULL,
	`email` varchar(191) DEFAULT NULL,
	`admission_date` varchar(191) DEFAULT NULL,
	`category` varchar(191) DEFAULT NULL,
	`blood_group` varchar(191) DEFAULT NULL,
	`height` varchar(191) DEFAULT NULL,
	`weight` varchar(191) DEFAULT NULL,
	`siblings_id` varchar(191) DEFAULT NULL,
	`father_name` varchar(191) DEFAULT NULL,
	`father_phone` varchar(191) DEFAULT NULL,
	`father_occupation` varchar(191) DEFAULT NULL,
	`mother_name` varchar(191) DEFAULT NULL,
	`mother_phone` varchar(191) DEFAULT NULL,
	`mother_occupation` varchar(191) DEFAULT NULL,
	`guardian_name` varchar(191) DEFAULT NULL,
	`guardian_relation` varchar(191) DEFAULT NULL,
	`guardian_email` varchar(191) DEFAULT NULL,
	`guardian_phone` varchar(191) DEFAULT NULL,
	`guardian_occupation` varchar(191) DEFAULT NULL,
	`guardian_address` varchar(191) DEFAULT NULL,
	`current_address` varchar(191) DEFAULT NULL,
	`permanent_address` varchar(191) DEFAULT NULL,
	`bank_account_no` varchar(191) DEFAULT NULL,
	`bank_name` varchar(191) DEFAULT NULL,
	`national_identification_no` varchar(191) DEFAULT NULL,
	`local_identification_no` varchar(191) DEFAULT NULL,
	`previous_school_details` varchar(191) DEFAULT NULL,
	`note` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE `sm_student_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group` varchar(200) NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_homeworks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`homework_date` date DEFAULT NULL,
	`submission_date` date DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`percentage` varchar(200) DEFAULT NULL,
	`status` varchar(200) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`evaluated_by` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_homeworks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_id_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`logo` varchar(191) DEFAULT NULL,
	`signature` varchar(191) DEFAULT NULL,
	`background_img` varchar(191) DEFAULT NULL,
	`profile_image` varchar(191) DEFAULT NULL,
	`role_id` text DEFAULT NULL,
	`page_layout_style` varchar(191) DEFAULT NULL,
	`user_photo_style` varchar(191) DEFAULT NULL,
	`user_photo_width` varchar(191) DEFAULT NULL,
	`user_photo_height` varchar(191) DEFAULT NULL,
	`pl_width` int DEFAULT NULL,
	`pl_height` int DEFAULT NULL,
	`t_space` int DEFAULT NULL,
	`b_space` int DEFAULT NULL,
	`r_space` int DEFAULT NULL,
	`l_space` int DEFAULT NULL,
	`admission_no` varchar(191) NOT NULL DEFAULT '0',
	`student_name` varchar(191) NOT NULL DEFAULT '0',
	`class` varchar(191) NOT NULL DEFAULT '0',
	`father_name` varchar(191) NOT NULL DEFAULT '0',
	`mother_name` varchar(191) NOT NULL DEFAULT '0',
	`student_address` varchar(191) NOT NULL DEFAULT '0',
	`phone_number` varchar(191) NOT NULL DEFAULT '0',
	`dob` varchar(191) NOT NULL DEFAULT '0',
	`blood` varchar(191) NOT NULL DEFAULT '0',
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_id_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`result_status` varchar(10) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`previous_class_id` int DEFAULT NULL,
	`current_class_id` int DEFAULT NULL,
	`previous_section_id` int DEFAULT NULL,
	`current_section_id` int DEFAULT NULL,
	`previous_session_id` int DEFAULT NULL,
	`current_session_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`admission_number` int DEFAULT NULL,
	`student_info` longtext DEFAULT NULL,
	`merit_student_info` longtext DEFAULT NULL,
	`previous_roll_number` int DEFAULT NULL,
	`current_roll_number` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_registration_fields` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`field_name` varchar(191) DEFAULT NULL,
	`label_name` varchar(191) DEFAULT NULL,
	`is_show` tinyint DEFAULT 1,
	`active_status` tinyint DEFAULT 1,
	`is_required` tinyint DEFAULT 0,
	`student_edit` tinyint DEFAULT 0,
	`parent_edit` tinyint DEFAULT 0,
	`staff_edit` tinyint DEFAULT 0,
	`type` tinyint DEFAULT NULL,
	`is_system_required` tinyint DEFAULT 0,
	`required_type` tinyint DEFAULT NULL,
	`position` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`admin_section` varchar(191) DEFAULT NULL,
	CONSTRAINT `sm_student_registration_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_take_online_exam_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trueFalse` varchar(1) DEFAULT NULL,
	`suitable_words` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`take_online_exam_id` int DEFAULT NULL,
	`question_bank_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_take_online_exam_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_take_online_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`student_done` tinyint NOT NULL DEFAULT 0,
	`total_marks` int DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`record_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`online_exam_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_take_online_exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_take_onln_ex_ques_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`status` tinyint DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`take_online_exam_question_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_take_onln_ex_ques_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_student_timelines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_student_id` int NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`description` text DEFAULT NULL,
	`file` varchar(191) DEFAULT NULL,
	`type` varchar(191) DEFAULT NULL,
	`visible_to_student` int NOT NULL DEFAULT 0,
	`active_status` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_student_timelines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admission_no` int DEFAULT NULL,
	`roll_no` int DEFAULT NULL,
	`first_name` varchar(200) DEFAULT NULL,
	`last_name` varchar(200) DEFAULT NULL,
	`full_name` varchar(200) DEFAULT NULL,
	`date_of_birth` date DEFAULT NULL,
	`caste` varchar(200) DEFAULT NULL,
	`email` varchar(200) DEFAULT NULL,
	`mobile` varchar(200) DEFAULT NULL,
	`admission_date` date DEFAULT NULL,
	`student_photo` varchar(191) DEFAULT NULL,
	`age` varchar(200) DEFAULT NULL,
	`height` varchar(200) DEFAULT NULL,
	`weight` varchar(200) DEFAULT NULL,
	`current_address` varchar(500) DEFAULT NULL,
	`permanent_address` varchar(500) DEFAULT NULL,
	`driver_id` varchar(200) DEFAULT NULL,
	`national_id_no` varchar(200) DEFAULT NULL,
	`local_id_no` varchar(200) DEFAULT NULL,
	`bank_account_no` varchar(200) DEFAULT NULL,
	`bank_name` varchar(200) DEFAULT NULL,
	`previous_school_details` varchar(500) DEFAULT NULL,
	`aditional_notes` text DEFAULT NULL,
	`ifsc_code` varchar(50) DEFAULT NULL,
	`document_title_1` varchar(200) DEFAULT NULL,
	`document_file_1` varchar(200) DEFAULT NULL,
	`document_title_2` varchar(200) DEFAULT NULL,
	`document_file_2` varchar(200) DEFAULT NULL,
	`document_title_3` varchar(200) DEFAULT NULL,
	`document_file_3` varchar(200) DEFAULT NULL,
	`document_title_4` varchar(200) DEFAULT NULL,
	`document_file_4` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`custom_field` text DEFAULT NULL,
	`custom_field_form_name` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`bloodgroup_id` int DEFAULT NULL,
	`religion_id` int DEFAULT NULL,
	`route_list_id` int DEFAULT NULL,
	`dormitory_id` int DEFAULT NULL,
	`vechile_id` int DEFAULT NULL,
	`room_id` int DEFAULT NULL,
	`student_category_id` int DEFAULT NULL,
	`student_group_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`session_id` int DEFAULT NULL,
	`parent_id` int DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`gender_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_styles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`style_name` varchar(255) DEFAULT NULL,
	`path_main_style` varchar(255) DEFAULT NULL,
	`path_infix_style` varchar(255) DEFAULT NULL,
	`primary_color` varchar(255) DEFAULT NULL,
	`primary_color2` varchar(255) DEFAULT NULL,
	`title_color` varchar(255) DEFAULT NULL,
	`text_color` varchar(255) DEFAULT NULL,
	`white` varchar(255) DEFAULT NULL,
	`black` varchar(255) DEFAULT NULL,
	`sidebar_bg` varchar(255) DEFAULT NULL,
	`barchart1` varchar(255) DEFAULT NULL,
	`barchart2` varchar(255) DEFAULT NULL,
	`barcharttextcolor` varchar(255) DEFAULT NULL,
	`barcharttextfamily` varchar(255) DEFAULT NULL,
	`areachartlinecolor1` varchar(255) DEFAULT NULL,
	`areachartlinecolor2` varchar(255) DEFAULT NULL,
	`dashboardbackground` varchar(255) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`is_active` tinyint NOT NULL DEFAULT 0,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_styles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_subject_attendances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendance_type` varchar(10) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`attendance_date` date DEFAULT NULL,
	`notify` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`subject_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`student_record_id` bigint DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`active_status` int DEFAULT 1,
	CONSTRAINT `sm_subject_attendances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subject_name` varchar(255) NOT NULL,
	`subject_code` varchar(255) DEFAULT NULL,
	`pass_mark` double(8,2) DEFAULT NULL,
	`subject_type` enum('T','P') NOT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`parent_id` int DEFAULT NULL,
	CONSTRAINT `sm_subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_name` varchar(100) DEFAULT NULL,
	`company_address` varchar(500) DEFAULT NULL,
	`contact_person_name` varchar(191) DEFAULT NULL,
	`contact_person_mobile` varchar(191) DEFAULT NULL,
	`contact_person_email` varchar(100) DEFAULT NULL,
	`cotact_person_address` varchar(500) DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_system_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_name` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`features` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_system_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_teacher_upload_contents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`content_title` varchar(200) DEFAULT NULL,
	`content_type` varchar(191) DEFAULT NULL,
	`available_for_admin` int DEFAULT 0,
	`available_for_all_classes` int NOT NULL DEFAULT 0,
	`upload_date` date DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`source_url` varchar(191) DEFAULT NULL,
	`upload_file` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`course_id` int DEFAULT NULL,
	`parent_course_id` int DEFAULT NULL,
	`class` int DEFAULT NULL,
	`section` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`chapter_id` bigint DEFAULT NULL,
	`lesson_id` bigint DEFAULT NULL,
	`parent_id` int DEFAULT NULL,
	CONSTRAINT `sm_teacher_upload_contents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_temporary_meritlists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`iid` varchar(250) DEFAULT NULL,
	`student_id` varchar(250) DEFAULT NULL,
	`merit_order` double(8,2) DEFAULT NULL,
	`student_name` varchar(250) DEFAULT NULL,
	`admission_no` varchar(250) DEFAULT NULL,
	`subjects_id_string` varchar(250) DEFAULT NULL,
	`subjects_string` varchar(250) DEFAULT NULL,
	`marks_string` varchar(250) DEFAULT NULL,
	`total_marks` double(8,2) DEFAULT NULL,
	`average_mark` double(20,2) DEFAULT NULL,
	`gpa_point` double(20,2) DEFAULT NULL,
	`result` varchar(250) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`exam_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`roll_no` int DEFAULT NULL,
	CONSTRAINT `sm_temporary_meritlists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`designation` varchar(191) NOT NULL,
	`institution_name` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`description` text NOT NULL,
	`star_rating` int NOT NULL DEFAULT 5,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`school_id` int DEFAULT 1,
	CONSTRAINT `sm_testimonials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_time_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(191) DEFAULT NULL,
	`time_zone` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_time_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_to_dos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`todo_title` varchar(191) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`complete_status` varchar(191) DEFAULT 'P',
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_to_dos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_upload_contents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`content_title` varchar(200) DEFAULT NULL,
	`content_type` int DEFAULT NULL,
	`available_for_role` int DEFAULT NULL,
	`available_for_class` int DEFAULT NULL,
	`available_for_section` int DEFAULT NULL,
	`upload_date` date DEFAULT NULL,
	`description` varchar(500) DEFAULT NULL,
	`upload_file` varchar(200) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_upload_contents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_upload_homework_contents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` int DEFAULT 1,
	`homework_id` int DEFAULT 1,
	`description` text DEFAULT NULL,
	`file` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_upload_homework_contents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_user_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip_address` varchar(191) DEFAULT NULL,
	`user_agent` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`user_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_user_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_no` varchar(255) NOT NULL,
	`vehicle_model` varchar(255) NOT NULL,
	`made_year` int DEFAULT NULL,
	`note` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`driver_id` int DEFAULT NULL,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_video_galleries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`video_link` text DEFAULT NULL,
	`is_publish` tinyint NOT NULL DEFAULT 1,
	`position` int NOT NULL DEFAULT 0,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sm_video_galleries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_visitors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(255) DEFAULT NULL,
	`visitor_id` varchar(255) DEFAULT NULL,
	`no_of_person` int DEFAULT NULL,
	`purpose` varchar(255) DEFAULT NULL,
	`date` date DEFAULT NULL,
	`in_time` varchar(255) DEFAULT NULL,
	`out_time` varchar(255) DEFAULT NULL,
	`file` varchar(255) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	CONSTRAINT `sm_visitors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sm_weekends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`order` int DEFAULT NULL,
	`is_weekend` int DEFAULT NULL,
	`active_status` int NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` varchar(191) DEFAULT NULL,
	`updated_at` varchar(191) DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `sm_weekends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_templates` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`type` varchar(191) NOT NULL,
	`purpose` text NOT NULL,
	`subject` text NOT NULL,
	`body` longtext NOT NULL,
	`module` varchar(191) NOT NULL,
	`variable` text NOT NULL,
	`status` int NOT NULL DEFAULT 1,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sms_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `speech_sliders` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(191) DEFAULT NULL,
	`designation` varchar(191) DEFAULT NULL,
	`speech` text DEFAULT NULL,
	`image` varchar(191) DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `speech_sliders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_import_bulk_temporaries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`staff_no` int DEFAULT NULL,
	`first_name` varchar(100) DEFAULT NULL,
	`last_name` varchar(100) DEFAULT NULL,
	`full_name` varchar(200) DEFAULT NULL,
	`fathers_name` varchar(100) DEFAULT NULL,
	`mothers_name` varchar(100) DEFAULT NULL,
	`date_of_birth` date DEFAULT '2024-11-04',
	`date_of_joining` date DEFAULT '2024-11-04',
	`email` varchar(50) DEFAULT NULL,
	`mobile` varchar(50) DEFAULT NULL,
	`emergency_mobile` varchar(50) DEFAULT NULL,
	`marital_status` varchar(30) DEFAULT NULL,
	`staff_photo` varchar(191) DEFAULT NULL,
	`current_address` varchar(500) DEFAULT NULL,
	`permanent_address` varchar(500) DEFAULT NULL,
	`qualification` varchar(200) DEFAULT NULL,
	`experience` varchar(200) DEFAULT NULL,
	`epf_no` varchar(20) DEFAULT NULL,
	`basic_salary` varchar(200) DEFAULT NULL,
	`contract_type` varchar(200) DEFAULT NULL,
	`location` varchar(50) DEFAULT NULL,
	`casual_leave` varchar(15) DEFAULT NULL,
	`medical_leave` varchar(15) DEFAULT NULL,
	`maternity_leave` varchar(15) DEFAULT NULL,
	`bank_account_name` varchar(50) DEFAULT NULL,
	`bank_account_no` varchar(50) DEFAULT NULL,
	`bank_name` varchar(20) DEFAULT NULL,
	`bank_brach` varchar(30) DEFAULT NULL,
	`facebook_url` varchar(100) DEFAULT NULL,
	`twitter_url` varchar(100) DEFAULT NULL,
	`linkedin_url` varchar(100) DEFAULT NULL,
	`instagram_url` varchar(100) DEFAULT NULL,
	`joining_letter` varchar(500) DEFAULT NULL,
	`resume` varchar(500) DEFAULT NULL,
	`other_document` varchar(500) DEFAULT NULL,
	`notes` varchar(500) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`driving_license` varchar(255) DEFAULT NULL,
	`driving_license_ex_date` date DEFAULT NULL,
	`role` varchar(191) DEFAULT NULL,
	`department` varchar(191) DEFAULT NULL,
	`designation` varchar(191) DEFAULT NULL,
	`gender_id` int DEFAULT NULL,
	`user_id` int DEFAULT 1,
	`parent_id` int DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_import_bulk_temporaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_academic_histories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`occurance_date` date NOT NULL,
	`student_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`academic_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_academic_histories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_attendance_bulks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`attendance_date` varchar(191) DEFAULT NULL,
	`attendance_type` varchar(191) DEFAULT NULL,
	`note` varchar(191) DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`student_record_id` int DEFAULT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_attendance_bulks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_bulk_temporaries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`admission_number` varchar(191) DEFAULT NULL,
	`roll_no` varchar(191) DEFAULT NULL,
	`first_name` varchar(191) DEFAULT NULL,
	`last_name` varchar(191) DEFAULT NULL,
	`date_of_birth` varchar(191) DEFAULT NULL,
	`religion` varchar(191) DEFAULT NULL,
	`gender` varchar(191) DEFAULT NULL,
	`caste` varchar(191) DEFAULT NULL,
	`mobile` varchar(191) DEFAULT NULL,
	`email` varchar(191) DEFAULT NULL,
	`admission_date` varchar(191) DEFAULT NULL,
	`blood_group` varchar(191) DEFAULT NULL,
	`height` varchar(191) DEFAULT NULL,
	`weight` varchar(191) DEFAULT NULL,
	`father_name` varchar(191) DEFAULT NULL,
	`father_phone` varchar(191) DEFAULT NULL,
	`father_occupation` varchar(191) DEFAULT NULL,
	`mother_name` varchar(191) DEFAULT NULL,
	`mother_phone` varchar(191) DEFAULT NULL,
	`mother_occupation` varchar(191) DEFAULT NULL,
	`guardian_name` varchar(191) DEFAULT NULL,
	`guardian_relation` varchar(191) DEFAULT NULL,
	`guardian_email` varchar(191) DEFAULT NULL,
	`guardian_phone` varchar(191) DEFAULT NULL,
	`guardian_occupation` varchar(191) DEFAULT NULL,
	`guardian_address` varchar(191) DEFAULT NULL,
	`current_address` varchar(191) DEFAULT NULL,
	`permanent_address` varchar(191) DEFAULT NULL,
	`bank_account_no` varchar(191) DEFAULT NULL,
	`bank_name` varchar(191) DEFAULT NULL,
	`national_identification_no` varchar(191) DEFAULT NULL,
	`local_identification_no` varchar(191) DEFAULT NULL,
	`previous_school_details` varchar(191) DEFAULT NULL,
	`note` text DEFAULT NULL,
	`user_id` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_bulk_temporaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rate` int DEFAULT NULL,
	`attribute` varchar(200) DEFAULT NULL,
	`color` varchar(200) DEFAULT NULL,
	`remark` varchar(200) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`student_id` int DEFAULT NULL,
	`exam_type_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `student_ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_id_exam_type_id_attribute` UNIQUE(`student_id`,`exam_type_id`,`attribute`)
);
--> statement-breakpoint
CREATE TABLE `student_record_temporaries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sm_student_id` int NOT NULL,
	`student_record_id` bigint NOT NULL,
	`user_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_record_temporaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_records` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`class_id` int DEFAULT NULL,
	`section_id` int DEFAULT NULL,
	`roll_no` varchar(191) DEFAULT NULL,
	`is_promote` tinyint DEFAULT 0,
	`is_default` tinyint DEFAULT 0,
	`session_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`academic_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`active_status` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_graduate` tinyint DEFAULT 0,
	CONSTRAINT `student_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_evaluation_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`is_enable` tinyint NOT NULL DEFAULT 0,
	`submitted_by` varchar(191) NOT NULL DEFAULT '[]',
	`rating_submission_time` varchar(191) NOT NULL DEFAULT 'any',
	`auto_approval` tinyint NOT NULL DEFAULT 1,
	`from_date` date DEFAULT NULL,
	`to_date` date DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_evaluation_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_evaluations` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`rating` text DEFAULT NULL,
	`comment` varchar(191) DEFAULT NULL,
	`status` tinyint DEFAULT 0,
	`record_id` int NOT NULL,
	`subject_id` int DEFAULT NULL,
	`teacher_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`role_id` int DEFAULT NULL,
	`parent_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_remarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`remark` text DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`teacher_id` int DEFAULT NULL,
	`student_id` int DEFAULT NULL,
	`exam_type_id` int DEFAULT NULL,
	`academic_id` int DEFAULT NULL,
	CONSTRAINT `teacher_remarks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tr_student_exam_academic_unq` UNIQUE(`student_id`,`exam_type_id`,`academic_id`)
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) DEFAULT NULL,
	`path_main_style` varchar(255) DEFAULT NULL,
	`path_infix_style` varchar(255) DEFAULT NULL,
	`replicate_theme` varchar(255) DEFAULT NULL,
	`color_mode` varchar(191) NOT NULL DEFAULT 'gradient',
	`box_shadow` tinyint DEFAULT 1,
	`background_type` varchar(191) NOT NULL DEFAULT 'image',
	`background_color` varchar(191) DEFAULT NULL,
	`background_image` varchar(191) DEFAULT NULL,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`is_system` tinyint NOT NULL DEFAULT 0,
	`created_by` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `themes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcations` (
	`id` int NOT NULL,
	`title` text DEFAULT NULL,
	`type` varchar(20) NOT NULL DEFAULT 'debit',
	`payment_method` varchar(20) DEFAULT NULL,
	`reference` varchar(20) DEFAULT NULL,
	`description` text DEFAULT NULL,
	`morphable_id` bigint DEFAULT NULL,
	`morphable_type` varchar(191) DEFAULT NULL,
	`amount` bigint NOT NULL,
	`transaction_date` date DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`school_id` int NOT NULL DEFAULT 1,
	`academic_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `two_factor_settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`via_sms` tinyint NOT NULL DEFAULT 0,
	`via_email` tinyint NOT NULL DEFAULT 1,
	`for_student` tinyint NOT NULL DEFAULT 2,
	`for_parent` tinyint NOT NULL DEFAULT 3,
	`for_teacher` tinyint NOT NULL DEFAULT 4,
	`for_staff` tinyint NOT NULL DEFAULT 6,
	`for_admin` tinyint NOT NULL DEFAULT 1,
	`expired_time` double(8,2) NOT NULL DEFAULT 300,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `two_factor_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_otp_codes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int DEFAULT NULL,
	`otp_code` varchar(191) NOT NULL,
	`expired_time` varchar(200) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_otp_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(192) DEFAULT NULL,
	`username` varchar(192) DEFAULT NULL,
	`phone_number` varchar(191) DEFAULT NULL,
	`email` varchar(192) DEFAULT NULL,
	`pwd_ver` bigint NOT NULL DEFAULT UNIX_TIMESTAMP(),
	`password` varchar(100) DEFAULT NULL,
	`usertype` varchar(210) DEFAULT NULL,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`random_code` text DEFAULT NULL,
	`notificationToken` text DEFAULT NULL,
	`remember_token` varchar(100) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`language` varchar(191) DEFAULT 'en',
	`style_id` int DEFAULT 1,
	`rtl_ltl` int DEFAULT 2,
	`selected_session` int DEFAULT 1,
	`created_by` int DEFAULT 1,
	`updated_by` int DEFAULT 1,
	`access_status` int DEFAULT 1,
	`school_id` int DEFAULT 1,
	`role_id` int DEFAULT NULL,
	`is_administrator` enum('yes','no') NOT NULL DEFAULT 'no',
	`is_registered` tinyint NOT NULL DEFAULT 0,
	`device_token` text DEFAULT NULL,
	`stripe_id` varchar(191) DEFAULT NULL,
	`card_brand` varchar(191) DEFAULT NULL,
	`card_last_four` varchar(4) DEFAULT NULL,
	`verified` varchar(191) DEFAULT NULL,
	`trial_ends_at` timestamp DEFAULT NULL,
	`wallet_balance` double(8,2) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `version_histories` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`version` varchar(191) DEFAULT NULL,
	`release_date` varchar(191) DEFAULT NULL,
	`url` varchar(191) DEFAULT NULL,
	`notes` varchar(191) DEFAULT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `version_histories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_uploads` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text DEFAULT NULL,
	`youtube_link` varchar(191) NOT NULL,
	`class_id` int NOT NULL,
	`section_id` int NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`academic_id` int DEFAULT NULL,
	`school_id` int DEFAULT 1,
	CONSTRAINT `video_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`amount` double(8,2) DEFAULT NULL,
	`payment_method` varchar(191) DEFAULT NULL,
	`user_id` int DEFAULT NULL,
	`bank_id` int DEFAULT NULL,
	`note` varchar(191) DEFAULT NULL,
	`type` varchar(191) DEFAULT NULL,
	`file` text DEFAULT NULL,
	`reject_note` text DEFAULT NULL,
	`expense` double(8,2) DEFAULT NULL,
	`status` varchar(191) NOT NULL DEFAULT 'pending',
	`created_by` int DEFAULT NULL,
	`academic_id` int NOT NULL DEFAULT 1,
	`school_id` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `assign_permissions` ADD CONSTRAINT `ap_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD CONSTRAINT `cg_class_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD CONSTRAINT `cg_section_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD CONSTRAINT `cg_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD CONSTRAINT `cg_teacher_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD CONSTRAINT `cg_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `chat_groups` ADD CONSTRAINT `cg_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `class_attendances` ADD CONSTRAINT `ca_exam_type_id_fk` FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `class_attendances` ADD CONSTRAINT `ca_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `class_attendances` ADD CONSTRAINT `ca_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `class_attendances` ADD CONSTRAINT `ca_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `color_theme` ADD CONSTRAINT `ct_color_id_fk` FOREIGN KEY (`color_id`) REFERENCES `colors`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `color_theme` ADD CONSTRAINT `ct_theme_id_fk` FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `comment_pivots` ADD CONSTRAINT `cp_comment_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `comment_pivots` ADD CONSTRAINT `cp_comment_tag_id_fk` FOREIGN KEY (`comment_tag_id`) REFERENCES `comment_tags`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `comment_tags` ADD CONSTRAINT `ct_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `com_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `com_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `content_share_lists` ADD CONSTRAINT `csl_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `content_share_lists` ADD CONSTRAINT `csl_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `content_types` ADD CONSTRAINT `cty_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `content_types` ADD CONSTRAINT `cty_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `contents` ADD CONSTRAINT `con_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `contents` ADD CONSTRAINT `con_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `continents` ADD CONSTRAINT `cont_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `continets` ADD CONSTRAINT `conts_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `countries` ADD CONSTRAINT `cou_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `countries` ADD CONSTRAINT `cou_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `custom_result_settings` ADD CONSTRAINT `crs_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `custom_result_settings` ADD CONSTRAINT `crs_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `dire_fees_installment_child_payments` ADD CONSTRAINT `dficp_bank_id_sm_bank_accounts_id_fk` FOREIGN KEY (`bank_id`) REFERENCES `sm_bank_accounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `dire_fees_installment_child_payments` ADD CONSTRAINT `dficp_fees_type_id_sm_fees_types_id_fk` FOREIGN KEY (`fees_type_id`) REFERENCES `sm_fees_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `dire_fees_installment_child_payments` ADD CONSTRAINT `dficp_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `dire_fees_installment_child_payments` ADD CONSTRAINT `dficp_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_installment_assigns` ADD CONSTRAINT `dfia_bank_id_fk` FOREIGN KEY (`bank_id`) REFERENCES `sm_bank_accounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_installment_assigns` ADD CONSTRAINT `dfia_fees_discount_id_fk` FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_installment_assigns` ADD CONSTRAINT `dfia_fees_type_id_fk` FOREIGN KEY (`fees_type_id`) REFERENCES `sm_fees_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_installment_assigns` ADD CONSTRAINT `dfia_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_installment_assigns` ADD CONSTRAINT `dfia_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_installments` ADD CONSTRAINT `dfi_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_reminders` ADD CONSTRAINT `dfr_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `direct_fees_settings` ADD CONSTRAINT `dfs_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `due_fees_login_prevents` ADD CONSTRAINT `dflp_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `due_fees_login_prevents` ADD CONSTRAINT `dflp_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `due_fees_login_prevents` ADD CONSTRAINT `dflp_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `due_fees_login_prevents` ADD CONSTRAINT `dflp_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `exam_step_skips` ADD CONSTRAINT `ess_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `exam_step_skips` ADD CONSTRAINT `ess_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_carry_forward_logs` ADD CONSTRAINT `fcfl_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_carry_forward_settings` ADD CONSTRAINT `fcfs_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_invoice_settings` ADD CONSTRAINT `fis_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_invoice_settings` ADD CONSTRAINT `fis_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_invoice_settings` ADD CONSTRAINT `fis_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_invoice_settings` ADD CONSTRAINT `fis_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fees_invoices` ADD CONSTRAINT `fi_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fm_fees_invoice_chields` ADD CONSTRAINT `fmfic_fees_invoice_id_fk` FOREIGN KEY (`fees_invoice_id`) REFERENCES `fm_fees_invoices`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fm_fees_invoices` ADD CONSTRAINT `fmfi_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fm_fees_transaction_chields` ADD CONSTRAINT `fmtc_fees_transaction_id_fk` FOREIGN KEY (`fees_transaction_id`) REFERENCES `fm_fees_transactions`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fm_fees_transactions` ADD CONSTRAINT `fmft_fees_invoice_id_fk` FOREIGN KEY (`fees_invoice_id`) REFERENCES `fm_fees_invoices`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `fm_fees_weavers` ADD CONSTRAINT `fm_fees_weavers_fees_invoice_id_fm_fees_invoices_id_fk` FOREIGN KEY (`fees_invoice_id`) REFERENCES `fm_fees_invoices`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `front_academic_calendars` ADD CONSTRAINT `front_academic_calendars_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `front_class_routines` ADD CONSTRAINT `front_class_routines_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `front_exam_routines` ADD CONSTRAINT `front_exam_routines_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `front_results` ADD CONSTRAINT `front_results_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `frontend_exam_results` ADD CONSTRAINT `frontend_exam_results_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `graduates` ADD CONSTRAINT `graduates_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `graduates` ADD CONSTRAINT `graduates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `graduates` ADD CONSTRAINT `graduates_session_id_sm_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sm_sessions`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `graduates` ADD CONSTRAINT `graduates_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `graduates` ADD CONSTRAINT `graduates_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `home_sliders` ADD CONSTRAINT `home_sliders_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_module_infos` ADD CONSTRAINT `infix_module_infos_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_module_infos` ADD CONSTRAINT `infix_module_infos_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_module_infos` ADD CONSTRAINT `infix_module_infos_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_module_student_parent_infos` ADD CONSTRAINT `imspi_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_module_student_parent_infos` ADD CONSTRAINT `imspi_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_module_student_parent_infos` ADD CONSTRAINT `imspi_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_permission_assigns` ADD CONSTRAINT `infix_permission_assigns_role_id_infix_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_permission_assigns` ADD CONSTRAINT `infix_permission_assigns_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infix_roles` ADD CONSTRAINT `infix_roles_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `infixedu__pages` ADD CONSTRAINT `infixedu__pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD CONSTRAINT `invoice_settings_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD CONSTRAINT `invoice_settings_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD CONSTRAINT `invoice_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD CONSTRAINT `invoice_settings_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `languages` ADD CONSTRAINT `languages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `learning_objectives` ADD CONSTRAINT `learning_objectives_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `learning_objectives` ADD CONSTRAINT `learning_objectives_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `learning_objectives` ADD CONSTRAINT `learning_objectives_exam_type_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `learning_objectives` ADD CONSTRAINT `learning_objectives_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_plan_topics` ADD CONSTRAINT `lesson_plan_topics_topic_id_sm_lesson_topic_details_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `sm_lesson_topic_details`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_plan_topics` ADD CONSTRAINT `lesson_plan_topics_lesson_planner_id_lesson_planners_id_fk` FOREIGN KEY (`lesson_planner_id`) REFERENCES `lesson_planners`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_room_id_sm_class_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `sm_class_rooms`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_teacher_id_sm_staffs_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_class_period_id_sm_class_times_id_fk` FOREIGN KEY (`class_period_id`) REFERENCES `sm_class_times`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `lesson_planners` ADD CONSTRAINT `lesson_planners_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `library_subjects` ADD CONSTRAINT `library_subjects_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `library_subjects` ADD CONSTRAINT `library_subjects_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `maintenance_settings` ADD CONSTRAINT `maintenance_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `newsletters` ADD CONSTRAINT `newsletters_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `payroll_payments` ADD CONSTRAINT `pp_payroll_generate_id_fk` FOREIGN KEY (`sm_hr_payroll_generate_id`) REFERENCES `sm_hr_payroll_generates`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `permission_sections` ADD CONSTRAINT `permission_sections_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `plugins` ADD CONSTRAINT `plugins_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `roles` ADD CONSTRAINT `roles_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `school_modules` ADD CONSTRAINT `school_modules_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sidebars` ADD CONSTRAINT `sidebars_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sidebars` ADD CONSTRAINT `sidebars_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_about_pages` ADD CONSTRAINT `sm_about_pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_academic_years` ADD CONSTRAINT `sm_academic_years_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_add_expenses` ADD CONSTRAINT `sm_add_expenses_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_add_expenses` ADD CONSTRAINT `sm_add_expenses_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_add_incomes` ADD CONSTRAINT `sm_add_incomes_account_id_sm_bank_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `sm_bank_accounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_add_incomes` ADD CONSTRAINT `sm_add_incomes_payment_method_id_sm_payment_methhods_id_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `sm_payment_methhods`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_add_incomes` ADD CONSTRAINT `sm_add_incomes_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_add_incomes` ADD CONSTRAINT `sm_add_incomes_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_admission_queries` ADD CONSTRAINT `sm_admission_queries_class_sm_classes_id_fk` FOREIGN KEY (`class`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_admission_queries` ADD CONSTRAINT `sm_admission_queries_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_admission_queries` ADD CONSTRAINT `sm_admission_queries_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_admission_query_followups` ADD CONSTRAINT `sqf_admission_query_id_fk` FOREIGN KEY (`admission_query_id`) REFERENCES `sm_admission_queries`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_admission_query_followups` ADD CONSTRAINT `sqf_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_admission_query_followups` ADD CONSTRAINT `sqf_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_amount_transfers` ADD CONSTRAINT `sm_amount_transfers_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_amount_transfers` ADD CONSTRAINT `sm_amount_transfers_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_class_teachers` ADD CONSTRAINT `sact_class_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_class_teachers` ADD CONSTRAINT `sact_section_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_class_teachers` ADD CONSTRAINT `sact_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_class_teachers` ADD CONSTRAINT `sact_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_subjects` ADD CONSTRAINT `sm_assign_subjects_teacher_id_sm_staffs_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_subjects` ADD CONSTRAINT `sm_assign_subjects_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_subjects` ADD CONSTRAINT `sm_assign_subjects_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_subjects` ADD CONSTRAINT `sm_assign_subjects_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_subjects` ADD CONSTRAINT `sm_assign_subjects_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_subjects` ADD CONSTRAINT `sm_assign_subjects_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_vehicles` ADD CONSTRAINT `sm_assign_vehicles_vehicle_id_sm_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `sm_vehicles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_vehicles` ADD CONSTRAINT `sm_assign_vehicles_route_id_sm_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `sm_routes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_vehicles` ADD CONSTRAINT `sm_assign_vehicles_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_assign_vehicles` ADD CONSTRAINT `sm_assign_vehicles_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_background_settings` ADD CONSTRAINT `sm_background_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_backups` ADD CONSTRAINT `sm_backups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_backups` ADD CONSTRAINT `sm_backups_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_bank_accounts` ADD CONSTRAINT `sm_bank_accounts_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_bank_accounts` ADD CONSTRAINT `sm_bank_accounts_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_bank_payment_slips` ADD CONSTRAINT `sm_bank_payment_slips_fees_discount_id_sm_fees_discounts_id_fk` FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_bank_payment_slips` ADD CONSTRAINT `sm_bank_payment_slips_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_bank_payment_slips` ADD CONSTRAINT `sm_bank_payment_slips_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_base_groups` ADD CONSTRAINT `sm_base_groups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_base_setups` ADD CONSTRAINT `sm_base_setups_base_group_id_sm_base_groups_id_fk` FOREIGN KEY (`base_group_id`) REFERENCES `sm_base_groups`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_base_setups` ADD CONSTRAINT `sm_base_setups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_book_categories` ADD CONSTRAINT `sm_book_categories_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_book_categories` ADD CONSTRAINT `sm_book_categories_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_book_issues` ADD CONSTRAINT `sm_book_issues_book_id_sm_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `sm_books`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_book_issues` ADD CONSTRAINT `sm_book_issues_member_id_users_id_fk` FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_book_issues` ADD CONSTRAINT `sm_book_issues_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_book_issues` ADD CONSTRAINT `sm_book_issues_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_books` ADD CONSTRAINT `sm_books_book_category_id_sm_book_categories_id_fk` FOREIGN KEY (`book_category_id`) REFERENCES `sm_book_categories`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_books` ADD CONSTRAINT `sm_books_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_books` ADD CONSTRAINT `sm_books_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_calendar_settings` ADD CONSTRAINT `sm_calendar_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_chart_of_accounts` ADD CONSTRAINT `sm_chart_of_accounts_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_chart_of_accounts` ADD CONSTRAINT `sm_chart_of_accounts_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_exam_routine_pages` ADD CONSTRAINT `sm_class_exam_routine_pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_optional_subject` ADD CONSTRAINT `sm_class_optional_subject_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_optional_subject` ADD CONSTRAINT `sm_class_optional_subject_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_rooms` ADD CONSTRAINT `sm_class_rooms_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_rooms` ADD CONSTRAINT `sm_class_rooms_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_room_id_sm_class_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `sm_class_rooms`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_teacher_id_sm_staffs_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_class_period_id_sm_class_times_id_fk` FOREIGN KEY (`class_period_id`) REFERENCES `sm_class_times`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routine_updates` ADD CONSTRAINT `sm_class_routine_updates_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routines` ADD CONSTRAINT `sm_class_routines_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routines` ADD CONSTRAINT `sm_class_routines_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routines` ADD CONSTRAINT `sm_class_routines_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routines` ADD CONSTRAINT `sm_class_routines_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_routines` ADD CONSTRAINT `sm_class_routines_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_sections` ADD CONSTRAINT `sm_class_sections_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_sections` ADD CONSTRAINT `sm_class_sections_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_sections` ADD CONSTRAINT `sm_class_sections_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_sections` ADD CONSTRAINT `sm_class_sections_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_teachers` ADD CONSTRAINT `sm_class_teachers_teacher_id_sm_staffs_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_teachers` ADD CONSTRAINT `sm_class_teachers_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_teachers` ADD CONSTRAINT `sm_class_teachers_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_teachers` ADD CONSTRAINT `sct_assign_class_teacher_id_fk` FOREIGN KEY (`assign_class_teacher_id`) REFERENCES `sm_assign_class_teachers`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_times` ADD CONSTRAINT `sm_class_times_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_class_times` ADD CONSTRAINT `sm_class_times_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_classes` ADD CONSTRAINT `sm_classes_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_classes` ADD CONSTRAINT `sm_classes_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_complaints` ADD CONSTRAINT `sm_complaints_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_complaints` ADD CONSTRAINT `sm_complaints_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_contact_messages` ADD CONSTRAINT `sm_contact_messages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_contact_pages` ADD CONSTRAINT `sm_contact_pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_content_types` ADD CONSTRAINT `sm_content_types_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_content_types` ADD CONSTRAINT `sm_content_types_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_countries` ADD CONSTRAINT `sm_countries_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_course_pages` ADD CONSTRAINT `sm_course_pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_courses` ADD CONSTRAINT `sm_courses_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_currencies` ADD CONSTRAINT `sm_currencies_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_custom_links` ADD CONSTRAINT `sm_custom_links_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_custom_temporary_results` ADD CONSTRAINT `sm_custom_temporary_results_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_custom_temporary_results` ADD CONSTRAINT `sm_custom_temporary_results_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_dashboard_settings` ADD CONSTRAINT `sm_dashboard_settings_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_dashboard_settings` ADD CONSTRAINT `sm_dashboard_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_date_formats` ADD CONSTRAINT `sm_date_formats_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_designations` ADD CONSTRAINT `sm_designations_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_donors` ADD CONSTRAINT `sm_donors_bloodgroup_id_sm_base_setups_id_fk` FOREIGN KEY (`bloodgroup_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_donors` ADD CONSTRAINT `sm_donors_religion_id_sm_base_setups_id_fk` FOREIGN KEY (`religion_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_donors` ADD CONSTRAINT `sm_donors_gender_id_sm_base_setups_id_fk` FOREIGN KEY (`gender_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_donors` ADD CONSTRAINT `sm_donors_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_dormitory_lists` ADD CONSTRAINT `sm_dormitory_lists_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_dormitory_lists` ADD CONSTRAINT `sm_dormitory_lists_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_email_settings` ADD CONSTRAINT `sm_email_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_email_settings` ADD CONSTRAINT `sm_email_settings_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_email_sms_logs` ADD CONSTRAINT `sm_email_sms_logs_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_email_sms_logs` ADD CONSTRAINT `sm_email_sms_logs_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_events` ADD CONSTRAINT `sm_events_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_events` ADD CONSTRAINT `sm_events_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_exam_attendance_id_fk` FOREIGN KEY (`exam_attendance_id`) REFERENCES `sm_exam_attendances`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_student_record_id_fk` FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_class_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_section_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendance_children` ADD CONSTRAINT `seac_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendances` ADD CONSTRAINT `sm_exam_attendances_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendances` ADD CONSTRAINT `sm_exam_attendances_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendances` ADD CONSTRAINT `sm_exam_attendances_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendances` ADD CONSTRAINT `sm_exam_attendances_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendances` ADD CONSTRAINT `sm_exam_attendances_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_attendances` ADD CONSTRAINT `sm_exam_attendances_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_marks_registers` ADD CONSTRAINT `sm_exam_marks_registers_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_marks_registers` ADD CONSTRAINT `sm_exam_marks_registers_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_marks_registers` ADD CONSTRAINT `sm_exam_marks_registers_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_marks_registers` ADD CONSTRAINT `sm_exam_marks_registers_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_marks_registers` ADD CONSTRAINT `sm_exam_marks_registers_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedule_subjects` ADD CONSTRAINT `sess_exam_schedule_id_fk` FOREIGN KEY (`exam_schedule_id`) REFERENCES `sm_exam_schedules`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedule_subjects` ADD CONSTRAINT `sess_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedule_subjects` ADD CONSTRAINT `sess_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedule_subjects` ADD CONSTRAINT `sess_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_exam_period_id_sm_class_times_id_fk` FOREIGN KEY (`exam_period_id`) REFERENCES `sm_class_times`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_exam_term_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_term_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_teacher_id_sm_staffs_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_schedules` ADD CONSTRAINT `sm_exam_schedules_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_settings` ADD CONSTRAINT `sm_exam_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_settings` ADD CONSTRAINT `sm_exam_settings_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_exam_term_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_term_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_setups` ADD CONSTRAINT `sm_exam_setups_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_signatures` ADD CONSTRAINT `sm_exam_signatures_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_signatures` ADD CONSTRAINT `sm_exam_signatures_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_types` ADD CONSTRAINT `sm_exam_types_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exam_types` ADD CONSTRAINT `sm_exam_types_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exams` ADD CONSTRAINT `sm_exams_exam_type_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exams` ADD CONSTRAINT `sm_exams_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exams` ADD CONSTRAINT `sm_exams_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exams` ADD CONSTRAINT `sm_exams_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exams` ADD CONSTRAINT `sm_exams_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_exams` ADD CONSTRAINT `sm_exams_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_expense_heads` ADD CONSTRAINT `sm_expense_heads_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_expense_heads` ADD CONSTRAINT `sm_expense_heads_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_expert_teachers` ADD CONSTRAINT `sm_expert_teachers_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assign_discounts` ADD CONSTRAINT `sfad_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assign_discounts` ADD CONSTRAINT `sfad_fees_discount_id_fk` FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assign_discounts` ADD CONSTRAINT `sfad_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assign_discounts` ADD CONSTRAINT `sfad_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assigns` ADD CONSTRAINT `sm_fees_assigns_fees_master_id_sm_fees_masters_id_fk` FOREIGN KEY (`fees_master_id`) REFERENCES `sm_fees_masters`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assigns` ADD CONSTRAINT `sm_fees_assigns_fees_discount_id_sm_fees_discounts_id_fk` FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assigns` ADD CONSTRAINT `sm_fees_assigns_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assigns` ADD CONSTRAINT `sm_fees_assigns_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_assigns` ADD CONSTRAINT `sm_fees_assigns_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_carry_forwards` ADD CONSTRAINT `sm_fees_carry_forwards_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_carry_forwards` ADD CONSTRAINT `sm_fees_carry_forwards_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_carry_forwards` ADD CONSTRAINT `sm_fees_carry_forwards_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_discounts` ADD CONSTRAINT `sm_fees_discounts_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_discounts` ADD CONSTRAINT `sm_fees_discounts_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_groups` ADD CONSTRAINT `sm_fees_groups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_groups` ADD CONSTRAINT `sm_fees_groups_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_masters` ADD CONSTRAINT `sm_fees_masters_fees_group_id_sm_fees_groups_id_fk` FOREIGN KEY (`fees_group_id`) REFERENCES `sm_fees_groups`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_masters` ADD CONSTRAINT `sm_fees_masters_fees_type_id_sm_fees_types_id_fk` FOREIGN KEY (`fees_type_id`) REFERENCES `sm_fees_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_masters` ADD CONSTRAINT `sm_fees_masters_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_masters` ADD CONSTRAINT `sm_fees_masters_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_assign_id_sm_fees_assigns_id_fk` FOREIGN KEY (`assign_id`) REFERENCES `sm_fees_assigns`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_bank_id_sm_bank_accounts_id_fk` FOREIGN KEY (`bank_id`) REFERENCES `sm_bank_accounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_fees_discount_id_sm_fees_discounts_id_fk` FOREIGN KEY (`fees_discount_id`) REFERENCES `sm_fees_discounts`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_fees_type_id_sm_fees_types_id_fk` FOREIGN KEY (`fees_type_id`) REFERENCES `sm_fees_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_payments` ADD CONSTRAINT `sm_fees_payments_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_types` ADD CONSTRAINT `sm_fees_types_fees_group_id_sm_fees_groups_id_fk` FOREIGN KEY (`fees_group_id`) REFERENCES `sm_fees_groups`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_types` ADD CONSTRAINT `sm_fees_types_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_fees_types` ADD CONSTRAINT `sm_fees_types_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_form_downloads` ADD CONSTRAINT `sm_form_downloads_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_frontend_persmissions` ADD CONSTRAINT `sm_frontend_persmissions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_general_settings` ADD CONSTRAINT `sm_general_settings_session_id_sm_academic_years_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_general_settings` ADD CONSTRAINT `sm_general_settings_language_id_sm_languages_id_fk` FOREIGN KEY (`language_id`) REFERENCES `sm_languages`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_general_settings` ADD CONSTRAINT `sm_general_settings_date_format_id_sm_date_formats_id_fk` FOREIGN KEY (`date_format_id`) REFERENCES `sm_date_formats`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_general_settings` ADD CONSTRAINT `sm_general_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_general_settings` ADD CONSTRAINT `sm_general_settings_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_header_menu_managers` ADD CONSTRAINT `sm_header_menu_managers_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_holidays` ADD CONSTRAINT `sm_holidays_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_holidays` ADD CONSTRAINT `sm_holidays_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_home_page_settings` ADD CONSTRAINT `sm_home_page_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homework_students` ADD CONSTRAINT `sm_homework_students_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homework_students` ADD CONSTRAINT `sm_homework_students_homework_id_sm_homeworks_id_fk` FOREIGN KEY (`homework_id`) REFERENCES `sm_homeworks`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homework_students` ADD CONSTRAINT `sm_homework_students_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homework_students` ADD CONSTRAINT `sm_homework_students_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homeworks` ADD CONSTRAINT `sm_homeworks_evaluated_by_users_id_fk` FOREIGN KEY (`evaluated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homeworks` ADD CONSTRAINT `sm_homeworks_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homeworks` ADD CONSTRAINT `sm_homeworks_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homeworks` ADD CONSTRAINT `sm_homeworks_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_homeworks` ADD CONSTRAINT `sm_homeworks_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hourly_rates` ADD CONSTRAINT `sm_hourly_rates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hourly_rates` ADD CONSTRAINT `sm_hourly_rates_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_payroll_earn_deducs` ADD CONSTRAINT `shped_payroll_gen_id_fk` FOREIGN KEY (`payroll_generate_id`) REFERENCES `sm_hr_payroll_generates`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_payroll_earn_deducs` ADD CONSTRAINT `shped_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_payroll_earn_deducs` ADD CONSTRAINT `shped_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_payroll_generates` ADD CONSTRAINT `sm_hr_payroll_generates_staff_id_sm_staffs_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_payroll_generates` ADD CONSTRAINT `sm_hr_payroll_generates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_payroll_generates` ADD CONSTRAINT `sm_hr_payroll_generates_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_salary_templates` ADD CONSTRAINT `sm_hr_salary_templates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_hr_salary_templates` ADD CONSTRAINT `sm_hr_salary_templates_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_human_departments` ADD CONSTRAINT `sm_human_departments_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_human_departments` ADD CONSTRAINT `sm_human_departments_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_human_departments` ADD CONSTRAINT `sm_human_departments_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_income_heads` ADD CONSTRAINT `sm_income_heads_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_income_heads` ADD CONSTRAINT `sm_income_heads_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_instructions` ADD CONSTRAINT `sm_instructions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_inventory_payments` ADD CONSTRAINT `sm_inventory_payments_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_inventory_payments` ADD CONSTRAINT `sm_inventory_payments_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_categories` ADD CONSTRAINT `sm_item_categories_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_categories` ADD CONSTRAINT `sm_item_categories_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_issues` ADD CONSTRAINT `sm_item_issues_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_issues` ADD CONSTRAINT `sm_item_issues_item_category_id_sm_item_categories_id_fk` FOREIGN KEY (`item_category_id`) REFERENCES `sm_item_categories`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_issues` ADD CONSTRAINT `sm_item_issues_item_id_sm_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `sm_items`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_issues` ADD CONSTRAINT `sm_item_issues_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_issues` ADD CONSTRAINT `sm_item_issues_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receive_children` ADD CONSTRAINT `sm_item_receive_children_item_id_sm_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `sm_items`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receive_children` ADD CONSTRAINT `sm_item_receive_children_item_receive_id_sm_item_receives_id_fk` FOREIGN KEY (`item_receive_id`) REFERENCES `sm_item_receives`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receive_children` ADD CONSTRAINT `sm_item_receive_children_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receive_children` ADD CONSTRAINT `sm_item_receive_children_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receives` ADD CONSTRAINT `sm_item_receives_supplier_id_sm_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `sm_suppliers`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receives` ADD CONSTRAINT `sm_item_receives_store_id_sm_item_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `sm_item_stores`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receives` ADD CONSTRAINT `sm_item_receives_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_receives` ADD CONSTRAINT `sm_item_receives_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_sell_children` ADD CONSTRAINT `sm_item_sell_children_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_sell_children` ADD CONSTRAINT `sm_item_sell_children_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_sells` ADD CONSTRAINT `sm_item_sells_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_sells` ADD CONSTRAINT `sm_item_sells_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_sells` ADD CONSTRAINT `sm_item_sells_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_stores` ADD CONSTRAINT `sm_item_stores_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_item_stores` ADD CONSTRAINT `sm_item_stores_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_items` ADD CONSTRAINT `sm_items_item_category_id_sm_item_categories_id_fk` FOREIGN KEY (`item_category_id`) REFERENCES `sm_item_categories`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_items` ADD CONSTRAINT `sm_items_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_items` ADD CONSTRAINT `sm_items_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_language_phrases` ADD CONSTRAINT `sm_language_phrases_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_languages` ADD CONSTRAINT `sm_languages_lang_id_languages_id_fk` FOREIGN KEY (`lang_id`) REFERENCES `languages`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_languages` ADD CONSTRAINT `sm_languages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_deduction_infos` ADD CONSTRAINT `sm_leave_deduction_infos_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_deduction_infos` ADD CONSTRAINT `sm_leave_deduction_infos_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_defines` ADD CONSTRAINT `sm_leave_defines_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_defines` ADD CONSTRAINT `sm_leave_defines_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_defines` ADD CONSTRAINT `sm_leave_defines_type_id_sm_leave_types_id_fk` FOREIGN KEY (`type_id`) REFERENCES `sm_leave_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_defines` ADD CONSTRAINT `sm_leave_defines_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_defines` ADD CONSTRAINT `sm_leave_defines_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_requests` ADD CONSTRAINT `sm_leave_requests_leave_define_id_sm_leave_defines_id_fk` FOREIGN KEY (`leave_define_id`) REFERENCES `sm_leave_defines`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_requests` ADD CONSTRAINT `sm_leave_requests_staff_id_users_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_requests` ADD CONSTRAINT `sm_leave_requests_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_requests` ADD CONSTRAINT `sm_leave_requests_type_id_sm_leave_types_id_fk` FOREIGN KEY (`type_id`) REFERENCES `sm_leave_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_requests` ADD CONSTRAINT `sm_leave_requests_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_requests` ADD CONSTRAINT `sm_leave_requests_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_types` ADD CONSTRAINT `sm_leave_types_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_leave_types` ADD CONSTRAINT `sm_leave_types_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_details` ADD CONSTRAINT `sm_lesson_details_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_details` ADD CONSTRAINT `sm_lesson_details_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_details` ADD CONSTRAINT `sm_lesson_details_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_details` ADD CONSTRAINT `sm_lesson_details_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_details` ADD CONSTRAINT `sm_lesson_details_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topic_details` ADD CONSTRAINT `sm_lesson_topic_details_topic_id_sm_lesson_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `sm_lesson_topics`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topic_details` ADD CONSTRAINT `sm_lesson_topic_details_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topic_details` ADD CONSTRAINT `sm_lesson_topic_details_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topics` ADD CONSTRAINT `sm_lesson_topics_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topics` ADD CONSTRAINT `sm_lesson_topics_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topics` ADD CONSTRAINT `sm_lesson_topics_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topics` ADD CONSTRAINT `sm_lesson_topics_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lesson_topics` ADD CONSTRAINT `sm_lesson_topics_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lessons` ADD CONSTRAINT `sm_lessons_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lessons` ADD CONSTRAINT `sm_lessons_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lessons` ADD CONSTRAINT `sm_lessons_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lessons` ADD CONSTRAINT `sm_lessons_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_lessons` ADD CONSTRAINT `sm_lessons_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_library_members` ADD CONSTRAINT `sm_library_members_member_type_roles_id_fk` FOREIGN KEY (`member_type`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_library_members` ADD CONSTRAINT `sm_library_members_student_staff_id_users_id_fk` FOREIGN KEY (`student_staff_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_library_members` ADD CONSTRAINT `sm_library_members_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_library_members` ADD CONSTRAINT `sm_library_members_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_exam_term_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_term_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_exam_setup_id_sm_exam_setups_id_fk` FOREIGN KEY (`exam_setup_id`) REFERENCES `sm_exam_setups`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_student_record_id_student_records_id_fk` FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_mark_stores` ADD CONSTRAINT `sm_mark_stores_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_grades` ADD CONSTRAINT `sm_marks_grades_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_grades` ADD CONSTRAINT `sm_marks_grades_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_register_children` ADD CONSTRAINT `smrc_marks_reg_id_fk` FOREIGN KEY (`marks_register_id`) REFERENCES `sm_marks_registers`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_register_children` ADD CONSTRAINT `smrc_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_register_children` ADD CONSTRAINT `smrc_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_register_children` ADD CONSTRAINT `smrc_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_registers` ADD CONSTRAINT `sm_marks_registers_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_registers` ADD CONSTRAINT `sm_marks_registers_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_registers` ADD CONSTRAINT `sm_marks_registers_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_registers` ADD CONSTRAINT `sm_marks_registers_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_registers` ADD CONSTRAINT `sm_marks_registers_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_registers` ADD CONSTRAINT `sm_marks_registers_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_send_sms` ADD CONSTRAINT `sm_marks_send_sms_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_send_sms` ADD CONSTRAINT `sm_marks_send_sms_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_send_sms` ADD CONSTRAINT `sm_marks_send_sms_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_marks_send_sms` ADD CONSTRAINT `sm_marks_send_sms_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_links` ADD CONSTRAINT `sm_module_links_module_id_sm_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `sm_modules`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_links` ADD CONSTRAINT `sm_module_links_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_links` ADD CONSTRAINT `sm_module_links_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_links` ADD CONSTRAINT `sm_module_links_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_permission_assigns` ADD CONSTRAINT `smpa_module_id_fk` FOREIGN KEY (`module_id`) REFERENCES `sm_module_permissions`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_permission_assigns` ADD CONSTRAINT `smpa_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_permission_assigns` ADD CONSTRAINT `smpa_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_module_permissions` ADD CONSTRAINT `sm_module_permissions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_modules` ADD CONSTRAINT `sm_modules_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_news` ADD CONSTRAINT `sm_news_category_id_sm_news_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `sm_news_categories`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_news_comments` ADD CONSTRAINT `sm_news_comments_news_id_sm_news_id_fk` FOREIGN KEY (`news_id`) REFERENCES `sm_news`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_news_comments` ADD CONSTRAINT `sm_news_comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_news_pages` ADD CONSTRAINT `sm_news_pages_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_news_pages` ADD CONSTRAINT `sm_news_pages_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_news_pages` ADD CONSTRAINT `sm_news_pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_notice_boards` ADD CONSTRAINT `sm_notice_boards_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_notice_boards` ADD CONSTRAINT `sm_notice_boards_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_notification_settings` ADD CONSTRAINT `sm_notification_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_notifications` ADD CONSTRAINT `sm_notifications_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_notifications` ADD CONSTRAINT `sm_notifications_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_marks` ADD CONSTRAINT `sm_online_exam_marks_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_marks` ADD CONSTRAINT `sm_online_exam_marks_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_marks` ADD CONSTRAINT `sm_online_exam_marks_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_marks` ADD CONSTRAINT `sm_online_exam_marks_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_marks` ADD CONSTRAINT `sm_online_exam_marks_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_assigns` ADD CONSTRAINT `soeqa_online_exam_id_fk` FOREIGN KEY (`online_exam_id`) REFERENCES `sm_online_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_assigns` ADD CONSTRAINT `soeqa_question_bank_id_fk` FOREIGN KEY (`question_bank_id`) REFERENCES `sm_question_banks`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_assigns` ADD CONSTRAINT `soeqa_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_assigns` ADD CONSTRAINT `soeqa_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_mu_options` ADD CONSTRAINT `soeqmo_online_exam_q_id_fk` FOREIGN KEY (`online_exam_question_id`) REFERENCES `sm_online_exam_questions`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_mu_options` ADD CONSTRAINT `soeqmo_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_question_mu_options` ADD CONSTRAINT `soeqmo_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_questions` ADD CONSTRAINT `sm_online_exam_questions_online_exam_id_sm_online_exams_id_fk` FOREIGN KEY (`online_exam_id`) REFERENCES `sm_online_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_questions` ADD CONSTRAINT `sm_online_exam_questions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exam_questions` ADD CONSTRAINT `sm_online_exam_questions_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exams` ADD CONSTRAINT `sm_online_exams_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exams` ADD CONSTRAINT `sm_online_exams_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exams` ADD CONSTRAINT `sm_online_exams_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exams` ADD CONSTRAINT `sm_online_exams_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_online_exams` ADD CONSTRAINT `sm_online_exams_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_optional_subject_assigns` ADD CONSTRAINT `sosa_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_optional_subject_assigns` ADD CONSTRAINT `sosa_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_optional_subject_assigns` ADD CONSTRAINT `sosa_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_optional_subject_assigns` ADD CONSTRAINT `sosa_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_optional_subject_assigns` ADD CONSTRAINT `sosa_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_pages` ADD CONSTRAINT `sm_pages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_parents` ADD CONSTRAINT `sm_parents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_parents` ADD CONSTRAINT `sm_parents_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_parents` ADD CONSTRAINT `sm_parents_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_payment_gateway_settings` ADD CONSTRAINT `sm_payment_gateway_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_payment_methhods` ADD CONSTRAINT `sm_payment_methhods_gateway_id_sm_payment_gateway_settings_id_fk` FOREIGN KEY (`gateway_id`) REFERENCES `sm_payment_gateway_settings`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_payment_methhods` ADD CONSTRAINT `sm_payment_methhods_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_phone_call_logs` ADD CONSTRAINT `sm_phone_call_logs_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_phone_call_logs` ADD CONSTRAINT `sm_phone_call_logs_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_photo_galleries` ADD CONSTRAINT `sm_photo_galleries_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_postal_dispatches` ADD CONSTRAINT `sm_postal_dispatches_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_postal_dispatches` ADD CONSTRAINT `sm_postal_dispatches_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_postal_receives` ADD CONSTRAINT `sm_postal_receives_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_postal_receives` ADD CONSTRAINT `sm_postal_receives_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_product_purchases` ADD CONSTRAINT `sm_product_purchases_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_product_purchases` ADD CONSTRAINT `sm_product_purchases_staff_id_sm_staffs_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_product_purchases` ADD CONSTRAINT `sm_product_purchases_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_bank_mu_options` ADD CONSTRAINT `sm_question_bank_mu_options_question_bank_id_sm_question_banks_id_fk` FOREIGN KEY (`question_bank_id`) REFERENCES `sm_question_banks`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_bank_mu_options` ADD CONSTRAINT `sm_question_bank_mu_options_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_bank_mu_options` ADD CONSTRAINT `sm_question_bank_mu_options_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_banks` ADD CONSTRAINT `sm_question_banks_q_group_id_sm_question_groups_id_fk` FOREIGN KEY (`q_group_id`) REFERENCES `sm_question_groups`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_banks` ADD CONSTRAINT `sm_question_banks_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_banks` ADD CONSTRAINT `sm_question_banks_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_banks` ADD CONSTRAINT `sm_question_banks_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_banks` ADD CONSTRAINT `sm_question_banks_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_groups` ADD CONSTRAINT `sm_question_groups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_groups` ADD CONSTRAINT `sm_question_groups_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_levels` ADD CONSTRAINT `sm_question_levels_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_question_levels` ADD CONSTRAINT `sm_question_levels_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_exam_type_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_exam_setup_id_sm_exam_setups_id_fk` FOREIGN KEY (`exam_setup_id`) REFERENCES `sm_exam_setups`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_student_record_id_student_records_id_fk` FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_result_stores` ADD CONSTRAINT `sm_result_stores_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_role_permissions` ADD CONSTRAINT `sm_role_permissions_module_link_id_sm_module_links_id_fk` FOREIGN KEY (`module_link_id`) REFERENCES `sm_module_links`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_role_permissions` ADD CONSTRAINT `sm_role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sm_role_permissions` ADD CONSTRAINT `sm_role_permissions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_room_lists` ADD CONSTRAINT `sm_room_lists_dormitory_id_sm_dormitory_lists_id_fk` FOREIGN KEY (`dormitory_id`) REFERENCES `sm_dormitory_lists`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_room_lists` ADD CONSTRAINT `sm_room_lists_room_type_id_sm_room_types_id_fk` FOREIGN KEY (`room_type_id`) REFERENCES `sm_room_types`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_room_lists` ADD CONSTRAINT `sm_room_lists_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_room_lists` ADD CONSTRAINT `sm_room_lists_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_room_types` ADD CONSTRAINT `sm_room_types_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_room_types` ADD CONSTRAINT `sm_room_types_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_routes` ADD CONSTRAINT `sm_routes_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_routes` ADD CONSTRAINT `sm_routes_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plan_children` ADD CONSTRAINT `sm_seat_plan_children_seat_plan_id_sm_seat_plans_id_fk` FOREIGN KEY (`seat_plan_id`) REFERENCES `sm_seat_plans`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plan_children` ADD CONSTRAINT `sm_seat_plan_children_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plan_children` ADD CONSTRAINT `sm_seat_plan_children_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plans` ADD CONSTRAINT `sm_seat_plans_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plans` ADD CONSTRAINT `sm_seat_plans_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plans` ADD CONSTRAINT `sm_seat_plans_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plans` ADD CONSTRAINT `sm_seat_plans_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plans` ADD CONSTRAINT `sm_seat_plans_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_seat_plans` ADD CONSTRAINT `sm_seat_plans_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_sections` ADD CONSTRAINT `sm_sections_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_sections` ADD CONSTRAINT `sm_sections_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_send_messages` ADD CONSTRAINT `sm_send_messages_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_send_messages` ADD CONSTRAINT `sm_send_messages_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_sessions` ADD CONSTRAINT `sm_sessions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_setup_admins` ADD CONSTRAINT `sm_setup_admins_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_setup_admins` ADD CONSTRAINT `sm_setup_admins_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_sms_gateways` ADD CONSTRAINT `sm_sms_gateways_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_social_media_icons` ADD CONSTRAINT `sm_social_media_icons_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_attendance_imports` ADD CONSTRAINT `ssai_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_attendance_imports` ADD CONSTRAINT `ssai_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_attendance_imports` ADD CONSTRAINT `ssai_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_attendences` ADD CONSTRAINT `sm_staff_attendences_staff_id_sm_staffs_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `sm_staffs`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_attendences` ADD CONSTRAINT `sm_staff_attendences_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_attendences` ADD CONSTRAINT `sm_staff_attendences_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_registration_fields` ADD CONSTRAINT `sm_staff_registration_fields_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staff_registration_fields` ADD CONSTRAINT `sm_staff_registration_fields_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staffs` ADD CONSTRAINT `sm_staffs_designation_id_sm_designations_id_fk` FOREIGN KEY (`designation_id`) REFERENCES `sm_designations`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staffs` ADD CONSTRAINT `sm_staffs_department_id_sm_human_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `sm_human_departments`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staffs` ADD CONSTRAINT `sm_staffs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staffs` ADD CONSTRAINT `sm_staffs_role_id_infix_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staffs` ADD CONSTRAINT `sm_staffs_gender_id_sm_base_setups_id_fk` FOREIGN KEY (`gender_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_staffs` ADD CONSTRAINT `sm_staffs_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendance_imports` ADD CONSTRAINT `ssai_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendance_imports` ADD CONSTRAINT `ssai_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendance_imports` ADD CONSTRAINT `ssai_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendances` ADD CONSTRAINT `sm_student_attendances_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendances` ADD CONSTRAINT `sm_student_attendances_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendances` ADD CONSTRAINT `sm_student_attendances_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendances` ADD CONSTRAINT `sm_student_attendances_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_attendances` ADD CONSTRAINT `sm_student_attendances_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_categories` ADD CONSTRAINT `sm_student_categories_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_categories` ADD CONSTRAINT `sm_student_categories_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_certificates` ADD CONSTRAINT `sm_student_certificates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_certificates` ADD CONSTRAINT `sm_student_certificates_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_documents` ADD CONSTRAINT `sm_student_documents_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_documents` ADD CONSTRAINT `sm_student_documents_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_excel_formats` ADD CONSTRAINT `sm_student_excel_formats_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_excel_formats` ADD CONSTRAINT `sm_student_excel_formats_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_groups` ADD CONSTRAINT `sm_student_groups_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_groups` ADD CONSTRAINT `sm_student_groups_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_homeworks` ADD CONSTRAINT `sm_student_homeworks_evaluated_by_users_id_fk` FOREIGN KEY (`evaluated_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_homeworks` ADD CONSTRAINT `sm_student_homeworks_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_homeworks` ADD CONSTRAINT `sm_student_homeworks_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_homeworks` ADD CONSTRAINT `sm_student_homeworks_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_homeworks` ADD CONSTRAINT `sm_student_homeworks_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_id_cards` ADD CONSTRAINT `sm_student_id_cards_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_id_cards` ADD CONSTRAINT `sm_student_id_cards_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_previous_class_id_sm_classes_id_fk` FOREIGN KEY (`previous_class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_current_class_id_sm_classes_id_fk` FOREIGN KEY (`current_class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_previous_section_id_sm_sections_id_fk` FOREIGN KEY (`previous_section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_current_section_id_sm_sections_id_fk` FOREIGN KEY (`current_section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_previous_session_id_sm_academic_years_id_fk` FOREIGN KEY (`previous_session_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_current_session_id_sm_academic_years_id_fk` FOREIGN KEY (`current_session_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_promotions` ADD CONSTRAINT `sm_student_promotions_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_registration_fields` ADD CONSTRAINT `sm_student_registration_fields_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_registration_fields` ADD CONSTRAINT `sm_student_registration_fields_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exam_questions` ADD CONSTRAINT `sstoeq_take_online_exam_id_fk` FOREIGN KEY (`take_online_exam_id`) REFERENCES `sm_student_take_online_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exam_questions` ADD CONSTRAINT `sstoeq_question_bank_id_fk` FOREIGN KEY (`question_bank_id`) REFERENCES `sm_question_banks`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exam_questions` ADD CONSTRAINT `sstoeq_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exam_questions` ADD CONSTRAINT `sstoeq_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exams` ADD CONSTRAINT `sstoe_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exams` ADD CONSTRAINT `sstoe_online_exam_id_fk` FOREIGN KEY (`online_exam_id`) REFERENCES `sm_online_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exams` ADD CONSTRAINT `sstoe_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_online_exams` ADD CONSTRAINT `sstoe_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_onln_ex_ques_options` ADD CONSTRAINT `sstoeqo_take_oe_q_id_fk` FOREIGN KEY (`take_online_exam_question_id`) REFERENCES `sm_student_take_online_exam_questions`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_onln_ex_ques_options` ADD CONSTRAINT `sstoeqo_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_take_onln_ex_ques_options` ADD CONSTRAINT `sstoeqo_academic_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_timelines` ADD CONSTRAINT `sm_student_timelines_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_student_timelines` ADD CONSTRAINT `sm_student_timelines_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_bloodgroup_id_sm_base_setups_id_fk` FOREIGN KEY (`bloodgroup_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_religion_id_sm_base_setups_id_fk` FOREIGN KEY (`religion_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_route_list_id_sm_routes_id_fk` FOREIGN KEY (`route_list_id`) REFERENCES `sm_routes`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_dormitory_id_sm_dormitory_lists_id_fk` FOREIGN KEY (`dormitory_id`) REFERENCES `sm_dormitory_lists`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_vechile_id_sm_vehicles_id_fk` FOREIGN KEY (`vechile_id`) REFERENCES `sm_vehicles`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_room_id_sm_room_lists_id_fk` FOREIGN KEY (`room_id`) REFERENCES `sm_room_lists`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_student_category_id_sm_student_categories_id_fk` FOREIGN KEY (`student_category_id`) REFERENCES `sm_student_categories`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_student_group_id_sm_student_groups_id_fk` FOREIGN KEY (`student_group_id`) REFERENCES `sm_student_groups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_session_id_sm_academic_years_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_parent_id_sm_parents_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `sm_parents`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_role_id_infix_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_gender_id_sm_base_setups_id_fk` FOREIGN KEY (`gender_id`) REFERENCES `sm_base_setups`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_students` ADD CONSTRAINT `sm_students_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_styles` ADD CONSTRAINT `sm_styles_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_subject_id_sm_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `sm_subjects`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_student_record_id_student_records_id_fk` FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subject_attendances` ADD CONSTRAINT `sm_subject_attendances_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subjects` ADD CONSTRAINT `sm_subjects_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_subjects` ADD CONSTRAINT `sm_subjects_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_suppliers` ADD CONSTRAINT `sm_suppliers_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_teacher_upload_contents` ADD CONSTRAINT `sm_teacher_upload_contents_class_sm_classes_id_fk` FOREIGN KEY (`class`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_teacher_upload_contents` ADD CONSTRAINT `sm_teacher_upload_contents_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_teacher_upload_contents` ADD CONSTRAINT `sm_teacher_upload_contents_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_temporary_meritlists` ADD CONSTRAINT `sm_temporary_meritlists_exam_id_sm_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `sm_exams`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_temporary_meritlists` ADD CONSTRAINT `sm_temporary_meritlists_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_temporary_meritlists` ADD CONSTRAINT `sm_temporary_meritlists_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_temporary_meritlists` ADD CONSTRAINT `sm_temporary_meritlists_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_temporary_meritlists` ADD CONSTRAINT `sm_temporary_meritlists_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_testimonials` ADD CONSTRAINT `sm_testimonials_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_to_dos` ADD CONSTRAINT `sm_to_dos_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_to_dos` ADD CONSTRAINT `sm_to_dos_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_upload_contents` ADD CONSTRAINT `sm_upload_contents_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_upload_contents` ADD CONSTRAINT `sm_upload_contents_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_upload_homework_contents` ADD CONSTRAINT `sm_upload_homework_contents_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_upload_homework_contents` ADD CONSTRAINT `sm_upload_homework_contents_homework_id_sm_homeworks_id_fk` FOREIGN KEY (`homework_id`) REFERENCES `sm_homeworks`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_upload_homework_contents` ADD CONSTRAINT `sm_upload_homework_contents_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_upload_homework_contents` ADD CONSTRAINT `sm_upload_homework_contents_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_user_logs` ADD CONSTRAINT `sm_user_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_user_logs` ADD CONSTRAINT `sm_user_logs_role_id_infix_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_user_logs` ADD CONSTRAINT `sm_user_logs_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_user_logs` ADD CONSTRAINT `sm_user_logs_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_vehicles` ADD CONSTRAINT `sm_vehicles_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_vehicles` ADD CONSTRAINT `sm_vehicles_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_video_galleries` ADD CONSTRAINT `sm_video_galleries_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_visitors` ADD CONSTRAINT `sm_visitors_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_visitors` ADD CONSTRAINT `sm_visitors_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_weekends` ADD CONSTRAINT `sm_weekends_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sm_weekends` ADD CONSTRAINT `sm_weekends_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sms_templates` ADD CONSTRAINT `sms_templates_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `speech_sliders` ADD CONSTRAINT `speech_sliders_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `staff_import_bulk_temporaries` ADD CONSTRAINT `staff_import_bulk_temporaries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_academic_histories` ADD CONSTRAINT `student_academic_histories_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_academic_histories` ADD CONSTRAINT `student_academic_histories_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_academic_histories` ADD CONSTRAINT `student_academic_histories_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_ratings` ADD CONSTRAINT `student_ratings_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_ratings` ADD CONSTRAINT `student_ratings_exam_type_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_ratings` ADD CONSTRAINT `student_ratings_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_record_temporaries` ADD CONSTRAINT `student_record_temporaries_sm_student_id_sm_students_id_fk` FOREIGN KEY (`sm_student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_record_temporaries` ADD CONSTRAINT `student_record_temporaries_student_record_id_student_records_id_fk` FOREIGN KEY (`student_record_id`) REFERENCES `student_records`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_record_temporaries` ADD CONSTRAINT `student_record_temporaries_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_records` ADD CONSTRAINT `student_records_class_id_sm_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `sm_classes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_records` ADD CONSTRAINT `student_records_section_id_sm_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sm_sections`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_records` ADD CONSTRAINT `student_records_session_id_sm_academic_years_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_records` ADD CONSTRAINT `student_records_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_records` ADD CONSTRAINT `student_records_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `student_records` ADD CONSTRAINT `student_records_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `teacher_remarks` ADD CONSTRAINT `teacher_remarks_teacher_id_sm_staffs_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `sm_staffs`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `teacher_remarks` ADD CONSTRAINT `teacher_remarks_student_id_sm_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `sm_students`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `teacher_remarks` ADD CONSTRAINT `teacher_remarks_exam_type_id_sm_exam_types_id_fk` FOREIGN KEY (`exam_type_id`) REFERENCES `sm_exam_types`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `teacher_remarks` ADD CONSTRAINT `teacher_remarks_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `themes` ADD CONSTRAINT `themes_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `transcations` ADD CONSTRAINT `transcations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `two_factor_settings` ADD CONSTRAINT `two_factor_settings_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `user_otp_codes` ADD CONSTRAINT `user_otp_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_infix_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `infix_roles`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `video_uploads` ADD CONSTRAINT `video_uploads_academic_id_sm_academic_years_id_fk` FOREIGN KEY (`academic_id`) REFERENCES `sm_academic_years`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `video_uploads` ADD CONSTRAINT `video_uploads_school_id_sm_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `sm_schools`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `infixedu__pages_status_index` ON `infixedu__pages` (`status`);--> statement-breakpoint
CREATE INDEX `infixedu__pages_name_fulltext` ON `infixedu__pages` (`name`);--> statement-breakpoint
CREATE INDEX `jobs_queue_index` ON `jobs` (`queue`);--> statement-breakpoint
CREATE INDEX `notifications_notifiable_type_notifiable_id_index` ON `notifications` (`notifiable_type`,`notifiable_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_user_id_index` ON `oauth_access_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_clients_user_id_index` ON `oauth_clients` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_personal_access_clients_client_id_index` ON `oauth_personal_access_clients` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_access_token_id_index` ON `oauth_refresh_tokens` (`access_token_id`);--> statement-breakpoint
CREATE INDEX `password_resets_email_index` ON `password_resets` (`email`);--> statement-breakpoint
CREATE INDEX `personal_access_tokens_tokenable_type_tokenable_id_index` ON `personal_access_tokens` (`tokenable_type`,`tokenable_id`);--> statement-breakpoint
CREATE INDEX `sm_class_sections_class_id_section_id_index` ON `sm_class_sections` (`class_id`,`section_id`);