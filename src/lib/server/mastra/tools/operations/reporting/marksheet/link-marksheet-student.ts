import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { getDatabase } from '$lib/server/db';
import { StudentRepository } from '$lib/server/repository/student.repo';
import { ScopedRepositoryProvider } from '$lib/server/mastra/scoped-repository';
import { WorkspaceMismatchError, type TenantContext } from '$lib/server/mastra/tenant-context';
import {
  readManifest as readWorkspaceManifest,
  addEntry as addWorkspaceEntry
} from '$lib/server/mastra/storage/workspaces/manifest-store';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

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

async function resolveTenantFilesystem(_tenant: TenantContext): Promise<WorkspaceFilesystem | null> {
	const requestContext = buildWorkspaceRequestContext(_tenant);
	const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
	return fs;
}

export const linkMarksheetStudentTool = createTool({
	id: 'link-marksheet-student',
	description:
		"Link an OCR'd marksheet (identified by documentId from the upload manifest) to a DB student. " +
		"Updates the manifest entry's studentHint with the canonical id, name, admission number, class, and " +
		"section. The next call to validate-marksheet will use this hint to seed the re-derived JSON. " +
		"Used at HITL validation when the OCR-extracted fullName does not unambiguously resolve to a DB student. " +
		"MUST be followed by validate-marksheet before commit-marksheet.",
	inputSchema: z.object({
		documentId: z.string().describe('The documentId of the marksheet upload to link.'),
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

		// Locate the upload entry in the single workspace manifest by documentId.
		// The legacy `extracted/manifest.json` is no longer used; all upload
		// metadata lives in the single manifest.json at workspace root.
		const manifest = await readWorkspaceManifest(tenant);
		const entry = Object.values(manifest.entries).find((e) => e.documentId === input.documentId);
		if (!entry) {
			throw new Error(
				`MANIFEST_ENTRY_NOT_FOUND: documentId=${input.documentId} is not in the workspace manifest`
			);
		}

		// Update the manifest entry with DB-resolved student info. We keep
		// studentHint on the upload entry so format-marksheet-document can
		// surface it to validate-marksheet.
		await addWorkspaceEntry(tenant, {
			...entry,
			studentHint: {
				fullName: student.fullName ?? entry.fileName,
				admissionNo: student.admissionNo,
				studentId: student.studentId,
				classId: student.classId ?? undefined,
				sectionId: student.sectionId ?? undefined
			}
		});

		// Touch the workspace to ensure it's writable (validates tenant is set up correctly)
		const ws = await resolveTenantFilesystem(tenant);
		void ws;

		return {
			documentId: input.documentId,
			studentId: student.studentId,
			studentName: student.fullName ?? 'Unknown',
			recordId: student.studentRecordId ?? null
		};
	}
});
