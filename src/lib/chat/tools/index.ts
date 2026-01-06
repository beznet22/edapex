import { type LanguageModel, type UIMessageStreamWriter } from "ai";
import {
  getClassStudentList,
  upsertAttendance,
  upsertStudentRatings,
  upsertStudentResult,
  upsertTeacherRemark,
} from "./result.tool";
import {
  createStudent,
  getStudentList,
  getStudentRegistrationOptions,
  sendClassResults,
  sendStudentResult,
  updateExamTitle,
  upsertMarkStore,
  validateClassResults,
} from "./coordinator.tool";

export const teacherTools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
  return {
    upsertStudentResult,
    getClassStudentList,
    upsertAttendance,
    upsertTeacherRemark,
    upsertStudentRatings,
  };
};

export const defaultTools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
  return {};
};

export const coordinatorTools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
  return {
    getStudentList,
    getStudentRegistrationOptions,
    validateClassResults,
    sendStudentResult,
    upsertMarkStore,
    updateExamTitle,
    createStudent,
  };
};
