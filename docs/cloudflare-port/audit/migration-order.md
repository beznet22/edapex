# Migration load order (derived from FK graph)

Ported tables: 62 SMS tables + `ai_sessions` (separate, depends on `users`).
Cycle-participating tables: none

## Tier 0 — Root tenant

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `chatGroupUsers` | `chat_group_users` | — |
| 2 | `examMeritPositions` | `exam_merit_positions` | — |
| 3 | `smSchools` | `sm_schools` | — |

## Tier 1 — Reference / configuration

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `infixRoles` | `infix_roles` | sm_schools |
| 2 | `languages` | `languages` | sm_schools |
| 3 | `smAcademicYears` | `sm_academic_years` | sm_schools |
| 4 | `smBaseGroups` | `sm_base_groups` | sm_schools |
| 5 | `smDateFormats` | `sm_date_formats` | sm_schools |
| 6 | `smDesignations` | `sm_designations` | sm_schools |
| 7 | `smHumanDepartments` | `sm_human_departments` | sm_schools |

## Tier 2 — Academic structure

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `smBankAccounts` | `sm_bank_accounts` | sm_schools, sm_academic_years |
| 2 | `smBaseSetups` | `sm_base_setups` | sm_base_groups, sm_schools |
| 3 | `smClassRooms` | `sm_class_rooms` | sm_schools, sm_academic_years |
| 4 | `smClassTimes` | `sm_class_times` | sm_schools, sm_academic_years |
| 5 | `smClasses` | `sm_classes` | sm_schools, sm_academic_years |
| 6 | `smDormitoryLists` | `sm_dormitory_lists` | sm_schools, sm_academic_years |
| 7 | `smEvents` | `sm_events` | sm_schools, sm_academic_years |
| 8 | `smExamTypes` | `sm_exam_types` | sm_schools, sm_academic_years |
| 9 | `smFeesDiscounts` | `sm_fees_discounts` | sm_schools, sm_academic_years |
| 10 | `smFeesGroups` | `sm_fees_groups` | sm_schools, sm_academic_years |
| 11 | `smHolidays` | `sm_holidays` | sm_schools, sm_academic_years |
| 12 | `smLanguages` | `sm_languages` | languages, sm_schools |
| 13 | `smMarksGrades` | `sm_marks_grades` | sm_schools, sm_academic_years |
| 14 | `smNoticeBoards` | `sm_notice_boards` | sm_schools, sm_academic_years |
| 15 | `smRoomTypes` | `sm_room_types` | sm_schools, sm_academic_years |
| 16 | `smRoutes` | `sm_routes` | sm_schools, sm_academic_years |
| 17 | `smSections` | `sm_sections` | sm_schools, sm_academic_years |
| 18 | `smStudentCategories` | `sm_student_categories` | sm_schools, sm_academic_years |
| 19 | `smStudentGroups` | `sm_student_groups` | sm_schools, sm_academic_years |
| 20 | `smStudentTimelines` | `sm_student_timelines` | sm_schools, sm_academic_years |
| 21 | `smSubjects` | `sm_subjects` | sm_schools, sm_academic_years |
| 22 | `smVehicles` | `sm_vehicles` | sm_schools, sm_academic_years |
| 23 | `users` | `users` | sm_schools, infix_roles |

## Tier 3 — People (identity → profiles)

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `smAssignClassTeachers` | `sm_assign_class_teachers` | sm_classes, sm_sections, sm_schools, sm_academic_years |
| 2 | `smClassRoutines` | `sm_class_routines` | sm_classes, sm_sections, sm_subjects, sm_schools, sm_academic_years |
| 3 | `smClassSections` | `sm_class_sections` | sm_classes, sm_sections, sm_schools, sm_academic_years |
| 4 | `smExams` | `sm_exams` | sm_exam_types, sm_classes, sm_sections, sm_subjects, sm_schools, sm_academic_years |
| 5 | `smFeesTypes` | `sm_fees_types` | sm_fees_groups, sm_schools, sm_academic_years |
| 6 | `smGeneralSettings` | `sm_general_settings` | sm_academic_years, sm_languages, sm_date_formats, sm_schools |
| 7 | `smHomeworks` | `sm_homeworks` | users, sm_classes, sm_subjects, sm_schools, sm_academic_years |
| 8 | `smParents` | `sm_parents` | users, sm_schools, sm_academic_years |
| 9 | `smRoomLists` | `sm_room_lists` | sm_dormitory_lists, sm_room_types, sm_schools, sm_academic_years |
| 10 | `smStaffs` | `sm_staffs` | sm_designations, sm_human_departments, users, infix_roles, sm_base_setups, sm_schools |

## Tier 4 — Enrolment & assignments

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `chatGroups` | `chat_groups` | sm_classes, sm_sections, sm_subjects, sm_staffs, sm_schools, sm_academic_years |
| 2 | `smAssignSubjects` | `sm_assign_subjects` | sm_staffs, sm_classes, sm_sections, sm_subjects, sm_schools, sm_academic_years |
| 3 | `smClassRoutineUpdates` | `sm_class_routine_updates` | sm_class_rooms, sm_staffs, sm_class_times, sm_subjects, sm_classes, sm_sections, sm_schools, sm_academic_years |
| 4 | `smClassTeachers` | `sm_class_teachers` | sm_staffs, sm_schools, sm_academic_years, sm_assign_class_teachers |
| 5 | `smExamSchedules` | `sm_exam_schedules` | sm_class_times, sm_subjects, sm_exam_types, sm_exams, sm_classes, sm_sections, sm_staffs, sm_schools, sm_academic_years |
| 6 | `smExamSetups` | `sm_exam_setups` | sm_exams, sm_classes, sm_subjects, sm_sections, sm_exam_types, sm_schools, sm_academic_years |
| 7 | `smFeesMasters` | `sm_fees_masters` | sm_fees_groups, sm_fees_types, sm_schools, sm_academic_years |
| 8 | `smStudents` | `sm_students` | sm_base_setups, sm_routes, sm_dormitory_lists, sm_vehicles, sm_room_lists, sm_student_categories, sm_student_groups, sm_classes, sm_sections, sm_academic_years, sm_parents, users, infix_roles, sm_schools |

## Tier 5 — Operational / assessment

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `classAttendances` | `class_attendances` | sm_exam_types, sm_students, sm_schools, sm_academic_years |
| 2 | `smFeesAssigns` | `sm_fees_assigns` | sm_fees_masters, sm_fees_discounts, sm_students, sm_schools, sm_academic_years |
| 3 | `smHomeworkStudents` | `sm_homework_students` | sm_students, sm_homeworks, sm_schools, sm_academic_years |
| 4 | `smStudentAttendances` | `sm_student_attendances` | sm_students, sm_classes, sm_sections, sm_schools, sm_academic_years |
| 5 | `smStudentPromotions` | `sm_student_promotions` | sm_classes, sm_sections, sm_academic_years, sm_students, sm_schools |
| 6 | `studentRatings` | `student_ratings` | sm_students, sm_exam_types, sm_academic_years |
| 7 | `studentRecords` | `student_records` | sm_classes, sm_sections, sm_academic_years, sm_schools, sm_students |
| 8 | `teacherRemarks` | `teacher_remarks` | sm_staffs, sm_students, sm_exam_types, sm_academic_years |

## Tier 6 — Transactional

| # | Table | DB name | Depends on |
|---|---|---|---|
| 1 | `smFeesPayments` | `sm_fees_payments` | sm_fees_assigns, sm_bank_accounts, sm_fees_discounts, sm_fees_types, sm_students, sm_schools, sm_academic_years |
| 2 | `smMarkStores` | `sm_mark_stores` | sm_subjects, sm_exam_types, sm_exam_setups, sm_students, student_records, sm_classes, sm_sections, sm_schools, sm_academic_years |
| 3 | `smResultStores` | `sm_result_stores` | sm_exam_types, sm_subjects, sm_exam_setups, sm_students, student_records, sm_classes, sm_sections, sm_schools, sm_academic_years |
