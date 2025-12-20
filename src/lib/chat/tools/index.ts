import { type LanguageModel, type UIMessageStreamWriter } from "ai";
import {
  getClassStudentList,
  upsertAttendance,
  upsertStudentRatings,
  upsertStudentResult,
  upsertTeacherRemark,
} from "./result.tool";

export const tools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
  return {
    // createDocument: createdDocumentTool(writer, model),
    upsertStudentResult,
    getClassStudentList,
    upsertAttendance,
    upsertTeacherRemark,
    upsertStudentRatings,
  };
};
