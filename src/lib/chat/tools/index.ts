import { type LanguageModel, type UIMessageStreamWriter } from "ai";
import {
    getClassStudentList,
    upsertAttendance,
    upsertStudentRatings,
    upsertStudentResult,
    upsertTeacherRemark,
} from "./result.tool";
import { getStudentList, sendClassResults, updateExamTitle, upsertMarkStore, validateClassResults } from "./coordinator.tool";

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

export const emptyTools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
    return {};
};

export const coordinatorTools = (writer: UIMessageStreamWriter, model: LanguageModel) => {
    return {
        getStudentList,
        upsertStudentResult,
        validateClassResults,
        sendClassResults,
        upsertMarkStore,
        updateExamTitle,
    };
};
