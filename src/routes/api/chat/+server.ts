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
import { randomUUID } from "node:crypto";
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
	withAcademicId,
	withExamTypeId,
	WorkspaceMismatchError
} from "$lib/server/mastra/tenant-context";
import { resolveActiveClassScope } from "$lib/server/helpers/class-scope";
import { getDatabase } from "$lib/server/db";
import { BaseRepository } from "$lib/server/repository/base.repo";
import type { ClassSection } from "$lib/types/result-types";
import { processMentions, type MentionTag } from "$lib/server/mastra/mention-processor";
import { TenantContextCache } from "$lib/server/mastra/context-cache";
import type { FileReference } from "$lib/server/mastra/file-context";
import { mastra } from "$lib/server/mastra";
import { buildRequestContext, resolveThread, resolveWorkspaceContext } from "$lib/server/helpers/chat-helper";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { warmUpFileReferences } from "$lib/server/mastra/file-reference-warmup";
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

	let { threadId, messages, selectedClass: bodySelectedClass, fileReferences, mentions, runId: bodyRunId, step: bodyStep, resumeData: bodyResumeData }: {
		threadId: string;
		messages: xUIMessage[];
		selectedClass?: ClassSection;
		fileReferences?: FileReference[];
		mentions?: MentionTag[];
		runId?: string;
		step?: string;
		resumeData?: Record<string, any>;
	} = await request.json();

	if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
	if (!user) error(401, "User session required for provider resolution");

	// Workspace scoping is sourced from the SESSION cookie (authoritative),
	// not the request body. class-selector.svelte is the SOLE UI for class
	// selection and syncs into the selected-class cookie. Trusting the
	// cookie here (instead of body selectedClass, which can be stale from
	// a cached ChatComposer) guarantees the chat route and the upload
	// endpoint write to the same workspace the workflow will read from.
	const cookieClass = cookies.get("selected-class");
	let selectedClass: ClassSection | undefined = bodySelectedClass;
	if (cookieClass) {
		try {
			// Cookie shape: { id, classId, className, sectionId, sectionName }
			// `id` is the ClassSection row id; `classId` is the actual
			// class id. Workspace scoping must use `classId` — using `id`
			// collides across different class-section pairings of the
			// same class.
			const parsed = JSON.parse(cookieClass) as {
				id?: number;
				classId?: number;
				sectionId?: number;
				className?: string;
				sectionName?: string;
			};
			const effectiveClassId = parsed.classId ?? parsed.id;
			if (typeof effectiveClassId === "number") {
				selectedClass = {
					id: parsed.id ?? effectiveClassId,
					classId: parsed.classId,  // KEEP classId — without this the
					//                          chat route falls back to .id (= 100)
					sectionId: typeof parsed.sectionId === "number" ? parsed.sectionId : 0,
					className: parsed.className ?? bodySelectedClass?.className ?? "",
					sectionName: parsed.sectionName ?? bodySelectedClass?.sectionName ?? ""
				} as ClassSection;
			}
		} catch {
			// ignore parse error, fall back to body
		}
	}

	const selectedChatModel = cookies.get("selected-model") ?? "";
	if (selectedChatModel === 'auto' || selectedChatModel === 'deep-reasoning') {
		error(400, "Invalid model selection");
	}
	// Empty cookie is OK — chat-helper will auto-pick from platform defaults.

	const resourceId = `user-${user.id}`;

	// ─── Build Tenant Context ─────────────────────────────────────────────────

	// Use the SINGLE SOURCE OF TRUTH helper that builds the workspace
	// tenant context. It reads the selected-class cookie, fetches the
	// active academic year + current term from DB, and returns a fully-
	// populated context (className/sectionName/academicYearTitle all set).
	// This is the only place workspace scoping is computed for the chat
	// route — the helper is also used by /api/uploads so both endpoints
	// ALWAYS agree on the same workspace path.
	const { tenant: tenantContext } = await resolveWorkspaceContext(cookies, {
		id: user.id,
		schoolId: user.schoolId ?? null,
		staffId: (user as any).staffId ?? null,
		designationId: (user as any).designationId ?? null,
		roleId: (user as any).roleId ?? null
	});
	// Override classId/sectionId with the body's selectedClass IF the
	// cookie was missing AND the body has them (legacy form-data fallback).
	if (tenantContext.classId === null && selectedClass) {
		(tenantContext as { classId: number | null }).classId =
			(selectedClass as { classId?: number } | undefined)?.classId
			?? (selectedClass as { id?: number } | undefined)?.id ?? null;
	}
	if (tenantContext.sectionId === null && selectedClass) {
		(tenantContext as { sectionId: number | null }).sectionId =
			selectedClass?.sectionId ?? null;
	}

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

	if (activeContext.academicId === null) {
		const db = await getDatabase();
		const baseRepo = await BaseRepository.build(db, activeContext);
		const academicId = await baseRepo.getAcademicId();
		activeContext = withAcademicId(activeContext, academicId);
	}

	if (
		activeContext.classId === null &&
		activeContext.sectionId === null &&
		(user as { staffId?: number }).staffId
	) {
		const resolved = await resolveActiveClassScope({
			schoolId: activeContext.schoolId,
			staffId: (user as { staffId?: number }).staffId
		});
		if (resolved) {
			activeContext = Object.freeze({
				...activeContext,
				classId: resolved.classId,
				sectionId: resolved.sectionId
			});
		}
	}

	if (!bodyRunId && fileReferences && fileReferences.length > 0) {
		try {
			fileReferences = await warmUpFileReferences(activeContext, fileReferences);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[api/chat] File reference warm-up failed: ${msg}`);
		}
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

	const runId = bodyRunId ?? randomUUID();

	let stream;
	try {
		const params: ChatWorkflowParams = {
			runId,
			...(bodyResumeData ? { resumeData: bodyResumeData } : {}),
			...(bodyStep ? { step: bodyStep } : {}),
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

	const wrappedStream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({
				type: 'data-runInfo',
				id: `ri-${runId}`,
				data: { runId }
			} as never);
			for await (const part of stream) {
				writer.write(part);
			}
		}
	});

	return createUIMessageStreamResponse({ stream: wrappedStream });
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
