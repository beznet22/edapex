/**
 * Editor Command API — EdApex
 *
 * Streams AI-generated text for the editor's "Improve" and "Generate" commands.
 * Routes through the editorCommandWorkflow which uses agent.stream() + writer
 * for real-time token-by-token streaming back to the Tiptap editor.
 *
 * Parity with: basic-ai-editor/app/api/ai/command/route.ts
 */
import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';
import { editorCommandRequestSchema } from '$lib/server/mastra/editor/schemas';
import { handleWorkflowStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { EdApexGateway } from '$lib/server/mastra/gateway';
import { createMastraDb } from '$lib/server/mastra/db';

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) error(401, 'Unauthorized');

	const body = await request.json();
	const parsed = editorCommandRequestSchema.safeParse(body);

	if (!parsed.success) {
		error(400, `Invalid request: ${parsed.error.message}`);
	}

	const mastraDb = createMastraDb();
	const gateway = new EdApexGateway(mastraDb, user.id);
	mastra.addGateway(gateway);

	try {
		const stream = await handleWorkflowStream({
			mastra,
			params: {
				inputData: parsed.data,
			},
			workflowId: "editorCommandWorkflow",
		});

		return createUIMessageStreamResponse({ stream: stream as ReadableStream<UIMessageChunk> });
	} catch (e) {
		console.error('[editor-command]', e);
		return Response.json({
			error: "Failed to process AI request",
		}, { status: 500 });
	}
};