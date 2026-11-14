CREATE INDEX `sm_mark_stores_school_academic_term_class_section_index` ON `sm_mark_stores` (`school_id`,`academic_id`,`exam_term_id`,`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `sm_result_stores_school_academic_exam_class_section_index` ON `sm_result_stores` (`school_id`,`academic_id`,`exam_type_id`,`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `sm_student_attendances_school_academic_class_section_index` ON `sm_student_attendances` (`school_id`,`academic_id`,`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `student_ratings_academic_student_term_index` ON `student_ratings` (`academic_id`,`student_id`,`exam_type_id`);--> statement-breakpoint
CREATE INDEX `teacher_remarks_academic_student_term_index` ON `teacher_remarks` (`academic_id`,`student_id`,`exam_type_id`);--> statement-breakpoint
CREATE INDEX `sm_fees_assigns_school_academic_student_index` ON `sm_fees_assigns` (`school_id`,`academic_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `sm_students_school_academic_class_section_index` ON `sm_students` (`school_id`,`academic_id`,`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `student_records_school_academic_student_default_index` ON `student_records` (`school_id`,`academic_id`,`student_id`,`is_default`);--> statement-breakpoint
CREATE INDEX `sm_assign_subjects_school_academic_class_section_index` ON `sm_assign_subjects` (`school_id`,`academic_id`,`class_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `sm_class_sections_school_academic_class_section_index` ON `sm_class_sections` (`school_id`,`academic_id`,`class_id`,`section_id`);