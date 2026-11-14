ALTER TABLE `auth_magic_links` ADD `subject_type` text;--> statement-breakpoint
ALTER TABLE `auth_magic_links` ADD `subject_id` integer;--> statement-breakpoint
ALTER TABLE `auth_magic_links` ADD `school_id` integer REFERENCES sm_schools(id);--> statement-breakpoint
ALTER TABLE `auth_magic_links` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `auth_magic_links` ADD `revoked_at` integer;