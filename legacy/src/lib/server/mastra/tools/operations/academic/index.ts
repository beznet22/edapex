export {
	manageAcademicRecordsTool,
	manageResultsLogic,
	manageResultsSchema,
	type ManageResultsInput
} from "./manage-academic-records";
import { manageAcademicRecordsTool } from "./manage-academic-records";

/**
 * Tools exposed by the Academic operation group.
 *
 * The keys here MUST match the `id` field of each tool — the SkillRegistry
 * resolves tool references by id, not by export name. Adding a tool without
 * matching key will make it invisible to skill loading.
 */
export const academicTools = {
	"manage-academic-records": manageAcademicRecordsTool
};
