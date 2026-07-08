/**
 * Chat workflow helpers — merged home for both data-part persistence and
 * disambiguation parsing.
 *
 * Why merged: both are small chat-specific helpers. Keeping them in one file
 * avoids a proliferation of one-purpose utility files in `utils/`.
 */

import type { MastraMessagePart } from '@mastra/core/agent';
import { getMemory } from '../index';

/** Narrow `MastraMessagePart` to just the data-* branch — the only kind the
 *  helper persists. Reuses the official type so there is no drift. */
export type PersistableDataPart = Extract<MastraMessagePart, { type: `data-${string}` }>;

/** Thread identity used to locate the latest assistant message in memory. */
export interface MemoryContext {
	threadId: string;
	resourceId: string;
}

export interface WriteDataPartOptions {
	data: PersistableDataPart;
	memory: MemoryContext;
	/**
	 * When `true`, the part is streamed to the client but NOT persisted to
	 * memory. Useful for ephemeral UI signals (rate-limit banners, toasts,
	 * token-usage counters) that don't need to survive a page reload.
	 *
	 * The AI SDK UIMessageStream contract treats `transient` as a stream-level
	 * flag, not a part-level field, so it lives on the options bag here rather
	 * than on `data`. Defaults to `false`.
	 */
	transient?: boolean;
}

/** Minimal stream-writer contract — anything with `custom(chunk)`. Broad
 *  enough to be structurally assignable to `ToolStream` (whose `custom<T>` has
 *  a constrained generic parameter), without depending on the `ToolStream`
 *  type directly (kept internal to avoid leaking tool-stream types into the
 *  util's public surface). */
type DataPartWriter = {
	custom: (chunk: { type: string }) => Promise<void>;
};

/**
 * Persistence eligibility. Returns `true` only when the part should be
 * written to memory. Skipped when:
 *   - the part is missing or its `type` is not a string
 *   - the part's type doesn't start with `data-`
 *   - `options.transient` is `true`
 */
function shouldPersist(part: PersistableDataPart | undefined, optionsTransient: boolean | undefined): boolean {
	if (!part || typeof part.type !== 'string') return false;
	if (!part.type.startsWith('data-')) return false;
	if (optionsTransient === true) return false;
	return true;
}

/**
 * Stream a data-* part to the client AND (optionally) persist it onto the
 * latest assistant message in memory. Single function so call sites stay
 * readable.
 *
 *   // Persistent — survives page reload
 *   await writeDataPart(writer, {
 *     data: { type: 'data-selectOption', id: gateId, data: { ... } },
 *     memory: { threadId, resourceId },
 *   });
 *
 *   // Transient — client-only (toasts, banners, usage counters)
 *   await writeDataPart(writer, {
 *     data: { type: 'data-usage', id: usageId, data: { ... } },
 *     memory: { threadId, resourceId },
 *     transient: true,
 *   });
 *
 * Behaviour:
 * - `writer.custom(data)` always runs first so the client sees the part
 *   during streaming even if persistence fails.
 * - Persistence skipped for non-`data-*` parts and when `options.transient`
 *   is `true`.
 * - Persistence looks up the assistant agent's `Memory` via `getMemory()`,
 *   recalls the latest assistant message for the thread, appends the part,
 *   and calls `saveMessages` (which UPSERTs on id via libsql's
 *   `ON CONFLICT(id) DO UPDATE`).
 * - If no assistant message exists yet, persistence is skipped with a warning.
 *   Callers must invoke `writeDataPart` AFTER the agent stream has finished
 *   persisting (e.g. after `stream.fullStream.pipeTo(writer)`).
 * - Persistence errors are logged but never thrown — the part has already
 *   streamed to the client, so a DB failure must not break the workflow.
 */
export async function writeDataPart(
	writer: DataPartWriter | undefined,
	options: WriteDataPartOptions
): Promise<void> {
	const { data, memory: memCtx, transient } = options;

	if (writer && data?.type) {
		try {
			await writer.custom(data as never);
		} catch (err) {
			console.error('[writeDataPart] writer.custom failed:', err);
		}
	}

	if (!shouldPersist(data, transient)) return;

	let memory;
	try {
		memory = await getMemory();
	} catch (err) {
		console.error('[writeDataPart] getMemory failed:', err);
		return;
	}
	if (!memory) return;

	let recalled;
	try {
		recalled = await memory.recall({
			threadId: memCtx.threadId,
			resourceId: memCtx.resourceId,
		});
	} catch (err) {
		console.error('[writeDataPart] memory.recall failed:', err);
		return;
	}

	const lastAssistant = [...recalled.messages].reverse().find((m) => m.role === 'assistant');
	if (!lastAssistant) {
		console.warn(
			`[writeDataPart] No assistant message found in thread ${memCtx.threadId}; data part not persisted`,
			{ type: data.type, id: data.id }
		);
		return;
	}

	const updated: typeof lastAssistant = {
		...lastAssistant,
		content: {
			...lastAssistant.content,
			parts: [...(lastAssistant.content.parts ?? []), data],
		},
	};

	try {
		await memory.saveMessages({ messages: [updated] });
	} catch (err) {
		console.error('[writeDataPart] memory.saveMessages failed:', err);
	}
}

/**
 * Translates a disambiguation option ID (emitted by validate-marksheet's
 * `buildDisambiguationOptions`) into the `permissionGrant`-shaped object
 * the tool consumes to fill missing IDs from tenant context.
 *
 * Option ID shapes emitted by validate-marksheet:
 *   "student:use_tenant:42"      → { useTenantStudent: true }
 *   "examType:use_tenant:3"      → { useTenantExamType: true }
 *   "academicYear:use_tenant:1"  → { useTenantAcademicYear: true }
 *   "student:42"                 → { studentId: 42 }      (explicit ID form)
 *   "proceed:anyway"             → {}                     (best-effort defaults)
 *
 * Free-text answers (the `freeTextAnswer` field on the resume payload)
 * cannot be parsed — the caller treats them as no resolution, which
 * triggers another `id_required` cycle prompting the user to pick a
 * structured option.
 */
export function parseResolvedOptionId(optionId: string): {
	studentId?: number;
	examTypeId?: number;
	academicId?: number;
	useTenantStudent?: boolean;
	useTenantExamType?: boolean;
	useTenantAcademicYear?: boolean;
} {
	const result: ReturnType<typeof parseResolvedOptionId> = {};
	const parts = optionId.split(':');
	const kind = parts[0];
	const action = parts[1];

	if (action === 'use_tenant') {
		if (kind === 'student') result.useTenantStudent = true;
		else if (kind === 'examType') result.useTenantExamType = true;
		else if (kind === 'academicYear') result.useTenantAcademicYear = true;
	} else if (action && /^\d+$/.test(action)) {
		const id = Number(action);
		if (kind === 'student') result.studentId = id;
		else if (kind === 'examType') result.examTypeId = id;
		else if (kind === 'academicYear') result.academicId = id;
	}

	return result;
}
