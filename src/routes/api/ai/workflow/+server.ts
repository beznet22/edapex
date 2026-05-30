import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';
import { handleWorkflowStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { EdApexGateway } from '$lib/server/mastra/gateway';
import { createMastraDb } from '$lib/server/mastra/db';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import type { ClassSection } from '$lib/types/result-types';
import type { xUIMessage } from '$lib/types/chat-types';
import type { FileReference } from '$lib/server/mastra/file-context';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, user } = locals;
	if (!user) error(401, 'Unauthorized');

	const body = await request.json();
	const { threadId, messages, selectedClass, fileReferences } = body as {
		threadId: string;
		messages: xUIMessage[];
		selectedClass?: ClassSection;
		fileReferences?: FileReference[];
	};

	const lastMessage = messages[messages.length - 1];
	const text = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
	const match = text.trim().match(/^\/(\w+)/);
	const command = match ? match[1] : '';

	let workflowId = '';
	if (command === 'extract') {
		workflowId = 'extractionWorkflow';
	} else if (command === 'generate') {
		workflowId = 'generateWorkflow';
	} else if (command === 'validate') {
		workflowId = 'validationWorkflow';
	} else if (command === 'publish') {
		workflowId = 'publishWorkflow';
	} else {
		error(400, `Unsupported slash command: /${command}`);
	}

	const tenantContext = createTenantContext({
		schoolId: user.schoolId ?? 1,
		userId: user.id ?? 1,
		designationId: (user as any).designationId ?? 1,
		staffId: (user as any).staffId ?? 1,
		roleId: (user as any).roleId ?? null,
		classId: selectedClass?.id ?? null,
		sectionId: selectedClass?.sectionId ?? null,
		examId: null,
		academicId: null
	});

	const mastraDb = createMastraDb();
	const gateway = new EdApexGateway(mastraDb, user.id);
	mastra.addGateway(gateway);

	const inputData = {
		threadId,
		messages,
		fileReferences,
		classId: selectedClass?.id,
		sectionId: selectedClass?.sectionId,
		tenantContext,
		staffId: (user as any).staffId ?? 1,
	};

	try {
		const stream = await handleWorkflowStream({
			mastra,
			params: {
				inputData,
			},
			workflowId,
		});

		return createUIMessageStreamResponse({ stream: stream as ReadableStream<UIMessageChunk> });
	} catch (e: any) {
		console.error(`[workflow-exec] Failed to execute ${workflowId}:`, e);
		return Response.json({
			error: e.message || "Failed to process workflow request",
		}, { status: 500 });
	}
};
