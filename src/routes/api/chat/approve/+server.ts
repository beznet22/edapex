/**
 * POST /api/chat/approve
 *
 * Resumes a suspended assistant-agent run by approving a `requireApproval:
 * true` tool call. Called from the ActionBar's Approve button (see
 * `src/lib/components/chat/ActionBar.svelte`).
 *
 * Body: { runId: string; toolCallId?: string; agentId?: string }
 *
 * Response: `text/event-stream`. Each `textStream` chunk from the resumed
 * agent is emitted as
 *
 *     data: { "text": "<chunk>" }\n\n
 *
 * followed by a terminal `data: { "done": true }\n\n` event when the
 * stream completes. Errors during resumption or streaming are emitted as
 * `data: { "error": "<message>" }\n\n` before the stream closes. The
 * client merges chunks into the same chat transcript shape used by
 * `/api/chat`, so the UI surface does not need to special-case approval
 * resumes.
 *
 * Status codes:
 *   400 — missing/invalid runId
 *   401 — unauthenticated
 *   500 — agent missing, approveToolCall rejected, or stream error
 */
import { allowAnonymousChats } from '$lib/constants';
import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';

export const POST: RequestHandler = async ({ request, locals: { user, session } }) => {
	if ((!user || !session) && !allowAnonymousChats) error(401, 'Unauthorized');
	if (!user) error(401, 'User session required');

	let body: { runId?: unknown; toolCallId?: unknown; agentId?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { runId, toolCallId, agentId } = body;
	if (typeof runId !== 'string' || runId.length === 0) {
		return new Response(JSON.stringify({ error: 'runId is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	if (toolCallId !== undefined && typeof toolCallId !== 'string') {
		return new Response(
			JSON.stringify({ error: 'toolCallId must be a string when provided' }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const agentName = typeof agentId === 'string' && agentId.length > 0 ? agentId : 'assistant';
	const agent = mastra.getAgent(agentName);
	if (!agent) {
		console.error(`[api/chat/approve] agent '${agentName}' not registered`);
		return new Response(JSON.stringify({ error: 'agent not found' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let textStream: AsyncIterable<string> | undefined;
	try {
		const approved = await agent.approveToolCall({
			runId,
			...(toolCallId ? { toolCallId } : {})
		});
		textStream = approved.textStream;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[api/chat/approve] approveToolCall failed for runId=${runId}: ${msg}`);
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!textStream) {
		return new Response(JSON.stringify({ error: 'agent stream unavailable' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const encoder = new TextEncoder();
	const readable = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const chunk of textStream) {
					if (chunk) {
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
						);
					}
				}
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
				controller.close();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
				);
				controller.close();
			}
		}
	});

	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
