// Uses native Mastra API: workflow.watch() for WorkflowStreamEvent subscription.
// Custom SSE endpoint adapts Mastra workflow events to browser-compatible SSE delivery.

import { error, type RequestHandler } from '@sveltejs/kit';
import { SSEManager, formatSSE } from '$lib/server/mastra/sse-manager';
import { createTenantContext } from '$lib/server/mastra/tenant-context';

/**
 * Shared SSE Manager instance for workflow event delivery.
 * Manages client connections, keepalive, and event broadcasting.
 */
const sseManager = new SSEManager();

export const GET: RequestHandler = ({ url, locals }) => {
	const runId = url.searchParams.get('runId');
	if (!runId) {
		error(400, 'Missing required query parameter: runId');
	}

	const { user } = locals;
	if (!user) {
		error(401, 'Authentication required');
	}

	const tenantContext = createTenantContext({
		schoolId: user.schoolId ?? 1,
		userId: user.id ?? 1,
		designationId: (user as any).designationId ?? 1,
		staffId: (user as any).staffId ?? 1,
		roleId: (user as any).roleId ?? null,
		classId: null,
		sectionId: null,
		examId: null,
		academicId: null
	});

	let clientId: string;

	const stream = new ReadableStream({
		start(controller) {
			// Start keepalive on first client connection
			if (sseManager.clientCount === 0) {
				sseManager.startKeepalive();
			}

			clientId = sseManager.registerClient(runId, tenantContext, controller);

			// Send initial connected event
			controller.enqueue(new TextEncoder().encode(formatSSE('connected', { runId })));

			// Send catchup data for workflows already in progress
			sseManager.emitCatchup(clientId);
		},
		cancel() {
			sseManager.removeClient(clientId);

			// Stop keepalive when no clients remain
			if (sseManager.clientCount === 0) {
				sseManager.stopKeepalive();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
