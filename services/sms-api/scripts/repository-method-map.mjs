/**
 * Legacy method → target file map for `01b`.
 *
 * `implemented` entries name the file (relative to
 * `src/lib/server/repository/`) and the exported function that replaces the
 * legacy method. Renames are explicit so the completeness check cannot be
 * satisfied by a same-named comment.
 */

export const IMPLEMENTED = {
  // assignment.repo
  assignClassTeacher: ["academics/assignment.repo.ts", "assignClassTeacher"],
  assignSubjectTeacher: ["academics/assignment.repo.ts", "assignSubjectTeacher"],

  // auth.repo (sessions retargeted; password/refresh methods retired)
  findUser: ["accounts/user.repo.ts", "findUser"],
  findStaff: ["accounts/auth.repo.ts", "findStaffByUserId"],
  createSession: ["accounts/session.repo.ts", "createSession"],
  validateSession: ["accounts/session.repo.ts", "validateSession"],
  deleteSession: ["accounts/session.repo.ts", "deleteSession"],
  deleteAllUserSessions: ["accounts/session.repo.ts", "deleteAllUserSessions"],
  createUser: ["accounts/user.repo.ts", "createUser"],
  updateUser: ["accounts/user.repo.ts", "updateUser"],

  // base.repo
  loadConfigurations: ["school/academic-config.ts", "loadConfigurations"],
  getGeneralSettings: ["school/academic-config.ts", "listGeneralSettings"],
  getGeneralSettingBySchoolId: ["school/academic-config.ts", "findGeneralSettingBySchoolId"],
  getAcademicYears: ["school/academic-config.ts", "listAcademicYears"],
  getActiveAcademicYear: ["school/academic-config.ts", "findActiveAcademicYear"],
  getAcademicYearById: ["school/academic-config.ts", "findAcademicYearById"],
  getAcademicId: ["school/academic-config.ts", "resolveAcademicId"],
  getExamTypes: ["assessments/exam.repo.ts", "listExamTypes"],
  getCurrentTerm: ["assessments/exam.repo.ts", "findCurrentTerm"],

  // parent.repo
  findParentByEmail: ["profiles/parent/profile.repo.ts", "findParentByEmail"],
  findParentByStudentId: ["queries/parent-search.ts", "findParentByStudentId"],
  findParentByAdmissionNo: ["queries/parent-search.ts", "findParentByAdmissionNo"],
  searchParentsByStudentName: ["queries/parent-search.ts", "searchParentsByStudentName"],
  searchParentsByName: ["profiles/parent/profile.repo.ts", "searchParentsByName"],
  updateParentEmail: ["profiles/parent/profile.repo.ts", "updateParentEmail"],

  // result.repo
  assignSubjects: ["academics/assignment.repo.ts", "assignSubjects"],
  getClassSectionById: ["academics/class-section.repo.ts", "findClassSectionById"],
  getAssignedSubjects: ["academics/assignment.repo.ts", "listAssignedSubjects"],
  getAssignedClassSection: ["academics/class-section.repo.ts", "findAssignedClassSection"],
  upsertClassAttendance: ["attendance/class-attendance.repo.ts", "upsertClassAttendance"],
  getStudentRatings: ["assessments/feedback.repo.ts", "findStudentRatings"],
  getTeacherRemarks: ["assessments/feedback.repo.ts", "findTeacherRemarks"],
  deleteResultStore: ["assessments/results.repo.ts", "deleteResultStore"],
  deleteMarkStore: ["assessments/marks.repo.ts", "deleteMarkStore"],
  cleanMarks: ["assessments/marks.repo.ts", "cleanMarks"],
  deleteExamSetup: ["assessments/results.repo.ts", "deleteExamSetup"],
  queryResultData: ["queries/result-read.ts", "queryResultData"],
  getClassAverages: ["assessments/results.repo.ts", "getClassAverages"],
  getTranscriptData: ["queries/transcript.ts", "getTranscriptData"],
  getMarksData: ["assessments/marks.repo.ts", "getMarksData"],
  getObjectives: ["queries/objectives.ts", "findObjectives"],
  upsertDaycareLearningOutcome: [
    "assessments/feedback.repo.ts",
    "upsertDaycareLearningOutcome"
  ],
  upsertStudentRatings: ["assessments/feedback.repo.ts", "upsertStudentRatings"],
  upsertTeacherRemark: ["assessments/feedback.repo.ts", "upsertTeacherRemark"],
  updateExamSetup: ["assessments/exam-setup.repo.ts", "updateExamSetup"],
  upsertExamSetup: ["assessments/exam-setup.repo.ts", "upsertExamSetup"],
  batchUpsertMarkRecords: ["assessments/marks.repo.ts", "batchUpsertMarkRecords"],
  batchUpsertResultRecords: ["assessments/results.repo.ts", "batchUpsertResultRecords"],
  createExamIfNotExist: ["assessments/exam.repo.ts", "ensureExam"],
  getAssignedTeacher: ["academics/assignment.repo.ts", "findAssignedTeacher"],
  getExamSetupsByStaffId: ["queries/exam-setups.ts", "findExamSetupsByStaffId"],
  getExamSetupsByClassSection: [
    "assessments/exam-setup.repo.ts",
    "findExamSetupsByClassSection"
  ],
  getExamSetup: ["assessments/exam-setup.repo.ts", "findExamSetup"],
  getSubjectFullMark: ["assessments/exam-setup.repo.ts", "findSubjectFullMark"],
  getMarkGrade: ["assessments/results.repo.ts", "getMarkGrade"],
  getStudentCategories: ["reference/student-category.repo.ts", "listStudentCategories"],
  getSubjectsByClass: ["academics/subject.repo.ts", "listSubjectsByClass"],

  // school.repo
  getSchoolInfo: ["school/school.repo.ts", "findSchoolInfo"],

  // staff.repo
  getById: [
    ["profiles/staff/profile.repo.ts", "findStaffById"],
    ["queries/student-details.ts", "findStudentDetails"]
  ],
  getStaffRegistrationOptions: [
    "queries/registration-options.ts",
    "findStaffRegistrationOptions"
  ],
  createStaff: ["profiles/staff/profile.repo.ts", "createStaff"],
  updateStaff: ["profiles/staff/profile.repo.ts", "updateStaff"],
  updateStaffPhoto: ["profiles/staff/profile.repo.ts", "updateStaffPhoto"],
  resolveDesignationId: ["reference/designation.repo.ts", "resolveDesignationId"],
  resolveDepartmentId: ["reference/department.repo.ts", "resolveDepartmentId"],
  getStaffByEmail: ["profiles/staff/profile.repo.ts", "findStaffByEmail"],
  searchStaff: ["profiles/staff/profile.repo.ts", "searchStaff"],
  updateStaffStatus: ["profiles/staff/profile.repo.ts", "updateStaffStatus"],
  deleteStaff: ["profiles/staff/profile.repo.ts", "deleteStaff"],
  getStaffByClassSection: ["queries/staff-search.ts", "findStaffByClassSection"],

  // student.repo
  createStudentIfNotExists: ["profiles/student/profile.repo.ts", "createStudentWithRecord"],
  getStudentBySiblings: ["queries/student-search.ts", "listStudentsGroupedByParent"],
  getStudentsByClassSection: [
    "profiles/student/search.repo.ts",
    "listStudentsByClassSection"
  ],
  getStudentsByStaffId: ["queries/student-search.ts", "listStudentsByStaffId"],
  createIfNotExistsStudentRecord: [
    "profiles/student/records.repo.ts",
    "createIfNotExistsStudentRecord"
  ],
  getStudentRecord: ["profiles/student/records.repo.ts", "findStudentRecord"],
  getStudentRecordByAdmissionNo: [
    "profiles/student/records.repo.ts",
    "findStudentRecordByAdmissionNo"
  ],
  updateStudent: ["profiles/student/profile.repo.ts", "updateStudent"],
  updateStudentPhoto: ["profiles/student/profile.repo.ts", "updateStudentPhoto"],
  updateStudentCategoryId: ["profiles/student/profile.repo.ts", "updateStudentCategoryId"],
  getStudentById: ["queries/student-details.ts", "findStudentDetails"],
  getById: ["queries/student-details.ts", "findStudentDetails"],
  getRawStudentById: ["profiles/student/profile.repo.ts", "findStudentById"],
  getLatestPromotion: ["profiles/student/lifecycle.repo.ts", "findLatestPromotion"],
  demoteStudent: ["profiles/student/lifecycle.repo.ts", "demoteStudent"],
  resolveGenderId: ["reference/base-setup.repo.ts", "resolveGenderId"],
  resolveStudentCategoryId: [
    "reference/student-category.repo.ts",
    "resolveStudentCategoryId"
  ],
  getRollNoAndAdmissionNo: ["profiles/student/profile.repo.ts", "findRollAndAdmission"],
  getStudentRegistrationOptions: [
    "queries/registration-options.ts",
    "findStudentRegistrationOptions"
  ],
  getClassAndSectionByName: ["academics/class-section.repo.ts", "findClassSectionByName"],
  searchClassSection: ["academics/class-section.repo.ts", "searchClassSections"],
  assignClassSection: ["profiles/student/records.repo.ts", "assignClassSection"],
  promoteStudent: ["profiles/student/lifecycle.repo.ts", "promoteStudent"],
  searchStudent: ["profiles/student/search.repo.ts", "searchStudents"],
  updateStudentStatus: ["profiles/student/profile.repo.ts", "updateStudentStatus"],
  deleteStudent: ["profiles/student/profile.repo.ts", "deleteStudent"],

  // timeline.repo
  createTimeline: ["profiles/student/timeline.repo.ts", "createTimeline"],
  createTimelineIfNotExist: [
    "profiles/student/timeline.repo.ts",
    "createTimelineIfNotExist"
  ],
  getTimelinesByStudentId: ["profiles/student/timeline.repo.ts", "listTimelinesByStudent"],
  getTimelineById: ["profiles/student/timeline.repo.ts", "findTimelineById"],
  updateTimeline: ["profiles/student/timeline.repo.ts", "updateTimeline"],
  deleteTimeline: ["profiles/student/timeline.repo.ts", "deleteTimeline"],
  upsertTimelines: ["profiles/student/timeline.repo.ts", "upsertTimelines"],
  getTimelinesByExam: ["profiles/student/timeline.repo.ts", "listTimelinesByExam"]
};

/** Methods with no target concept, with the clause that retires them. */
export const RETIRED = {
  createRefreshToken: "No refresh tokens in the target session model",
  validateRefreshToken: "No refresh tokens in the target session model",
  revokeRefreshToken: "No refresh tokens in the target session model",
  updateUserPassword: "Password authentication retired (04a, 01a §7)"
};

/** Legacy methods missed by 01b's async-only generator; implemented anyway. */
export const EXTRA_IMPLEMENTED = {
  getClassSections: ["academics/class-section.repo.ts", "listClassSections"],
  getStuendtsByParentId: ["queries/student-search.ts", "listStudentsByParentId"]
};
