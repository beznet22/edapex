import {
  upsertStudentResult,
  getClassStudentList,
  upsertAttendance,
  upsertTeacherRemark,
  upsertStudentRatings
} from "./result.tool";

import {
  getStudentList,
  getStudentRegistrationOptions,
  validateClassResults,
  sendStudentResult,
  upsertMarkStore,
  updateExamTitle,
  createStudent,
  assignClassSection,
  searchClassSection,
  changeStudentName,
  getAssessmentMapping,
  changeParentEmail,
  getStaffRegistrationOptions,
  registerStaff,
  resetPassword,
  updateStaffStatus,
  deleteStaff,
  searchStaff,
  updateStudentDetails,
  updateStudentStatus,
  searchStudent,
  promoteStudent,
} from "./coordinator.tool";

export const teacherTools = {
  upsertStudentResult,
  getClassStudentList,
  upsertAttendance,
  upsertTeacherRemark,
  upsertStudentRatings,
};

export const defaultTools = {};

export const coordinatorTools = {
  getStudentList,
  getStudentRegistrationOptions,
  validateClassResults,
  sendStudentResult,
  upsertMarkStore,
  updateExamTitle,
  createStudent,
  assignClassSection,
  searchClassSection,
  changeStudentName,
  getAssessmentMapping,
  changeParentEmail,
  upsertTeacherRemark,
  upsertStudentResult,
  getStaffRegistrationOptions,
  registerStaff,
  resetPassword,
  updateStaffStatus,
  deleteStaff,
  searchStaff,
  updateStudentDetails,
  updateStudentStatus,
  searchStudent,
  promoteStudent,
};
