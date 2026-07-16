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
	const requestContext = buildWorkspaceRequestContext(tenantContext);

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
