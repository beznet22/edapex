import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { StaffRepository } from "$lib/server/repository/staff.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import type { MastraToolContext } from "$lib/server/mastra/tenant-context";

const listMasterDataSchema = z.object({
	type: z
		.enum(['student-registration-options', 'staff-registration-options'])
		.describe('Which enrollment form options to return')
});

export type ListMasterDataInput = z.infer<typeof listMasterDataSchema>;

function isMastraToolContext(value: unknown): value is MastraToolContext {
	return (
		typeof value === 'object' &&
		value !== null &&
		'tenantContext' in value &&
		'getRepo' in value
	);
}

export async function listMasterDataLogic(
	context: MastraToolContext,
	input: ListMasterDataInput
): Promise<Record<string, unknown>> {
	if (input.type === 'student-registration-options') {
		const studentRepo = context.getRepo(StudentRepository);
		const options = await studentRepo.getStudentRegistrationOptions();
		return {
			categories: options.categories,
			genders: options.genders,
			guardianRelations: options.guardianRelations
		};
	}

	const staffRepo = context.getRepo(StaffRepository);
	const options = await staffRepo.getStaffRegistrationOptions();
	return {
		designations: options.designations,
		departments: options.departments,
		genders: options.genders,
		roles: options.roles
	};
}

export const listMasterDataTool = createTool({
	id: 'list-master-data',
	description:
		'Return master-data options needed for enrollment forms: student categories, staff designations, departments, genders, etc.',
	inputSchema: listMasterDataSchema,
	execute: async (input, rawContext) => {
		if (!isMastraToolContext(rawContext)) {
			throw new Error('list-master-data requires a valid Mastra tool context');
		}
		return listMasterDataLogic(rawContext, input);
	}
});
