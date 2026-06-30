import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { getDatabase } from '$lib/server/db';
import { StudentRepository } from '$lib/server/repository/student.repo';
import { ScopedRepositoryProvider } from '$lib/server/mastra/scoped-repository';
import { WorkspaceMismatchError, type TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

const EXTRACTED_JSON_PATH = (documentId: string): string => `extracted/${documentId}.json`;

interface LinkStudentToolContext {
	requestContext?: {
		get<T = unknown>(key: string): T | undefined;
	};
	writer?: unknown;
	abortSignal?: AbortSignal;
}

function getTenant(ctx: LinkStudentToolContext): TenantContext {
	const tenant = ctx.requestContext?.get('tenantContext') as TenantContext | undefined;
	if (!tenant) {
		throw new Error('TENANT_CONTEXT_REQUIRED: link-marksheet-student requires an active tenantContext');
	}
	return tenant;
}

async function resolveTenantFilesystem(tenant: TenantContext): Promise<WorkspaceFilesystem> {
	const requestContext = buildWorkspaceRequestContext(tenant);
	const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
	if (!fs) {
		throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured');
	}
	return fs;
}

async function readExtractedJson(tenant: TenantContext, documentId: string): Promise<Record<string, unknown>> {
	const fs = await resolveTenantFilesystem(tenant);
	const path = EXTRACTED_JSON_PATH(documentId);
	if (!(await fs.exists(path))) {
		throw new Error(`EXTRACTED_NOT_FOUND: no extracted JSON at ${path} for documentId=${documentId}`);
	}
	const raw = await fs.readFile(path, { encoding: 'utf-8' });
	const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
	const parsed = JSON.parse(text);
	if (!parsed || typeof parsed !== 'object') {
		throw new Error(`EXTRACTED_INVALID: extracted JSON at ${path} is not an object`);
	}
	return parsed as Record<string, unknown>;
}

async function writeExtractedJson(
	tenant: TenantContext,
	documentId: string,
	json: unknown
): Promise<void> {
	const fs = await resolveTenantFilesystem(tenant);
	await fs.writeFile(
		EXTRACTED_JSON_PATH(documentId),
		JSON.stringify(json, null, 2),
		{ recursive: true }
	);
}

export const linkMarksheetStudentTool = createTool({
	id: 'link-marksheet-student',
	description:
		"Link an OCR-extracted marksheet to a DB student by patching the JSON's `student` block " +
		"with the student's canonical id, name, admission number, class, section, and category. " +
		"Used at HITL validation when the OCR's extracted fullName does not unambiguously resolve " +
		"to a DB student. MUST be followed by `validate-marksheet` before `commit-marksheet`.",
	inputSchema: z.object({
		documentId: z.string().describe('The documentId of the marksheet to link.'),
		studentId: z.number().describe('The DB student id to link this marksheet to.')
	}),
	outputSchema: z.object({
		documentId: z.string(),
		studentId: z.number(),
		studentName: z.string(),
		recordId: z.number().int().positive().nullable()
	}),
	execute: async (input, ctx) => {
		const context = ctx as LinkStudentToolContext;
		const tenant = getTenant(context);

		const db = await getDatabase();
		const provider = new ScopedRepositoryProvider(db, tenant);
		const studentRepo = new StudentRepository(db, tenant, provider);
		const student = await studentRepo.getStudentById(input.studentId);
		if (!student) {
			throw new Error(`STUDENT_NOT_FOUND: no student with id=${input.studentId}`);
		}
		if (student.studentId === undefined || student.studentId === null) {
			throw new Error(`STUDENT_INVALID: student record for id=${input.studentId} has no studentId`);
		}

		// Class_teacher guard: the teacher must own this (classId, sectionId).
		// Admins/IT/coordinators are allowed to link across classes (per spec).
		if (
			tenant.designationId !== undefined &&
			tenant.classId !== null &&
			tenant.sectionId !== null &&
			student.classId !== null &&
			student.classId !== tenant.classId
		) {
			throw new WorkspaceMismatchError(
				`WORKSPACE_MISMATCH: studentId=${student.studentId} belongs to classId=${student.classId}, ` +
					`not the active classId=${tenant.classId}`
			);
		}

		const extracted = await readExtractedJson(tenant, input.documentId);
		const existingStudent = (extracted.student ?? {}) as Record<string, unknown>;
		const patchedStudent: Record<string, unknown> = {
			...existingStudent,
			id: student.studentId,
			studentId: student.studentId,
			fullName: student.fullName ?? existingStudent.fullName ?? null,
			firstName: student.firstName ?? existingStudent.firstName ?? null,
			lastName: student.lastName ?? existingStudent.lastName ?? null,
			adminNo: student.admissionNo ?? existingStudent.adminNo ?? null,
			admissionNo: student.admissionNo ?? existingStudent.admissionNo ?? null,
			className: student.className ?? existingStudent.className ?? null,
			sectionName: student.sectionName ?? existingStudent.sectionName ?? null,
			classId: student.classId ?? existingStudent.classId ?? null,
			sectionId: student.sectionId ?? existingStudent.sectionId ?? null,
			rollNo: student.rollNo ?? existingStudent.rollNo ?? null,
			category: existingStudent.category ?? student.categoryName ?? null,
			studentCategoryId:
				student.studentCategoryId ?? existingStudent.studentCategoryId ?? null,
			gender: existingStudent.gender ?? student.genderName ?? null,
			genderId: student.genderId ?? existingStudent.genderId ?? null,
			email: student.email ?? existingStudent.email ?? null,
			mobile: student.mobile ?? existingStudent.mobile ?? null,
			studentPhoto: student.studentPhoto ?? existingStudent.studentPhoto ?? null,
			dateOfBirth: student.dateOfBirth ?? existingStudent.dateOfBirth ?? null,
			schoolId: student.schoolId ?? existingStudent.schoolId ?? null,
			academicId: student.academicId ?? existingStudent.academicId ?? null,
			rollId: existingStudent.rollId ?? student.studentId
		};

		const patched = { ...extracted, student: patchedStudent };
		await writeExtractedJson(tenant, input.documentId, patched);

		return {
			documentId: input.documentId,
			studentId: student.studentId,
			studentName: student.fullName ?? 'Unknown',
			recordId: student.studentRecordId ?? null
		};
	}
});
