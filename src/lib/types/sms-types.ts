export const DESIGNATIONS = [
  null, // index 0 (unused)
  "ict_admin", // 1
  "ict_tutor", // 2
  "principal", // 3
  "admin", // 4
  "eyfs_coodinator", // 5
  "graders_coordinator", // 6
  "lab_attendant", // 7
  "class_teacher", // 8
  "it_support", // 9
  "human_resources_manager", // 10
  "head_of_operations", // 11
  "general_staff", // 12
  "librarian", // 13
  "e_learning_coordinator", // 14
  "data_analyst", // 15
  "finance_manager", // 16
] as const;

export const DESIGNATION_TITLES = [
  null,
  "ICT Admin",
  "ICT Tutor",
  "Principal",
  "Admin",
  "EYFS Coodinator",
  "GRADERS Coordinator",
  "Lab Attendant",
  "Class Teacher",
  "IT Support",
  "Human Resources Manager",
  "Head of Operations",
  "General Staff",
  "Librarian",
  "E-Learning Coordinator",
  "Data Analyst",
  "Finance Manager",
] as const;

export type Designation = Exclude<(typeof DESIGNATIONS)[number], null>;

