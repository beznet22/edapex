import { type LanguageModel, type UIMessageStreamWriter } from "ai";
import { getClassStudentList, upsertStudentResult } from "./result.tool";

export const tools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
  return {
    // createDocument: createdDocumentTool(writer, model),
    upsertStudentResult,
    getClassStudentList,
  };
};
