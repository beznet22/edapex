export const DESIGNATIONS = [
  undefined, // index 0 (unused)
  "it", // 1
  "coding_&_robotics", // 2
  "principal", // 3
  "admin", // 4
  "coordinator", // 5
  "projects", // 6
  "technician", // 7
  "class_teacher", // 8
  "it_support", // 9
  "human_resource", // 10
  "operations", // 11
  "general_staff", // 12
  "librarian", // 13
  "e_learning", // 14
  "data_analyst", // 15
  "finance", // 16
] as const;

export const DESIGNATION_TITLES = [
  undefined,
  "IT",
  "Coding & Robotics",
  "Principal",
  "Admin",
  "Coodinator",
  "Projects",
  "Technician",
  "Class Teacher",
  "IT Support",
  "Human Resource",
  "Operations",
  "General Staff",
  "Librarian",
  "E-Learning",
  "Data Analyst",
  "Finance",
] as const;

export type Designation = Exclude<(typeof DESIGNATIONS)[number], undefined>;

