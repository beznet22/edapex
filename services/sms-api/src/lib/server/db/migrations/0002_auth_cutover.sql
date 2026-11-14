ALTER TABLE `auth_events` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `users` ADD `claim_status` text;--> statement-breakpoint
CREATE INDEX `users_claim_status_index` ON `users` (`school_id`,`claim_status`);