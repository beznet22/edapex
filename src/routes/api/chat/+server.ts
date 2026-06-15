/**
 * Chat API Route — EdApex
 *
 * Workflow-driven chat streaming. Replaces the prior `handleChatStream` path
 * with `handleWorkflowStream({ workflowId: 'chatWorkflow' })`. The workflow:
 *
 *  1. `.parallel([classifyAndStreamWorkflow, titleStep])` — file processing
 *     (the `classifyAndStreamWorkflow` sub-workflow) and title generation
 *     run concurrently.
 *  2. `extractFileItemsStep` flattens the parallel record into the array
 *     contract required by the remaining steps.
 *  3. collapseStep → hitlVerifyStep → assistantStep
 *
 * `titleStep` is a side-effect step that emits `data-threadCreated` to the
 * stream when a new thread is created; thread resolution itself is handled
 * by the assistant agent's auto-memory and the `generateThreadTitle` helper.
 *
 * Per-file `data-createDocument` parts are emitted by the workflow's
 * `streamDocumentStep` directly into the workflow writer; the workflow's
 * AI SDK transformer surfaces them to the client unchanged.
 *
 * NOTE: Thread resolution is handled inside the workflow (via `titleStep`
 * and the assistant agent's auto-memory). `resolveThread` is intentionally
 * NOT called here — `data-threadCreated` is emitted by the workflow writer
 * if a new thread is created mid-run.
 */
import { allowAnonymousChats } from "$lib/constants";
import type { xUIMessage } from "$lib/types/chat-types";
import { error, type RequestHandler } from "@sveltejs/kit";
import {
	createUIMessageStream,
	createUIMessageStreamResponse
} from "ai";
import { handleWorkflowStream } from "@mastra/ai-sdk";
import type { WorkflowStreamHandlerParams } from "@mastra/ai-sdk";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import {
	createTenantContext,
	resolveExamTypeId,
	withExamTypeId,
	WorkspaceMismatchError
} from "$lib/server/mastra/tenant-context";
import type { ClassSection } from "$lib/types/result-types";
import { processMentions, type MentionTag } from "$lib/server/mastra/mention-processor";
import { TenantContextCache } from "$lib/server/mastra/context-cache";
import type { FileReference } from "$lib/server/mastra/file-context";
import { mastra } from "$lib/server/mastra";
import { buildRequestContext, resolveThread } from "$lib/server/helpers/chat-helper";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { chatWorkflowInputSchema } from "$lib/server/mastra/workflows/chat";
import type { z } from "zod";
import type { RequestContext } from "@mastra/core/request-context";

type ChatWorkflowInput = z.infer<typeof chatWorkflowInputSchema>;
type ChatWorkflowParams = WorkflowStreamHandlerParams & {
	inputData: ChatWorkflowInput;
	requestContext: RequestContext<unknown>;
	abortSignal?: AbortSignal;
};

const tenantContextCache = new TenantContextCache();

export const POST: RequestHandler = async ({ request, locals: { user, session }, cookies }) => {

	let { threadId, messages, selectedClass, fileReferences, mentions }: {
		threadId: string;
		messages: xUIMessage[];
		selectedClass?: ClassSection;
		fileReferences?: FileReference[];
		mentions?: MentionTag[];
	} = await request.json();

	if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
	if (!user) error(401, "User session required for provider resolution");

	const selectedChatModel = cookies.get("selected-model") ?? "";
	if (selectedChatModel === 'auto' || selectedChatModel === 'deep-reasoning') {
		error(400, "Invalid model selection");
	}
	// Empty cookie is OK — chat-helper will auto-pick from platform defaults.

	const resourceId = `user-${user.id}`;

	// ─── Build Tenant Context ─────────────────────────────────────────────────

	const tenantContext = createTenantContext({
		schoolId: user.schoolId ?? 1,
		userId: user.id ?? 1,
		designationId: (user as any).designationId ?? ALLOWED_DESIGNATIONS.IT,
		staffId: (user as any).staffId ?? 1,
		roleId: (user as any).roleId ?? null,
		classId: selectedClass?.id ?? null,
		sectionId: selectedClass?.sectionId ?? null,
		examId: null,
		examTypeId: null,
		academicId: null
	});

	let activeContext = tenantContext;
	if (mentions && mentions.length > 0) {
		try {
			const sessionId = session?.id ?? `anon-${user.id}`;
			const designationId = (user as any).designationId ?? ALLOWED_DESIGNATIONS.IT;
			activeContext = await processMentions(
				mentions,
				tenantContext,
				tenantContextCache,
				sessionId,
				designationId
			);
		} catch (e) {
			if (e instanceof WorkspaceMismatchError) {
				return new Response(
					JSON.stringify({ error: 'WORKSPACE_MISMATCH', message: e.message }),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				);
			}
			throw e;
		}
	}

	// ─── Build Request Context ────────────────────────────────────────────────

	const lastMessage = messages[messages.length - 1];
	const promptText = lastMessage.parts?.find((p) => p.type === "text")?.text || "";
	const isSlashCommand = promptText.trim().startsWith('/');

	if (activeContext.examTypeId === null) {
		const resolved = await resolveExamTypeId(activeContext.schoolId, null);
		activeContext = withExamTypeId(activeContext, resolved);
	}

	const requestContext = await buildRequestContext({
		context: activeContext,
		userId: user.id,
		modelId: selectedChatModel,
		isSlashCommand,
		lastMessage: promptText
	});
	
	const assistant = mastra.getAgent('assistant');
	const memory = await assistant.getMemory();
	if (!memory) {
		throw new Error('Assistant agent has no memory configured.');
	}

	let stream;
	try {
		const params: ChatWorkflowParams = {
			inputData: {
				threadId,
				resourceId,
				promptText,
				fileReferences: fileReferences ?? []
			},
			requestContext: requestContext as RequestContext<unknown>,
			abortSignal: request.signal
		};
		
		stream = await handleWorkflowStream<xUIMessage>({
			version: 'v6',
			mastra,
			workflowId: 'chatWorkflow',
			params,
			sendReasoning: true,
			sendSources: true
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes('AbortError') || msg.includes('aborted')) {
			console.info('[api/chat] Stream aborted by client');
		} else {
			console.error(`[api/chat] Error starting workflow: ${msg}`);
		}
		throw e;
	}
	
	return createUIMessageStreamResponse({ stream });
};

/**
 * GET handler for history hydration.
 * When the client navigates to `/chat/[chatId]`, this endpoint returns
 * the persisted messages in AI SDK v5 format for UI hydration.
 *
 * Uses the static assistant agent's Memory instance — the same instance
 * that auto-persists messages during streaming.
 */
export const GET: RequestHandler = async ({ url, locals: { user } }) => {
	if (!user) error(401, 'Unauthorized');

	const chatId = url.searchParams.get('chatId');
	if (!chatId) error(400, 'Missing chatId');

	const resourceId = `user-${user.id}`;
	const assistant = mastra.getAgent('assistant');
	const memory = await assistant.getMemory();

	let response = null;
	try {
		response = await memory?.recall({ threadId: chatId, resourceId });
	} catch {
		console.log('No previous messages found.');
	}

	const uiMessages = toAISdkV5Messages(response?.messages || []);
	return Response.json(uiMessages);
};
