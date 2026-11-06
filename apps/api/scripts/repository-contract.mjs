/**
 * Static contract for the repository layer (`01 §3.2`, §4).
 *
 * `AGGREGATES` is the single place that says which tables a folder owns.
 * `REFERENCE_READ` lists the read-only dictionaries every aggregate may join.
 */

export const AGGREGATES = {
  base: [],
  accounts: [
    "users",
    "infixRoles",
    // §6.3 pre-tenant path: login resolves the staff persona before a tenant exists.
    "smStaffs",
    "authSessions",
    "authIdentities",
    "authEvents",
    "authCodes",
    "authMagicLinks",
    "authRateLimits"
  ],
  "profiles/student": [
    "smStudents",
    "studentRecords",
    "smStudentPromotions",
    "smStudentTimelines"
  ],
  "profiles/staff": ["smStaffs"],
  "profiles/parent": ["smParents"],
  reference: [
    "smBaseGroups",
    "smBaseSetups",
    "smDesignations",
    "smHumanDepartments",
    "smStudentCategories",
    "smLanguages",
    "languages",
    "smDateFormats"
  ],
  campus: [
    "smRoutes",
    "smVehicles",
    "smDormitoryLists",
    "smRoomLists",
    "smStudentGroups"
  ],
  academics: [
    "smClasses",
    "smSections",
    "smSubjects",
    "smAssignSubjects",
    "smClassSections",
    "smClassTeachers",
    "smAssignClassTeachers",
    "smClassRoutines",
    "smClassRoutineUpdates",
    "smClassTimes",
    "smClassRooms",
    "smRoomTypes"
  ],
  assessments: [
    "smExams",
    "smExamTypes",
    "smExamSetups",
    "smExamSchedules",
    "smMarkStores",
    "smResultStores",
    "smMarksGrades",
    "examMeritPositions",
    "teacherRemarks",
    "studentRatings",
    "smHomeworks",
    "smHomeworkStudents"
  ],
  attendance: ["smStudentAttendances", "classAttendances"],
  fees: [
    "smFeesGroups",
    "smFeesTypes",
    "smFeesMasters",
    "smFeesAssigns",
    "smFeesPayments",
    "smFeesDiscounts",
    "smBankAccounts"
  ],
  school: ["smSchools", "smGeneralSettings", "smAcademicYears"],
  communications: ["chatGroups", "chatGroupUsers", "smEvents", "smHolidays", "smNoticeBoards"],
  queries: null
};

/** Dictionaries any repository may READ; only their owner may WRITE them. */
export const REFERENCE_READ = [
  "smSchools",
  "smAcademicYears",
  "smClasses",
  "smSections",
  "smSubjects",
  "smExamTypes",
  "smBaseSetups",
  "smBaseGroups",
  "smDesignations",
  "smHumanDepartments",
  "smStudentCategories",
  "smLanguages",
  "languages",
  "smDateFormats",
  "infixRoles"
];

/** Methods removed by this port, with the spec clause that retires them. */
export const RETIRED_METHODS = {
  "createRefreshToken": "No refresh tokens in the target session model (04 §3)",
  "validateRefreshToken": "No refresh tokens in the target session model (04 §3)",
  "revokeRefreshToken": "No refresh tokens in the target session model (04 §3)",
  "updateUserPassword": "Password auth retired (04a §2, 01a §7)"
};
