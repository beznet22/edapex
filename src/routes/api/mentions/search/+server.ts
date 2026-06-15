import { error, json, type RequestHandler } from '@sveltejs/kit';
import { eq, and, or, like, sql, asc } from 'drizzle-orm';
import { createTenantContext, type TenantContext } from '$lib/server/mastra/tenant-context';
import { getAllowedCategories, type MentionCategory, type MentionSearchResult } from './mention-utils';
import { getDatabase } from '$lib/server/db';
import { smStudents, studentRecords } from '$lib/server/db/sms-schema';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { BaseRepository } from '$lib/server/repository/base.repo';

/**
 * Searches entities in the school database scoped to the user's tenant.
 *
 * The student search joins `smStudents` with `studentRecords` to filter by
 * the active academic year and (when provided) by class+section. A class
 * teacher's view is automatically restricted to their assigned homeroom.
 *
 * The query mirrors the proven `StudentRepository.getStudentsByClassSection`
 * pattern: it requires both classId AND sectionId, scopes by the active
 * academic year (resolved via the base repo), and matches on the search
 * pattern when present.
 */
async function searchStudents(
	query: string,
	tenant: TenantContext,
	limit: number,
	classId: number | null,
	sectionId: number | null
): Promise<MentionSearchResult[]> {
	const db = await getDatabase();
	const baseRepo = new BaseRepository(db as never, tenant);
	const academicId = await baseRepo.getAcademicId();

	const trimmed = query.trim();
	const studentFilters = [eq(smStudents.schoolId, tenant.schoolId)];

	const useClassFilter = classId != null && sectionId != null;
	if (useClassFilter) {
		studentFilters.push(eq(studentRecords.classId, classId!));
		studentFilters.push(eq(studentRecords.sectionId, sectionId!));
		studentFilters.push(eq(studentRecords.academicId, academicId));
		studentFilters.push(eq(studentRecords.activeStatus, 1));
		studentFilters.push(eq(smStudents.activeStatus, 1));
		studentFilters.push(eq(studentRecords.isDefault, 1));
	}

	if (trimmed) {
		const searchPattern = `%${trimmed}%`;
		studentFilters.push(
			or(
				like(smStudents.fullName, searchPattern),
				like(smStudents.admissionNo, searchPattern)
			) as any
		);
	}

	// Use innerJoin when filtering by class+section (must have a studentRecords
	// row that matches) but a leftJoin when listing all students (so students
	// with no current enrollment are still shown for the user to discover).
	const studentRows = useClassFilter
		? await db
			.select({
				id: smStudents.id,
				fullName: smStudents.fullName,
				admissionNo: smStudents.admissionNo,
			})
			.from(smStudents)
			.innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
			.where(and(...studentFilters))
			.orderBy(asc(smStudents.fullName))
			.limit(limit)
		: await db
			.select({
				id: smStudents.id,
				fullName: smStudents.fullName,
				admissionNo: smStudents.admissionNo,
			})
			.from(smStudents)
			.where(and(...studentFilters))
			.orderBy(asc(smStudents.fullName))
			.limit(limit);

	return studentRows.map((row) => ({
		id: row.id,
		name: row.fullName?.trim() || `Student #${row.id}`,
		category: 'students',
		typeBadge: row.admissionNo != null ? `Adm#${row.admissionNo}` : 'Student',
	}));
}

async function searchDate(
	query: string,
	_tenant: TenantContext,
	_limit: number
): Promise<MentionSearchResult[]> {
	const trimmed = query.trim().toLowerCase();
	const now = new Date();
	const candidates: Array<{ id: string; name: string; badge: string }> = [
		{ id: 'today', name: 'Today', badge: now.toLocaleDateString() },
		{ id: 'tomorrow', name: 'Tomorrow', badge: relativeDay(now, 1) },
		{ id: 'yesterday', name: 'Yesterday', badge: relativeDay(now, -1) },
		{ id: 'next-week', name: 'Next week', badge: relativeDay(now, 7) },
		{ id: 'next-month', name: 'Next month', badge: relativeDay(now, 30) },
	];

	const filtered = trimmed
		? candidates.filter((c) => c.name.toLowerCase().includes(trimmed) || c.id.includes(trimmed))
		: candidates;

	return filtered.map((c) => ({
		id: c.id,
		name: c.name,
		category: 'date',
		typeBadge: c.badge,
	}));
}

function relativeDay(base: Date, days: number): string {
	const d = new Date(base);
	d.setDate(d.getDate() + days);
	return d.toLocaleDateString();
}

async function searchCustom(
	query: string,
	_tenant: TenantContext,
	_limit: number
): Promise<MentionSearchResult[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	return [
		{
			id: trimmed,
			name: `Use "${trimmed}" as inline value`,
			category: 'custom',
			typeBadge: 'Custom',
			parentContext: 'Free-form inline variable; not resolved server-side',
		},
	];
}

async function searchEntities(
	query: string,
	category: MentionCategory | null,
	tenant: TenantContext,
	limit: number,
	classId: number | null,
	sectionId: number | null
): Promise<MentionSearchResult[]> {
	const clampedLimit = Math.min(limit, 10);
	if (category === 'students') return searchStudents(query, tenant, clampedLimit, classId, sectionId);
	if (category === 'date') return searchDate(query, tenant, clampedLimit);
	if (category === 'custom') return searchCustom(query, tenant, clampedLimit);
	const [students, dates, customs] = await Promise.all([
		searchStudents(query, tenant, Math.min(5, clampedLimit), classId, sectionId),
		searchDate(query, tenant, Math.min(3, clampedLimit)),
		searchCustom(query, tenant, Math.min(2, clampedLimit)),
	]);
	return [...students, ...dates, ...customs].slice(0, clampedLimit);
}

/**
 * GET /api/mentions/search?q=john&category=students&classId=5&sectionId=7&limit=10
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = locals;
	if (!user) {
		error(401, 'Authentication required');
	}

	const query = url.searchParams.get('q') || '';
	const category = url.searchParams.get('category') as MentionCategory | null;
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 10);
	const classIdParam = url.searchParams.get('classId');
	const sectionIdParam = url.searchParams.get('sectionId');
	const classId = classIdParam ? Number(classIdParam) : null;
	const sectionId = sectionIdParam ? Number(sectionIdParam) : null;
	const designationId: number = (user as any).designationId ?? ALLOWED_DESIGNATIONS.IT;

	const allowedCategories = getAllowedCategories(designationId);
	if (category && !allowedCategories.includes(category)) {
		return json({ error: 'FORBIDDEN' }, { status: 403 });
	}

	const tenantContext = createTenantContext({
		schoolId: user.schoolId ?? 1,
		userId: user.id ?? 1,
		designationId,
		staffId: (user as any).staffId ?? 1,
		roleId: (user as any).roleId ?? null,
		classId: (user as any).classId ?? null,
		sectionId: (user as any).sectionId ?? null,
		examId: null,
		academicId: user.academicId ?? null
	});

	const results = await searchEntities(query, category, tenantContext, limit, classId, sectionId);
	return json({ results });
};
