/**
 * Shared parse-context builder for marksheet auto-save and auto-commit.
 *
 * Resolves @mention data, the per-class subject mapping, school info, and
 * (when no @mention is present) the class roster, returning a `ParseContext`
 * that `parseMarksheetMarkdown` consumes to fill student identity + subject
 * codes. Both `src/routes/api/file/[...path]/+server.ts` (PUT validation) and
 * `src/routes/api/commit/+server.ts` (auto-commit fallback) use this helper
 * to keep the auto-save and auto-commit validation pipelines identical.
 */
import { parseMentions, type ParseContext, type ParseContextRosterEntry } from '$lib/utils/marksheet-ast-parser';
import { getClassRoster } from '$lib/server/mastra/agents/skill-instructions';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { getDatabase } from '$lib/server/db';
import { SchoolRepository } from '$lib/server/repository';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

type ResolvedTenant = ReturnType<typeof import('$lib/server/mastra/tenant-context')['createTenantContext']>;

export async function buildMarksheetParseContext(
	markdown: string,
	tenant: ResolvedTenant
): Promise<ParseContext> {
	const mentions = parseMentions(markdown);

	let mappingSubjects: Array<{ id: number; subjectCode: string; subjectName: string; teacherId: number }> | undefined;
	let schoolInfo: { name?: string; email?: string; phone?: string } | undefined;
	let roster: ParseContextRosterEntry[] | undefined;

	if (tenant.classId != null && tenant.sectionId != null) {
		try {
			const assessment = await createAssessmentServiceForRequest(tenant);
			const mapping = await assessment.getMappingData(tenant.classId, tenant.sectionId);
			mappingSubjects = mapping.subjects
				.filter((s): s is { id: number; subjectCode: string; subjectName: string; teacherId: number } =>
					s.id != null && !!s.subjectCode && !!s.teacherId && !!s.subjectName
				)
				.map((s) => ({ id: s.id, subjectCode: s.subjectCode, subjectName: s.subjectName, teacherId: s.teacherId }));
		} catch { /* best-effort */ }
	}

	try {
		const mysqlDb = await getDatabase();
		const repo = new SchoolRepository(mysqlDb, tenant);
		const info = await repo.getSchoolInfo(tenant.schoolId);
		if (info) {
			schoolInfo = {
				name: info.schoolName ?? undefined,
				email: info.email ?? undefined,
				phone: info.phone ?? undefined,
			};
		}
	} catch { /* best-effort */ }

	if (mentions.admissionNo == null && mentions.studentId == null) {
		try {
			const classRoster = await getClassRoster({
				schoolId: tenant.schoolId,
				classId: tenant.classId ?? undefined,
				sectionId: tenant.sectionId ?? undefined,
				academicId: tenant.academicId ?? undefined,
			});
			roster = classRoster.map((r) => ({
				id: r.id,
				name: r.name,
				admissionNo: r.admissionNo != null ? Number(r.admissionNo) : undefined,
			}));
		} catch { /* best-effort */ }
	}

	return {
		tenant: {
			schoolId: tenant.schoolId,
			classId: tenant.classId ?? undefined,
			sectionId: tenant.sectionId ?? undefined,
			examTypeId: mentions.examTypeId ?? tenant.examTypeId ?? undefined,
			academicId: mentions.academicId ?? tenant.academicId ?? undefined,
			studentId: mentions.studentId ?? tenant.studentId ?? undefined,
			admissionNo: mentions.admissionNo ?? undefined,
			className: tenant.className ?? undefined,
			sectionName: tenant.sectionName ?? undefined,
			academicYearTitle: tenant.academicYearTitle ?? undefined,
			fullName: mentions.studentName ?? undefined,
		},
		school: schoolInfo,
		mapping: mappingSubjects ? { subjects: mappingSubjects } : undefined,
		roster,
	};
}
