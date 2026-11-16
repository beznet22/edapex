/**
 * Editor Command API — EdApex
 *
 * Streams AI-generated text for the editor's "Improve" and "Generate" commands.
 * Routes through the editorCommandWorkflow which uses agent.stream() + writer
 * for real-time token streaming back to the Tiptap editor.
 *
 * Per-request, builds a RequestContext populated with the user's TenantContext
 * so the workflow's resolveMentionsStep can scope database lookups by schoolId.
 */
import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';
import { editorCommandRequestSchema } from '$lib/server/mastra/editor/schemas';
import { handleWorkflowStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { buildWorkspaceRequestContext, resolveWorkspaceContext } from '$lib/server/helpers/chat-helper';
import type { RequestContext } from '@mastra/core/request-context';
import { resolveModelForRequest, pickDefaultModelId } from '$lib/server/mastra/provider';
import { resolveUserRole } from '$lib/server/mastra/provider/role-resolver';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { env } from '$env/dynamic/private';

// Hard cap on document markdown sent as backgroundData. The full doc is sent
// on every AI request — uncapped this can OOM the server when streaming a 70B
// model. 50 KB ≈ ~12k tokens, enough for substantial context, bounded heap.
const MAX_MARKDOWN_CHARS = 50_000;

function capMarkdown(md: string | undefined): string {
	if (!md) return '';
	if (md.length <= MAX_MARKDOWN_CHARS) return md;
	return md.slice(0, MAX_MARKDOWN_CHARS) + '\n\n[…document truncated for AI context…]';
}

export const POST: RequestHandler = async ({ request, locals: { user }, cookies }) => {
	if (!user) error(401, 'Unauthorized');

	const body = await request.json();
	const parsed = editorCommandRequestSchema.safeParse(body);

	if (!parsed.success) {
		error(400, `Invalid request: ${parsed.error.message}`);
	}

	if (parsed.data?.ctx?.markdown !== undefined) {
		parsed.data.ctx.markdown = capMarkdown(parsed.data.ctx.markdown);
	}

	const { tenant: tenantContext } = await resolveWorkspaceContext(cookies, {
		id: user.id,
		schoolId: user.schoolId ?? null,
		staffId: (user as { staffId?: number }).staffId ?? null,
		designationId: (user as { designationId?: number }).designationId ?? null,
		roleId: (user as { roleId?: number | null }).roleId ?? null,
	});

	// Resolve the user's per-request model through the 4-tier router so
	// the editor agents (editorEdit / editorGenerate) use the user's own
	// key (tier 1) before pool (tier 2) and env (tier 3). Failure is
	// non-fatal: agents fall through to their per-call env default.
	const cookieModel = cookies.get('selected-model') ?? '';
	const db = getAppDb();
	const envKeys = env as Record<string, string | undefined>;
	const traceContext = {
		userId: user.id,
		schoolId: tenantContext.schoolId,
		actorStaffId: tenantContext.staffId,
		userRole: resolveUserRole(tenantContext.designationId),
		todayTokenUsage: 0
	};
	let modelConfig: Awaited<ReturnType<typeof resolveModelForRequest>> | null = null;
	try {
		if (cookieModel) {
			modelConfig = await resolveModelForRequest(
				user.id, cookieModel, db, undefined, traceContext
			);
		} else {
			const defaultId = await pickDefaultModelId(db, envKeys, {
				userId: user.id,
				schoolId: tenantContext.schoolId,
				userRole: traceContext.userRole
			});
			if (defaultId) {
				modelConfig = await resolveModelForRequest(
					user.id, defaultId, db, undefined, traceContext
				);
			}
		}
	} catch (err) {
		console.warn('[editor-command] model resolution skipped:', err instanceof Error ? err.message : err);
	}

	const requestContext = buildWorkspaceRequestContext(
		tenantContext,
		modelConfig ? { config: modelConfig.config, providerOptions: modelConfig.providerOptions } : undefined
	);

	try {
		const stream = await handleWorkflowStream({
			mastra,
			params: {
				inputData: parsed.data,
				requestContext: requestContext as unknown as RequestContext<unknown>,
			},
			workflowId: 'editorCommandWorkflow',
		});

		return createUIMessageStreamResponse({ stream: stream as ReadableStream<UIMessageChunk> });
	} catch (e) {
		console.error('[editor-command]', e);
		return Response.json({
			error: 'Failed to process AI request',
		}, { status: 500 });
	}
};
