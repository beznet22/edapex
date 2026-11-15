import { allowAnonymousChats } from "$lib/constants";
import { error, type Cookies, type RequestHandler } from "@sveltejs/kit";
import {
	createUIMessageStream,
	createUIMessageStreamResponse
} from "ai";
import { handleWorkflowStream } from "@mastra/ai-sdk";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { WorkspaceMismatchError } from "$lib/server/mastra/tenant-context";
import { mastra } from "$lib/server/mastra";
import { runWithCache } from "$lib/server/mastra/provider/cache";
import {
	buildApprovalContext,
	buildWorkflowParams,
	findToolApprovalResponse,
	resumeAgentToolCall,
	type ChatWorkflowParams
} from "./workflow-params";
import type { AuthUser } from "$lib/types/auth-types";
import type { xUIMessagePart } from "$lib/types/chat-types";

export const POST: RequestHandler = async ({ request, locals: { user, session }, cookies }) => {
	const payload = await request.json();
	const promptText = payload?.messages?.at(-1)?.parts?.find((p: xUIMessagePart) => p.type === "text")?.text || "";
	console.info(`[api/chat] New request received: ${promptText}`);

	if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
	if (!user) error(401, "User session required for provider resolution");

	return runWithCache(async () => {
		const approvalResponse = findToolApprovalResponse(payload.messages ?? []);
		if (approvalResponse) {
			const { requestContext } = await buildApprovalContext(user, cookies);
			const stream = await resumeAgentToolCall({
				approval: approvalResponse,
				requestContext,
				abortSignal: request.signal
			});
			return createUIMessageStreamResponse({ stream });
		}

		try {
			const params = await buildWorkflowParams(user, session, payload, cookies);
			const stream = await handleWorkflowStream({
				version: 'v6',
				mastra,
				workflowId: 'chatWorkflow',
				params,
				sendReasoning: true,
				sendSources: true
			});
			return createUIMessageStreamResponse({ stream });
		} catch (e) {
			if (e instanceof WorkspaceMismatchError) {
				return new Response(
					JSON.stringify({ error: 'WORKSPACE_MISMATCH', message: e.message }),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				);
			}
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('AbortError') || msg.includes('aborted')) {
				console.info('[api/chat] Stream aborted by client');
			} else {
				console.error(`[api/chat] Error starting workflow: ${msg}`);
			}
			throw e;
		}
	});
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

