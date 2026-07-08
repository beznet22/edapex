/**
 * Mention Resolver — EdApex
 *
 * Scans a markdown document for mention placeholders inserted by the editor's
 * @mention extension and replaces each with a resolved string suitable for
 * the LLM prompt. The categories handled here mirror those exposed by the
 * editor mention popup (see routes/api/mentions/search).
 *
 * The editor serializes mentions as plain text `@<label>` so the markdown the
 * user sees reads naturally: `@John Doe`, `@2026`, `@First term`. The
 * structured data (id, category, admissionNo, studentName) lives in the
 * editor's internal attrs and is NOT carried in the markdown text.
 *
 * Resolution strategy — since the markdown doesn't carry structured data,
 * the resolver does a name-based lookup against tenant-scoped data:
 *
 *   students    -> search smStudents by fullName (case-insensitive exact
 *                  match), scoped to tenantContext.schoolId. Returns
 *                  "<fullName> (<admissionNo>)" so the LLM sees both the
 *                  human name and the structured ID. admissionNo is the raw
 *                  DB column value (a number) — NO `Adm#` prefix.
 *   academic    -> search academic_years by year/title (case-insensitive
 *                  substring match), scoped to tenantContext.schoolId.
 *   exam        -> search exam_types by title, scoped to the active
 *                  academic year.
 *   date/custom -> literal pass-through; the user typed arbitrary text.
 *
 * Throws WorkspaceMismatchError if a student mention resolves to a row from
 * a different school — defense-in-depth against a client that constructs
 * mentions client-side without server validation.
 */
import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@mastra/core/request-context';
import type { Mastra } from '@mastra/core/mastra';
import {
	type TenantContext,
	WorkspaceMismatchError,
} from '../tenant-context';
import { getDatabase } from '$lib/server/db';
import { smStudents } from '$lib/server/db/sms-schema';
import type { ResolvedMention } from './schemas';

// Match the structured `<span data-type="mention" ...>@<label></span>` form
// first — this is the round-tripped output of our serialize function and
// carries the full structured context (id, category, admissionNo,
// studentName) as data-* attributes. Fall back to legacy plain `@<label>`
// (with leading whitespace or start-of-document to avoid email matches)
// for documents written before the HTML span format was introduced.
const MENTION_SPAN_PATTERN = /<span\s+([^>]*data-type="mention"[^>]*)>@([^<]+)<\/span>/g;
const MENTION_LEGACY_PATTERN = /(?:^|\s)@(\S+)/g;

/**
 * Extract a `data-<key>` attribute value from an HTML attribute string.
 * Returns `null` when the attribute is absent.
 */
function getAttr(attrs: string, key: string): string | null {
	const m = attrs.match(new RegExp(`data-${key}="([^"]*)"`));
	return m && m[1] !== undefined ? m[1] : null;
}

/**
 * Coerce a possibly-numeric attribute value to a number. Returns null
 * when the value is absent or not a finite number.
 */
function toNumber(value: string | null): number | null {
	if (value == null) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export interface ResolvedMentionsResult {
	markdown: string;
	mentions: ResolvedMention[];
}

function getTenantContext(
	requestContext: RequestContext | undefined
): TenantContext | null {
	if (!requestContext) return null;
	const ctx = requestContext.get('tenantContext') as TenantContext | undefined;
	return ctx ?? null;
}

/**
 * Resolve a student mention by numeric id. Looks up smStudents by primary
 * key, scoped to tenantContext.schoolId. Cross-checks the embedded
 * admissionNo (from the HTML span data-* attribute) against the DB row
 * and throws WorkspaceMismatchError on mismatch — the row's id alone is
 * not a stable cross-tenant key.
 *
 * Returns null if the row doesn't exist. Falls back to `embeddedStudentName`
 * for the display label when the DB row has no fullName (rare — a row
 * with a NULL fullName is a data-integrity issue but shouldn't crash).
 */
async function resolveStudentById(
	id: number,
	tenant: TenantContext,
	admissionNo: string | null,
	embeddedStudentName: string | null
): Promise<{
	label: string;
	admissionNo: string | null;
	studentName: string | null;
} | null> {
	const db = await getDatabase();
	const [row] = await db
		.select({
			id: smStudents.id,
			fullName: smStudents.fullName,
			admissionNo: smStudents.admissionNo,
			schoolId: smStudents.schoolId,
		})
		.from(smStudents)
		.where(and(eq(smStudents.id, id), eq(smStudents.schoolId, tenant.schoolId)))
		.limit(1);

	if (!row) {
		throw new WorkspaceMismatchError(
			`Student mention {{students:${id}}} does not belong to current school (schoolId: ${tenant.schoolId})`
		);
	}

	// Cross-check: if the editor embedded an admissionNo, verify it matches the
	// DB row. row.admissionNo is a number in the DB — coerce both sides to string.
	if (admissionNo && row.admissionNo != null && admissionNo !== String(row.admissionNo)) {
		throw new WorkspaceMismatchError(
			`Student mention {{students:${id}|${admissionNo}}} admissionNo mismatch: row has ${row.admissionNo}`
		);
	}

	const name = row.fullName?.trim() || embeddedStudentName || `Student #${row.id}`;
	const resolvedAdm = row.admissionNo != null ? String(row.admissionNo) : admissionNo;
	const adm = resolvedAdm != null ? ` (${resolvedAdm})` : '';
	return {
		label: `${name}${adm}`,
		admissionNo: resolvedAdm,
		studentName: name,
	};
}

/**
 * Resolve a student mention by name. Searches smStudents for a row whose
 * fullName matches the label (case-insensitive exact match), scoped to
 * tenantContext.schoolId. Returns null if no match is found.
 *
 * If multiple students share the same name, prefers the one in the active
 * class (tenant.classId) so a homeroom teacher gets their own student
 * rather than a duplicate from another section.
 */
async function resolveStudentByName(
	label: string,
	tenant: TenantContext
): Promise<{
	id: number;
	label: string;
	admissionNo: string | null;
	studentName: string;
} | null> {
	const db = await getDatabase();
	const rows = await db
		.select({
			id: smStudents.id,
			fullName: smStudents.fullName,
			admissionNo: smStudents.admissionNo,
			schoolId: smStudents.schoolId,
		})
		.from(smStudents)
		.where(
			and(
				eq(smStudents.schoolId, tenant.schoolId),
				eq(smStudents.activeStatus, 1)
			)
		)
		.limit(50);

	const normalizedLabel = label.trim().toLowerCase();
	const matches = rows.filter(
		(r) => (r.fullName ?? '').trim().toLowerCase() === normalizedLabel
	);
	if (matches.length === 0) return null;

	// Prefer active-class match if multiple students share the name.
	const preferred = tenant.classId != null
		? matches.find((m) => m.id === tenant.studentId) ?? matches[0]
		: matches[0];
	if (!preferred) return null;

	const name = preferred.fullName?.trim() || `Student #${preferred.id}`;
	const adm = preferred.admissionNo != null ? String(preferred.admissionNo) : null;
	return {
		id: preferred.id,
		label: adm != null ? `${name} (${adm})` : name,
		admissionNo: adm,
		studentName: name,
	};
}

/**
 * Resolve an academic-year mention by year/title. Searches the active
 * school's academic years for a row whose `year` or `title` matches the
 * label (case-insensitive substring match). Returns null if no match.
 */
async function resolveAcademicYearByLabel(
	label: string,
	tenant: TenantContext
): Promise<{ id: number; label: string } | null> {
	const db = await getDatabase();
	const { smAcademicYears } = await import('$lib/server/db/sms-schema');
	const rows = await db
		.select({
			id: smAcademicYears.id,
			year: smAcademicYears.year,
			title: smAcademicYears.title,
		})
		.from(smAcademicYears)
		.where(eq(smAcademicYears.schoolId, tenant.schoolId))
		.limit(50);

	const normalized = label.trim().toLowerCase();
	const match = rows.find(
		(r) =>
			(r.year ?? '').trim().toLowerCase() === normalized ||
			(r.year ?? '').trim().toLowerCase().includes(normalized) ||
			(r.title ?? '').trim().toLowerCase().includes(normalized)
	);
	if (!match) return null;
	const display = match.year?.trim() || match.title?.trim() || `Year #${match.id}`;
	return { id: match.id, label: display };
}

/**
 * Resolve an exam-type mention by title. Searches the active school's exam
 * types for a row whose `title` matches the label (case-insensitive exact
 * match). Returns null if no match.
 */
async function resolveExamByLabel(
	label: string,
	tenant: TenantContext
): Promise<{ id: number; label: string } | null> {
	const db = await getDatabase();
	const { smExamTypes } = await import('$lib/server/db/sms-schema');
	const rows = await db
		.select({
			id: smExamTypes.id,
			title: smExamTypes.title,
		})
		.from(smExamTypes)
		.where(eq(smExamTypes.schoolId, tenant.schoolId))
		.limit(50);

	const normalized = label.trim().toLowerCase();
	const match = rows.find(
		(r) => (r.title ?? '').trim().toLowerCase() === normalized
	);
	if (!match) return null;
	const display = match.title?.trim() || `Exam #${match.id}`;
	return { id: match.id, label: display };
}

/**
 * Resolves all @mentions in `markdown` against tenant-scoped data.
 *
 * Two mention formats are supported:
 *
 *   STRUCTURED   `<span data-type="mention" data-id="..." data-category="..."
 *                 data-admission-no="..." data-student-name="...">@<label></span>`
 *                 The round-tripped output of the editor's serialize function.
 *                 The structured data is extracted directly from the data-*
 *                 attributes — no name-based lookup needed. The DB is still
 *                 consulted to verify the entity belongs to the tenant's
 *                 schoolId (defense-in-depth against client-side tampering).
 *
 *   LEGACY       Plain `@<label>` (with leading whitespace or start-of-document).
 *                 For documents written before the HTML span format was
 *                 introduced. Falls back to name-based lookup via
 *                 `resolveOneMention()`.
 *
 * The function uses the request's tenantContext to scope every lookup by
 * schoolId, so cross-tenant mentions are rejected. Unresolved mentions are
 * left in place so the LLM at least sees the structure.
 */
export async function resolveMentionsInMarkdown(
	markdown: string,
	requestContext: RequestContext | undefined,
	_mastra: Mastra | undefined
): Promise<ResolvedMentionsResult> {
	const tenant = getTenantContext(requestContext);
	if (!tenant) {
		return { markdown, mentions: [] };
	}

	const mentions: ResolvedMention[] = [];
	const seen = new Set<string>();
	const replacements: Array<{ start: number; end: number; text: string; mention: ResolvedMention | null }> = [];

	// Pass 1: structured HTML spans — extract attrs directly, verify in DB.
	for (const match of markdown.matchAll(MENTION_SPAN_PATTERN)) {
		const fullSpan = match[0];
		const attrString = match[1];
		const label = match[2];
		const matchIndex = match.index ?? 0;
		const dedupeKey = `span:${fullSpan}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		const id = getAttr(attrString, 'id') ?? label;
		const category = getAttr(attrString, 'category') ?? 'custom';
		const admissionNo = getAttr(attrString, 'admission-no');
		const studentName = getAttr(attrString, 'student-name');
		const numericId = toNumber(id);

		try {
			const resolved = await resolveStructuredMention({
				id: numericId,
				label,
				category,
				admissionNo,
				studentName,
			}, tenant);
			if (resolved) {
				mentions.push(resolved.mention);
				replacements.push({ start: matchIndex, end: matchIndex + fullSpan.length, text: resolved.text, mention: resolved.mention });
			} else {
				replacements.push({ start: matchIndex, end: matchIndex + fullSpan.length, text: fullSpan, mention: null });
			}
		} catch (err) {
			if (err instanceof WorkspaceMismatchError) throw err;
			replacements.push({ start: matchIndex, end: matchIndex + fullSpan.length, text: fullSpan, mention: null });
		}
	}

	// Pass 2: legacy plain `@<label>` mentions — name-based fallback.
	for (const match of markdown.matchAll(MENTION_LEGACY_PATTERN)) {
		const fullMatch = match[0];
		const label = match[1];
		if (label === undefined) continue;
		const matchIndex = match.index ?? 0;
		const dedupeKey = `@${label}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		// Skip if this match overlaps with an already-processed span.
		if (replacements.some((r) => matchIndex >= r.start && matchIndex < r.end)) continue;

		const leadingWs = fullMatch.startsWith('@') ? '' : fullMatch.slice(0, fullMatch.length - label.length - 1);
		const replacement = await resolveOneMention(label, tenant);
		if (replacement.resolved) {
			mentions.push(replacement.mention);
			replacements.push({
				start: matchIndex,
				end: matchIndex + fullMatch.length,
				text: leadingWs + replacement.text,
				mention: replacement.mention,
			});
		} else {
			replacements.push({
				start: matchIndex,
				end: matchIndex + fullMatch.length,
				text: fullMatch,
				mention: null,
			});
		}
	}

	// Apply replacements in order, preserving everything between matches.
	replacements.sort((a, b) => a.start - b.start);
	let out = '';
	let cursor = 0;
	for (const r of replacements) {
		out += markdown.slice(cursor, r.start) + r.text;
		cursor = r.end;
	}
	out += markdown.slice(cursor);

	return { markdown: out, mentions };
}

interface StructuredMentionAttrs {
	id: number | null;
	label: string;
	category: string;
	admissionNo: string | null;
	studentName: string | null;
}

interface StructuredResolved {
	text: string;
	mention: ResolvedMention;
}

/**
 * Resolve a mention whose structured data was extracted from the HTML span
 * data-* attributes. Verifies the entity belongs to the tenant's schoolId
 * (defense-in-depth against client-side tampering) and looks up the
 * authoritative row to get the canonical fullName + admissionNo.
 *
 * Returns null when the entity can't be found or doesn't belong to the
 * tenant — in which case the caller leaves the original span text in place.
 */
async function resolveStructuredMention(
	attrs: StructuredMentionAttrs,
	tenant: TenantContext
): Promise<StructuredResolved | null> {
	const { id, label, category, admissionNo, studentName } = attrs;

	if (category === 'students') {
		if (id == null) return null;
		try {
			const resolved = await resolveStudentById(id, tenant, admissionNo, studentName);
			if (!resolved) return null;
			return {
				text: `<<${resolved.label} (students#${id})>>`,
				mention: {
					category,
					id,
					label: resolved.label,
					admissionNo: resolved.admissionNo ?? undefined,
					studentName: resolved.studentName ?? studentName ?? undefined,
				},
			};
		} catch (err) {
			if (err instanceof WorkspaceMismatchError) throw err;
			return null;
		}
	}

	if (category === 'academic_year') {
		if (id == null) return null;
		const db = await getDatabase();
		const { smAcademicYears } = await import('$lib/server/db/sms-schema');
		const [row] = await db
			.select({ id: smAcademicYears.id, year: smAcademicYears.year, title: smAcademicYears.title, schoolId: smAcademicYears.schoolId })
			.from(smAcademicYears)
			.where(and(eq(smAcademicYears.id, id), eq(smAcademicYears.schoolId, tenant.schoolId)))
			.limit(1);
		if (!row) {
			throw new WorkspaceMismatchError(
				`Academic year mention {{academic_year:${id}}} does not belong to current school (schoolId: ${tenant.schoolId})`
			);
		}
		const display = row.year?.trim() || row.title?.trim() || label || `Year #${id}`;
		return {
			text: `<<${display} (academic_year#${id})>>`,
			mention: { category, id, label: display },
		};
	}

	if (category === 'exam') {
		if (id == null) return null;
		const db = await getDatabase();
		const { smExamTypes } = await import('$lib/server/db/sms-schema');
		const [row] = await db
			.select({ id: smExamTypes.id, title: smExamTypes.title, schoolId: smExamTypes.schoolId })
			.from(smExamTypes)
			.where(and(eq(smExamTypes.id, id), eq(smExamTypes.schoolId, tenant.schoolId)))
			.limit(1);
		if (!row) {
			throw new WorkspaceMismatchError(
				`Exam mention {{exam:${id}}} does not belong to current school (schoolId: ${tenant.schoolId})`
			);
		}
		const display = row.title?.trim() || label || `Exam #${id}`;
		return {
			text: `<<${display} (exam#${id})>>`,
			mention: { category, id, label: display },
		};
	}

	// Unknown / custom category — fall through with the label as-is.
	return {
		text: `<<${label} (${category}#${id ?? label})>>`,
		mention: { category, id: id ?? label, label },
	};
}

interface ResolvedOne {
	resolved: boolean;
	text: string;
	mention: ResolvedMention;
}

/**
 * Resolves a single mention label against tenant-scoped data. Tries
 * name-based lookups in order: students, academic years, exam types.
 * Returns the replacement text + structured mention on success, or a
 * sentinel `{ resolved: false }` if no match is found.
 */
async function resolveOneMention(
	label: string,
	tenant: TenantContext
): Promise<ResolvedOne> {
	// Try student first — they're the most common mention.
	try {
		const student = await resolveStudentByName(label, tenant);
		if (student) {
			return {
				resolved: true,
				text: `<<${student.label} (students#${student.id})>>`,
				mention: {
					category: 'students',
					id: student.id,
					label: student.label,
					admissionNo: student.admissionNo ?? undefined,
					studentName: student.studentName,
				},
			};
		}
	} catch (err) {
		if (err instanceof WorkspaceMismatchError) throw err;
	}

	const academicYear = await resolveAcademicYearByLabel(label, tenant);
	if (academicYear) {
		return {
			resolved: true,
			text: `<<${academicYear.label} (academic_year#${academicYear.id})>>`,
			mention: {
				category: 'academic_year',
				id: academicYear.id,
				label: academicYear.label,
			},
		};
	}

	const exam = await resolveExamByLabel(label, tenant);
	if (exam) {
		return {
			resolved: true,
			text: `<<${exam.label} (exam#${exam.id})>>`,
			mention: {
				category: 'exam',
				id: exam.id,
				label: exam.label,
			},
		};
	}

	// Unresolved — return a custom mention so the LLM at least sees the
	// label in the resolved mentions list.
	return {
		resolved: false,
		text: `@${label}`,
		mention: {
			category: 'custom',
			id: label,
			label,
		},
	};
}
