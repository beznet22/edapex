import { error, json, type RequestHandler } from '@sveltejs/kit';
import { eq, and, or, like, sql, asc, type SQL } from 'drizzle-orm';
import { type TenantContext } from '$lib/server/mastra/tenant-context';
import { resolveTenantWorkspace } from '$lib/server/workspace/scope';
import type { MentionCategory, MentionSearchResult } from './mention-utils';
import { getDatabase } from '$lib/server/db';
import {
  smStudents,
  studentRecords,
  smClasses,
  smSections,
} from '$lib/server/db/sms-schema';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { BaseRepository } from '$lib/server/repository/base.repo';
import { tenantWorkspace } from '$lib/server/workspace';
import { readAllManifests } from '$lib/server/workspace/manifest';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { filterMentionableFiles } from '$lib/server/workspace/file-filters';
import type { FileEntry } from '@mastra/core/workspace';

/**
 * Extended mention category set recognized by the search endpoint.
 *
 * M-EDIT-04.1 added `class_section`, `term`, and `file` to the `MentionTag`
 * taxonomy; this alias type keeps the v1 editor categories (`date`,
 * `custom`) for callers that haven't migrated, and adds the v2 categories
 * plus `academic_year` / `staff` / `schools` (which are part of the
 * `MentionTag` union and therefore in the role allowlist, but have no
 * editor-side search implementation yet — `processMentions` resolves them
 * via `MENTION_FIELD_MAP`).
 */
type ExtendedMentionCategory =
  | MentionCategory
  | 'class_section'
  | 'academic_year'
  | 'exam'
  | 'file'
  | 'staff'
  | 'schools';

type ClassSectionId = { classId: number; sectionId: number };

type ExtendedMentionSearchResult = Omit<MentionSearchResult, 'id'> & {
  id: number | string | ClassSectionId;
  /** File size in bytes (file category only). */
  size?: number;
  /** Absolute path on the file API for download/preview (file category only). */
  url?: string;
  /** Best-effort MIME-type guess (file category only). */
  mimeType?: string;
  /** Resolved exam-type title (e.g. "First Term 2025") for paths under `exams/examType-N/`. */
  examTypeTitle?: string | null;
};

/**
 * Role-based allowlist for the v2 mention taxonomy.
 *
 *   - IT / Coordinator: all categories
 *   - Class Teacher: students, class_section, academic_year, exam, file
 *   - Other: empty
 *
 * The shared helper `getAllowedCategories` in `mention-utils.ts` still
 * returns the v1 set (`students`, `date`, `custom`) and is therefore
 * stale. A follow-up microtask should align that helper with this
 * derivation; this route computes the allowlist locally until then.
 */
function computeAllowedCategories(designationId: number): ExtendedMentionCategory[] {
  if (
    designationId === ALLOWED_DESIGNATIONS.IT ||
    designationId === ALLOWED_DESIGNATIONS.COORDINATOR
  ) {
    return ['students', 'staff', 'schools', 'class_section', 'academic_year', 'exam', 'file'];
  }
  if (designationId === ALLOWED_DESIGNATIONS.CLASS_TEACHER) {
    return ['students', 'class_section', 'academic_year', 'exam', 'file'];
  }
  return [];
}

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
): Promise<ExtendedMentionSearchResult[]> {
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
		// Structured fields embedded in the markdown mention so the editor
		// workflow can resolve the document to the correct `sm_students`
		// row without an extra lookup. Serialized as
		// `{{studentName:<fullName>|student:<id>|admissionNo:<adm>}}`.
		// Coerced to string so the MentionSearchResult type (which uses
		// `admissionNo?: string`) accepts the value — sm_students.admissionNo
		// is stored as a numeric ID in the DB but serialized as a string.
		admissionNo: row.admissionNo != null ? String(row.admissionNo) : undefined,
		studentId: row.id,
	}));
}

/**
 * Returns pre-combined (class × section) rows scoped to the active tenant.
 *
 * Query: cross-join `smClasses` × `smSections` on `schoolId`, optionally
 * filtered by `classId` and a case-insensitive `LIKE` against either
 * `className` or `sectionName`. Each row yields a `class_section` mention
 * whose `id` is the `{ classId, sectionId }` tuple (consumed by
 * `processMentions` to update both `classId` and `sectionId` on the
 * `TenantContext`).
 */
async function searchClassSection(
	query: string,
	tenant: TenantContext,
	limit: number,
	classIdFilter: number | null
): Promise<ExtendedMentionSearchResult[]> {
	const db = await getDatabase();
	const trimmed = query.trim();
	const filters: SQL[] = [
		eq(smClasses.schoolId, tenant.schoolId),
		eq(smClasses.activeStatus, 1),
		eq(smSections.activeStatus, 1),
	];
	if (classIdFilter != null) {
		filters.push(eq(smClasses.id, classIdFilter));
	}
	if (trimmed) {
		const pattern = `%${trimmed}%`;
		const nameMatch = or(
			like(smClasses.className, pattern),
			like(smSections.sectionName, pattern)
		);
		if (nameMatch) filters.push(nameMatch);
	}

	const rows = await db
		.select({
			classId: smClasses.id,
			className: smClasses.className,
			sectionId: smSections.id,
			sectionName: smSections.sectionName,
		})
		.from(smClasses)
		.innerJoin(smSections, eq(smClasses.schoolId, smSections.schoolId))
		.where(and(...filters))
		.limit(limit);

	return rows.map((row) => ({
		id: { classId: row.classId!, sectionId: row.sectionId! },
		name: `${row.className} - ${row.sectionName}`,
		category: 'class_section',
		typeBadge: row.className,
	}));
}

/**
 * Returns exam types scoped to the active academic year.
 *
 * `BaseRepository.getExamTypes()` already filters by the active academic
 * year and `activeStatus = 1`, so we just narrow by `q` (case-insensitive
 * substring match on `title`) and cap the result at `limit`.
 */
async function searchExam(
	query: string,
	tenant: TenantContext,
	limit: number
): Promise<ExtendedMentionSearchResult[]> {
	const db = await getDatabase();
	const baseRepo = new BaseRepository(db as never, tenant);
	const examTypes = await baseRepo.getExamTypes();
	const trimmed = query.trim().toLowerCase();
	const filtered = trimmed
		? examTypes.filter((t) => (t.title ?? '').toLowerCase().includes(trimmed))
		: examTypes;
	return filtered.slice(0, limit).map((t) => {
		const title = t.title?.trim() || `Exam #${t.id}`;
		return {
			id: t.id,
			name: title,
			category: 'exam',
			typeBadge: 'Exam',
			parentContext: title,
		};
	});
}

/**
 * Returns academic years scoped to the active school.
 *
 * `BaseRepository.getAcademicYears()` already filters to the active
 * `schoolId`, so we just narrow by `q` (case-insensitive substring match
 * on `year` or `title`) and cap the result at `limit`.
 */
async function searchAcademicYear(
	query: string,
	tenant: TenantContext,
	limit: number
): Promise<ExtendedMentionSearchResult[]> {
	const db = await getDatabase();
	const baseRepo = new BaseRepository(db as never, tenant);
	const academicYears = await baseRepo.getAcademicYears();
	const trimmed = query.trim().toLowerCase();
	const filtered = trimmed
		? academicYears.filter((y) =>
				(y.year ?? '').toLowerCase().includes(trimmed) ||
				(y.title ?? '').toLowerCase().includes(trimmed)
			)
		: academicYears;
	return filtered.slice(0, limit).map((y) => {
		const label = y.title?.trim() || `Year #${y.id}`;
		return {
			id: y.id,
			name: label,
			category: 'academic_year',
			typeBadge: 'AY',
		};
	});
}

/**
 * Lists files in the active tenant's workspace.
 *
 * Uses `tenantWorkspace.resolveFilesystem` so tenant isolation (the
 * `LocalFilesystem({ contained: true })` sandbox and the teacher-assignment
 * check) is enforced identically to other workspace-aware endpoints.
 * Recursive `readdir` flattens nested entries into relative paths; we
 * apply `filterMentionableFiles` (shared with the filestore page) so
 * `.json` files, `ocr/*`, and `scratch/*` are excluded — users only see
 * mention candidates they'd see in the library.
 *
 * The result is enriched with `size`, `url`, `mimeType`, and a
 * category-specific `typeBadge` derived from the manifest `kind`
 * (or extension as fallback) so the dropdown can render proper icons
 * and a per-file parent context.
 */
async function searchFile(
	query: string,
	tenant: TenantContext,
	limit: number
): Promise<ExtendedMentionSearchResult[]> {
	try {
		const requestContext = buildWorkspaceRequestContext(tenant);
		const fs = await tenantWorkspace.resolveFilesystem({
			requestContext: requestContext as never
		});
		if (!fs) return [];
		const entries: FileEntry[] = await fs.readdir('.', {recursive: true});
		const manifests = await readAllManifests(tenant);
		// Build a path -> manifestEntry map by merging all per-exam manifests.
		// Each per-exam manifest's paths are unique because the examTypeId
		// prefix is part of the relPath, so we just take the last writer.
		const mergedEntries: Record<string, import('$lib/server/workspace/manifest').ManifestEntry> = {};
		for (const m of manifests) {
			for (const [relPath, entry] of Object.entries(m.entries)) {
				mergedEntries[relPath] = entry;
			}
		}
		const trimmed = query.trim().toLowerCase();
		const filtered = filterMentionableFiles(entries).filter((e) => {
			if (!trimmed) return true;
			return e.name.toLowerCase().includes(trimmed);
		});

		// Resolve examType-N in paths to readable titles for the secondary
		// line in the dropdown. Loaded once per request.
		const examTypeMap = await loadExamTypeTitleMap(tenant);

		return filtered.slice(0, limit).map((e) => {
			const lastSlash = e.name.lastIndexOf('/');
			const parentContext = lastSlash > 0 ? e.name.slice(0, lastSlash) : '';
			const basename = lastSlash >= 0 ? e.name.slice(lastSlash + 1) : e.name;
			const manifestEntry = mergedEntries[e.name];
			const displayName = manifestEntry?.fileName ?? basename;
			const typeBadge = deriveFileTypeBadge(manifestEntry?.kind, e.name);
			const mimeType = mimeTypeForName(e.name);
			const examTypeTitle = examTypeTitleFromPath(e.name, examTypeMap);
			return {
				id: e.name,
				name: displayName,
				category: 'file',
				typeBadge,
				parentContext,
				examTypeTitle,
				size: e.size,
				url: `/api/file/${e.name}`,
				mimeType,
			};
		});
	} catch {
		return [];
	}
}

/**
 * Builds a map of `examTypeId -> title` for the active academic year.
 * Used to resolve `exams/examType-N/...` paths to a human-readable
 * secondary line in the dropdown. Cached per request — falls back to
 * `null` if the DB is unreachable.
 */
async function loadExamTypeTitleMap(
	tenant: TenantContext
): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	try {
		const db = await getDatabase();
		const baseRepo = new BaseRepository(db as never, tenant);
		const examTypes = await baseRepo.getExamTypes();
		for (const t of examTypes) {
			map.set(t.id, t.title?.trim() || `Exam #${t.id}`);
		}
	} catch {
		// best-effort; missing lookup just leaves the title as null
	}
	return map;
}

/**
 * Extracts the exam-type id from a workspace path and resolves it to
 * a title via the pre-loaded map. Returns null for non-exam paths.
 */
function examTypeTitleFromPath(
	path: string,
	map: Map<number, string>
): string | null {
	const match = path.match(/examType-(\d+)/);
	if (!match) return null;
	const id = Number(match[1]);
	return map.get(id) ?? null;
}

/**
 * Derives a category-specific badge label for a workspace file. Prefers
 * the manifest `kind` (the authoritative source — handles renamed files,
 * re-typed artefacts, etc.) and falls back to extension sniffing.
 */
function deriveFileTypeBadge(
	kind: string | undefined,
	path: string
): 'File' | 'IMG' | 'PDF' | 'NOTE' | 'MD' | 'MARKSHEET' | 'TRANSCRIPT' {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	const looksLikeImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(ext);
	if (kind === 'note') return 'NOTE';
	if (kind === 'marksheet-markdown' || kind === 'marksheet-pdf') return 'MARKSHEET';
	if (kind === 'transcript-markdown' || kind === 'transcript-pdf') return 'TRANSCRIPT';
	if (ext === 'pdf') return 'PDF';
	if (ext === 'md' || ext === 'markdown') return 'MD';
	if (looksLikeImage) return 'IMG';
	return 'File';
}

/**
 * Best-effort MIME-type guess from the file extension. The
 * `contentTypeFor` helper used by the file API lives server-side; the
 * dropdown only needs a hint for icon selection, not an authoritative
 * value.
 */
function mimeTypeForName(path: string): string | undefined {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	const map: Record<string, string> = {
		pdf: 'application/pdf',
		md: 'text/markdown',
		markdown: 'text/markdown',
		txt: 'text/plain',
		json: 'application/json',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		csv: 'text/csv',
		html: 'text/html',
		htm: 'text/html',
	};
	return map[ext];
}

async function searchEntities(
	query: string,
	category: ExtendedMentionCategory | null,
	tenant: TenantContext,
	limit: number,
	classId: number | null,
	sectionId: number | null,
	designationId: number
): Promise<ExtendedMentionSearchResult[]> {
	const clampedLimit = Math.min(limit, 10);
	if (category === 'students') return searchStudents(query, tenant, clampedLimit, classId, sectionId);
	if (category === 'class_section') return searchClassSection(query, tenant, clampedLimit, null);
	if (category === 'exam') return searchExam(query, tenant, clampedLimit);
	if (category === 'academic_year') return searchAcademicYear(query, tenant, clampedLimit);
	if (category === 'file') return searchFile(query, tenant, clampedLimit);
	if (category === 'staff' || category === 'schools') {
		return [];
	}

	// Default tab (no `category` param): search ALL allowed categories in
	// parallel and merge the results. The frontend `mention-menu.ts` sends
	// no `category` param, so typing `@year` or `@term` previously only
	// matched against students + class_section — now every allowed category
	// contributes results so the suggestion list reflects what's available.
	// Each category is capped at a small share of the overall limit so a
	// single dominant category can't crowd out the others.
	const trimmed = query.trim();
	const cats = category ? [category] : computeAllowedCategories(designationId);
	const perCategory = Math.max(2, Math.ceil(clampedLimit / Math.max(1, cats.length)));
	const searches: Array<Promise<ExtendedMentionSearchResult[]>> = [];
	if (cats.includes('students')) searches.push(searchStudents(query, tenant, perCategory, classId, sectionId));
	if (cats.includes('class_section')) {
		searches.push(searchClassSection(query, tenant, perCategory, classId));
	}
	if (cats.includes('academic_year')) searches.push(searchAcademicYear(query, tenant, perCategory));
	if (cats.includes('exam')) searches.push(searchExam(query, tenant, perCategory));
	if (cats.includes('file')) searches.push(searchFile(query, tenant, perCategory));
	const merged = (await Promise.all(searches)).flat();
	// Re-rank: exact-prefix matches first, then alphabetical.
	merged.sort((a, b) => {
		const aPrefix = trimmed && a.name.toLowerCase().startsWith(trimmed) ? 0 : 1;
		const bPrefix = trimmed && b.name.toLowerCase().startsWith(trimmed) ? 0 : 1;
		if (aPrefix !== bPrefix) return aPrefix - bPrefix;
		return a.name.localeCompare(b.name);
	});
	return merged.slice(0, clampedLimit);
}

/**
 * GET /api/mentions/search?q=john&category=students&classId=5&sectionId=7&limit=10
 *
 * Privacy contract (per user spec):
 *   @<studentName>  → same-school + active class OR assigned class
 *   @file           → same-school + active class OR assigned class (workspace sandbox)
 *
 * The active class comes from the `selected-class` cookie (written by
 * class-selector.svelte). The assigned class comes from user.classId /
 * user.sectionId (set during on-boarding for class teachers).
 *
 * For class teachers these are identical. For admins/IT/coordinators
 * the active class is whichever class they have selected via class-selector.
 *
 * Query params `classId` / `sectionId` are NOT honored as a privacy
 * override — they would let any client widen the scope. The only way
 * to change scope is via the user/session/cookie path.
 */
export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const { user } = locals;
	if (!user) {
		error(401, 'Authentication required');
	}

	const query = url.searchParams.get('q') || '';
	const category = url.searchParams.get('category') as ExtendedMentionCategory | null;
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 10);
	const designationId: number = (user as any).designationId ?? ALLOWED_DESIGNATIONS.IT;

	const allowedCategories = computeAllowedCategories(designationId);
	if (category && !allowedCategories.includes(category)) {
		return json({ error: 'FORBIDDEN' }, { status: 403 });
	}

	// Resolve tenant workspace with full 3-fallback class resolution
	// (query param → cookie → teacher DB table), matching the filestore
	// page's logic. When no class is selected, the resolver throws
	// MissingTenantScopeError and we return the canonical 422 envelope so
	// the chat UI can prompt the user to pick a class. The 422 envelope
	// shape is `{ error: 'TENANT_SCOPE_REQUIRED', message: 'Pick a class
	// and section to continue.' }`.
	const { tenant: tenantContext } = await resolveTenantWorkspace({
		schoolId: user.schoolId ?? 1,
		userId: user.id ?? 1,
		staffId: (user as any).staffId,
		designationId,
		roleId: (user as any).roleId ?? null,
		selectedClassCookie: cookies.get('selected-class'),
	});

	const classId = tenantContext.classId;
	const sectionId = tenantContext.sectionId;

	const results = await searchEntities(query, category, tenantContext, limit, classId, sectionId, designationId);
	return json({ results });
};
