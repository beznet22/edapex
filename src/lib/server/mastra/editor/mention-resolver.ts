/**
 * Mention Resolver — EdApex
 *
 * Scans a markdown document for `{{category:id}}` placeholders inserted by
 * the editor's @mention extension and replaces each with a resolved string
 * suitable for the LLM prompt. The categories handled here mirror those
 * exposed by the editor mention popup (see routes/api/mentions/search):
 *
 *   students  -> look up smStudents by id, scoped to tenantContext.schoolId;
 *                returns "<fullName> (Adm#<admissionNo>)" so the LLM sees
 *                both the human name and the structured ID.
 *   date      -> literal pass-through (the placeholder already encodes a
 *                date value like 2025-01-15; we wrap it for readability).
 *   custom    -> literal pass-through; the user typed arbitrary text and
 *                opted not to use a structured entity.
 *
 * Throws WorkspaceMismatchError if any student mention is from a different
 * school — defense-in-depth against a client that constructs mentions
 * client-side without server validation.
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

const MENTION_PATTERN = /\{\{([a-z_]+):([^}]+)\}\}/g;

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

async function resolveStudent(
	id: string,
	tenant: TenantContext
): Promise<{ label: string } | null> {
	const numericId = Number(id);
	if (!Number.isFinite(numericId)) return null;

	const db = await getDatabase();
	const [row] = await db
		.select({
			id: smStudents.id,
			fullName: smStudents.fullName,
			admissionNo: smStudents.admissionNo,
			schoolId: smStudents.schoolId,
		})
		.from(smStudents)
		.where(and(eq(smStudents.id, numericId), eq(smStudents.schoolId, tenant.schoolId)))
		.limit(1);

	if (!row) {
		throw new WorkspaceMismatchError(
			`Student mention {{students:${id}}} does not belong to current school (schoolId: ${tenant.schoolId})`
		);
	}

	const name = row.fullName?.trim() || `Student #${row.id}`;
	const adm = row.admissionNo != null ? ` (Adm#${row.admissionNo})` : '';
	return { label: `${name}${adm}` };
}

/**
 * Resolves all @mentions in `markdown` against tenant-scoped data.
 *
 * The function uses the request's tenantContext to scope every lookup by
 * schoolId, so cross-tenant mentions are rejected. Unresolved placeholders
 * are left in place so the LLM at least sees the structure.
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

	let out = '';
	let cursor = 0;
	for (const match of markdown.matchAll(MENTION_PATTERN)) {
		const [full, category, rawId] = match;
		if (!category || rawId === undefined) continue;
		const dedupeKey = `${category}:${rawId}`;
		if (seen.has(dedupeKey)) {
			seen.add(dedupeKey);
			continue;
		}

		const matchIndex = match.index ?? 0;
		out += markdown.slice(cursor, matchIndex);
		cursor = matchIndex + full.length;

		let replacement = full;
		if (category === 'students') {
			try {
				const resolved = await resolveStudent(rawId, tenant);
				if (resolved) {
					mentions.push({ category, id: Number(rawId), label: resolved.label });
					replacement = `<<${resolved.label} (${category}#${rawId})>>`;
				}
			} catch (err) {
				if (err instanceof WorkspaceMismatchError) throw err;
			}
		} else if (category === 'date') {
			mentions.push({ category, id: rawId, label: rawId });
			replacement = `<<${rawId} (date)>>`;
		} else if (category === 'custom') {
			mentions.push({ category, id: rawId, label: rawId });
			replacement = `<<${rawId} (custom)>>`;
		}

		out += replacement;
	}
	out += markdown.slice(cursor);

	return { markdown: out, mentions };
}
