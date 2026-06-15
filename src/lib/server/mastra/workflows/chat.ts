/**
 * Chat Workflow — EdApex
 *
 * Drives the per-file OCR streaming + assistant text generation flow:
 *
 *  Main chain:
 *    1. `.parallel([classifyAndStreamWorkflow, titleStep])` — file processing
 *       and title generation run concurrently. The parallel emits a record
 *       keyed by step ID, which `extractFileItemsStep` flattens to the
 *       `FileStreamItem[]` array that downstream steps expect.
 *    2. `classifyAndStreamWorkflow` (sub-workflow):
 *         a. `classifyStep`        — collapses file references into stream items
 *         b. `streamDocumentStep`  — runs in `.foreach(concurrency: 4)`;
 *            resolves each file's markdown from the OCR working-memory cache
 *            and emits `data-createDocument` parts to the chat stream
 *            (append-only `content` chunks, statuses `processing` → `streaming`
 *            → `success` | `error`)
 *    3. `titleStep`               — generates the thread title from the
 *            user's first prompt and emits `data-threadCreated` to the stream
 *    4. `collapseStep`            — re-attaches the stream items to the
 *            workflow envelope (threadId, resourceId, prompt, …)
 *    5. `hitlVerifyStep`          — optional human-in-the-loop pass-through;
 *            the workspace editor's "Verify & Correct" button calls
 *            `/api/chat/resume` which feeds `resumeData` back into this step
 *            to inject user corrections
 *    6. `assistantStep`           — pipes the assistant agent's stream into
 *            the workflow's writer, preserving working-memory persistence
 *            via the static `assistant` agent
 *
 * Workflow-level `retryConfig` (attempts: 2, delay: 1000) handles transient
 * pipeline failures. Each `streamDocumentStep` iteration carries `retries: 3`
 * for cache-read flakes; the per-iteration `try/catch` returns a soft error
 * (status: `'error'`) so a single bad file never tears down the batch.
 */
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
	APICallError,
	NoSuchModelError,
	LoadAPIKeyError,
	InvalidPromptError,
	NoContentGeneratedError
} from '@ai-sdk/provider';
import {
	NoCredentialError,
	ProviderDisabledError,
	ModelNotFoundError,
	NoProvidersError
} from '$lib/provider/errors';
import { categorizeAIError } from '$lib/errors/friendly-ai-error';
import { mastra } from '../index';
import { streamWithAutoRetry } from '../agent-stream-retry';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { generateThreadTitle, resolveThread } from '$lib/server/helpers/chat-helper';
import { DEFAULT_TITLE_MODEL } from '../agents/shared';
import type { TenantContext } from '../tenant-context';

interface FriendlyError {
	message: string;
	action?: { label: string; href: string };
	retryable: boolean;
	variant: 'info' | 'warning' | 'error';
}

function parseApiCallError(err: APICallError): FriendlyError {
	const code = err.statusCode ?? 0;
	const upstream = (err.data as { error?: { message?: string } } | undefined)?.error?.message;
	if (code === 401 || code === 403) {
		return {
			message: `Authentication failed (HTTP ${code}). Check that the API key is valid and has access to the model.`,
			action: { label: 'Manage API keys', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (code === 404) {
		return {
			message: 'Model not found on provider (HTTP 404). The provider may have renamed or removed the model.',
			retryable: false,
			variant: 'error'
		};
	}
	if (code === 429) {
		return {
			message: 'Rate limit reached. Please wait a moment and try again.',
			retryable: true,
			variant: 'warning'
		};
	}
	if (code >= 500) {
		return {
			message: 'The AI service is currently unavailable. Please try again in a moment.',
			retryable: true,
			variant: 'warning'
		};
	}
	if (err.isRetryable) {
		return {
			message: upstream || 'A temporary error occurred. Please try again.',
			retryable: true,
			variant: 'warning'
		};
	}
	return {
		message: upstream || err.message || 'Request was rejected by the API.',
		retryable: false,
		variant: 'error'
	};
}

function parseFallback(err: unknown): FriendlyError {
	const msg = err instanceof Error ? err.message : String(err);
	if (msg.includes('File not found') || msg.includes('No OCR metadata')) {
		return { message: 'Could not read the file content. The file may still be processing.', retryable: false, variant: 'error' };
	}
	if (msg.includes('missing field') || msg.includes('Failed to deserialize')) {
		return { message: 'A data formatting issue occurred. Please try again or start a new conversation.', retryable: true, variant: 'warning' };
	}
	if (msg.includes('AbortError') || msg.includes('aborted')) {
		return { message: 'Request cancelled.', retryable: false, variant: 'info' };
	}
	const truncated = msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
	return { message: truncated, retryable: false, variant: 'error' };
}

function parseFriendlyError(err: unknown): FriendlyError {
	if (err instanceof NoCredentialError) {
		return {
			message: `No API key is configured for "${err.providerId}". Connect this provider in Settings → Providers.`,
			action: { label: 'Open Settings', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (err instanceof ProviderDisabledError) {
		return {
			message: `The "${err.providerId}" provider is disabled. Re-enable it in Settings → Providers.`,
			action: { label: 'Open Settings', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (err instanceof ModelNotFoundError) {
		return {
			message: `Model "${err.modelId}" wasn't found on "${err.providerId}". Try a different model from the selector.`,
			retryable: false,
			variant: 'error'
		};
	}
	if (err instanceof NoProvidersError) {
		return {
			message: 'No providers configured. Add at least one provider in Settings → Providers.',
			action: { label: 'Open Settings', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (APICallError.isInstance(err)) {
		return parseApiCallError(err);
	}
	if (NoSuchModelError.isInstance(err)) {
		return {
			message: 'The selected model is not available. Try a different model from the selector.',
			retryable: false,
			variant: 'error'
		};
	}
	if (LoadAPIKeyError.isInstance(err)) {
		return {
			message: 'The platform default model has no API key configured. Contact your administrator.',
			retryable: false,
			variant: 'error'
		};
	}
	if (InvalidPromptError.isInstance(err)) {
		return {
			message: 'Your message could not be sent. Please try a different prompt.',
			retryable: false,
			variant: 'warning'
		};
	}
	if (NoContentGeneratedError.isInstance(err)) {
		return {
			message: 'The model did not generate a response. This is usually a temporary issue — try again.',
			retryable: true,
			variant: 'warning'
		};
	}
	return parseFallback(err);
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const fileReferenceSchema = z.object({
	toolCallId: z.string().optional(),
	fileId: z.string().optional(),
	contentHash: z.string().optional(),
	key: z.string().optional(),
	name: z.string().optional(),
	type: z.enum(['file', 'dir']).optional(),
	size: z.number().optional(),
	mimeType: z.string().optional()
});

export const chatWorkflowInputSchema = z.object({
	threadId: z.string(),
	resourceId: z.string(),
	promptText: z.string(),
	fileReferences: z.array(fileReferenceSchema).default([]),
	// Carried through to the agent step; not validated by the workflow.
	requestContext: z.unknown().optional(),
	abortSignal: z.unknown().optional()
});

const fileStreamItemSchema = z.object({
	toolCallId: z.string(),
	fileId: z.string().optional(),
	contentHash: z.string().optional(),
	fileName: z.string(),
	status: z.enum(['streaming', 'complete', 'error']),
	content: z.string().optional(),
	error: z.string().optional(),
	correctedContent: z.string().optional()
});

const workflowEnvelopeSchema = z.object({
	threadId: z.string(),
	resourceId: z.string(),
	promptText: z.string(),
	requestContext: z.unknown().optional(),
	abortSignal: z.unknown().optional(),
	fileItems: z.array(fileStreamItemSchema)
});

export const chatWorkflowOutputSchema = z.object({
	text: z.string(),
	resolvedFiles: z.array(fileStreamItemSchema).default([])
});

type WorkflowEnvelope = z.infer<typeof workflowEnvelopeSchema>;
type FileStreamItem = z.infer<typeof fileStreamItemSchema>;

// ─── Step 1: classify ───────────────────────────────────────────────────────

const classifyStep = createStep({
	id: 'classify',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: z.array(fileStreamItemSchema),
	execute: async ({ inputData }) => {
		console.log("CLASSIFY HIT");
		if (inputData.fileReferences.length === 0) {
			return [];
		}

		const fileItems: FileStreamItem[] = inputData.fileReferences.map((ref) => {
			const idSeed =
				ref.toolCallId ?? ref.fileId ?? ref.key ?? ref.contentHash ?? Math.random().toString(36).slice(2);
			return {
				toolCallId: ref.toolCallId ?? `doc-${idSeed}`,
				fileId: ref.fileId ?? ref.key,
				contentHash: ref.contentHash,
				fileName: ref.name ?? ref.fileId ?? ref.key ?? 'document',
				status: 'streaming' as const
			};
		});

		return fileItems;
	}
});

// ─── Step 2: per-file validate (foreach) ────────────────────────────────────

const streamDocumentStep = createStep({
	id: 'stream-document',
	inputSchema: fileStreamItemSchema,
	outputSchema: fileStreamItemSchema,
	retries: 3,
	execute: async ({ inputData, requestContext, writer, mastra: m }) => {
		console.log("STREAMING HIT");
		const ctx = (requestContext as { get?: (k: string) => unknown } | undefined)?.get?.('tenantContext') as
			| TenantContext
			| undefined;
		if (!ctx) {
			return {
				...inputData,
				status: 'error' as const,
				error: 'No tenant context resolved from request context'
			};
		}
		if (!writer) {
			return {
				...inputData,
				status: 'error' as const,
				error: 'No workflow writer available for streaming'
			};
		}

		try {
			let contentHash = inputData.contentHash;
			if (!contentHash && inputData.fileId) {
				const meta = await OcrWorkspaceStore.getByFileId({
					tenant: ctx,
					mistralFileId: inputData.fileId
				});
				if (!meta) {
					throw new Error(`No OCR metadata for fileId ${inputData.fileId}`);
				}
				contentHash = meta.contentHash;
			}
			if (!contentHash) {
				throw new Error('Missing contentHash and fileId for stream lookup');
			}

			const markdown = await OcrWorkspaceStore.readMarkdown({
				tenant: ctx,
				contentHash
			});

			const id = `doc-${inputData.toolCallId}`;

			await writer.write({
				type: 'data-createDocument',
				id,
				data: { status: 'processing', content: '', title: inputData.fileName }
			} as never);

			// Stream through the document formatting agent instead of raw 4KB chunks.
			// The agent transforms raw OCR text into clean, well-structured markdown
			// and streams it token-by-token for a smooth progressive-reveal UX.
			const agent = m?.getAgent('document');
			if (!agent) {
				throw new Error('Document agent not registered on Mastra instance');
			}

			const stream = await streamWithAutoRetry({
				stream: () =>
					agent.stream(
						`Transform the following raw document titled "${inputData.fileName}" into clean, well-structured markdown. Preserve all factual content. Fix OCR artifacts. Use proper headings, lists, and formatting.\n\n${markdown}`
					),
				abortSignal: undefined,
				writer
			});

			const reader = stream.textStream.getReader();
			let content = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				content += value;
				await writer.write({
					type: 'data-createDocument',
					id,
					data: { status: 'streaming', content, title: inputData.fileName }
				} as never);
			}

			await writer.write({
				type: 'data-createDocument',
				id,
				data: { status: 'success', content, title: inputData.fileName }
			} as never);

			return {
				...inputData,
				status: 'complete' as const,
				content: ''
			};
		} catch (err) {
			const friendly = parseFriendlyError(err);
			const message = friendly.message;
			// Also emit the error to the stream so the document card shows it
			try {
				const id = `doc-${inputData.toolCallId}`;
				await writer.write({
					type: 'data-createDocument',
					id,
					data: { status: 'error', content: '', title: inputData.fileName, error: message }
				} as never);
			} catch {
				// writer may already be closed
			}
			return {
				...inputData,
				status: 'error' as const,
				error: message
			};
		}
	}
});

// ─── Step 3: collapse foreach output back into envelope ─────────────────────

const collapseStep = createStep({
	id: 'collapse-stream-results',
	inputSchema: z.array(fileStreamItemSchema),
	outputSchema: workflowEnvelopeSchema,
	execute: async ({ inputData, getInitData }) => {
		console.log("COLLAPSE HIT");
		const initial = getInitData() as z.infer<typeof chatWorkflowInputSchema>;
		return {
			threadId: initial.threadId,
			resourceId: initial.resourceId,
			promptText: initial.promptText,
			requestContext: initial.requestContext,
			abortSignal: initial.abortSignal,
			fileItems: inputData
		};
	}
});

// ─── Step 4: optional HITL ──────────────────────────────────────────────────

const hitlVerifyStep = createStep({
	id: 'hitl-verify',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: workflowEnvelopeSchema,
	resumeSchema: z.object({
		approved: z.boolean(),
		corrections: z
			.array(
				z.object({
					toolCallId: z.string(),
					correctedContent: z.string()
				})
			)
			.optional()
	}),
	suspendSchema: z.object({
		reason: z.string(),
		fileIds: z.array(z.string())
	}),
	execute: async ({ inputData, resumeData }) => {
		console.log("HITL HIT");
		// No files: nothing to verify, just pass through.
		if (inputData.fileItems.length === 0) {
			return inputData;
		}

		// First-run (no resumeData): HITL is opt-in. Pass through.
		if (!resumeData) {
			return inputData;
		}

		// User rejected verification: keep original content.
		if (resumeData.approved === false) {
			return inputData;
		}

		// User approved and provided corrections: apply per-file.
		if (resumeData.corrections && resumeData.corrections.length > 0) {
			const updated = inputData.fileItems.map((item) => {
				const correction = resumeData.corrections!.find(
					(c) => c.toolCallId === item.toolCallId
				);
				if (correction) {
					return {
						...item,
						correctedContent: correction.correctedContent,
						content: correction.correctedContent
					};
				}
				return item;
			});
			return { ...inputData, fileItems: updated };
		}

		// Approved without corrections: pass through unchanged.
		return inputData;
	}
});

// ─── Step 5: assistant agent ────────────────────────────────────────────────

const assistantStep = createStep({
	id: 'assistant',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: chatWorkflowOutputSchema,
	execute: async ({ inputData, mastra: m, requestContext, writer, abortSignal }) => {
		console.log("ASSISTANT HIT");
		const agent = m?.getAgent('assistant');
		if (!agent) {
			throw new Error('Assistant agent not registered on Mastra instance');
		}

		console.log("fileItems", inputData.fileItems);

		if (inputData.fileItems.length > 0) {
			const manifestText = inputData.fileItems
				.map((f) => {
					if ('error' in f) {
						return `- ${f.fileName} (ID: ${f.fileId}) — Error: ${f.error}`;
					}
					return `- ${f.fileName} (ID: ${f.fileId})`;
				})
				.join('\n');
			requestContext?.set('fileManifest', manifestText);
		}

		// Resolve (get or create) thread — emits data-new-thread-created if new
		const assistant = m?.getAgent('assistant');
		const memory = assistant ? await assistant.getMemory() : undefined;
		let stream;
		try {
			stream = await streamWithAutoRetry({
				stream: () =>
					agent.stream(inputData.promptText, {
						...(abortSignal ? { abortSignal: abortSignal } : {}),
						...(requestContext ? { requestContext: requestContext } : {}),
						// Variant options (e.g. `{ deepseek: { thinking, reasoningEffort } }`)
						// from the V2 resolver flow through `requestContext.providerOptions`.
						// Passing them at the stream call makes the thinking-mode toggles
						// actually take effect on the upstream (was a UI-only label
						// before the V2 refactor). The cast widens the inner value
						// type from `unknown` to `JSONValue`; in practice the resolver
						// only puts JSON-serializable values into providerOptions.
						...(requestContext?.get('providerOptions')
							? { providerOptions: requestContext.get('providerOptions') as Record<string, Record<string, unknown>> as never }
							: {}),
						memory: {
							thread: inputData.threadId,
							resource: inputData.resourceId
						},
						maxSteps: 30,
						onError: ({ error }) => {
							const msg = error instanceof Error ? error.message : String(error);
							if (msg.includes('AbortError') || msg.includes('aborted')) {
								console.info('[api/chat] Generation stopped.');
								return;
							}
							console.error(`[api/chat] Error: ${msg}`);
						},
						onFinish: ({ usage }) => {
							// Emit a data-usage stream part carrying the final usage for
							// this step. The chat-context accumulates these end-of-message
							// totals and the ContextUsageIndicator renders the cumulative
							// value against the model's context window.
							const simple = {
								inputTokens: usage.inputTokens ?? 0,
								outputTokens: usage.outputTokens ?? 0,
								reasoningTokens: usage.reasoningTokens ?? 0,
								cachedInputTokens: usage.cachedInputTokens ?? 0
							};
							writer
								.write({
									type: 'data-usage',
									id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
									data: simple
								} as never)
								.catch(() => {
									// writer may already be closed
								});
						}
					}),
				abortSignal,
				writer
			});
		} catch (err) {
			const friendly = parseFriendlyError(err);
			const friendlyMsg = friendly.message;
			console.error(`[api/chat] Agent stream failed: ${friendlyMsg}`);
			// Emit a structured data-error part alongside the human-readable
			// text-delta so the client-side ErrorAlert can render the right
			// action button (regenerate / clear_context / open_settings).
			const categorized = categorizeAIError(err);
			const errorPart = writer
				.write({
					type: 'data-error',
					id: `err-${Date.now()}`,
					data: categorized
				} as never)
				.catch(() => {
					// writer may already be closed
				});
			void errorPart;
			const fallbackStream = new ReadableStream({
				start(controller) {
					controller.enqueue({ type: 'text-delta', text: `⚠️ ${friendlyMsg}` });
					controller.enqueue({
						type: 'finish',
						finishReason: 'error',
						usage: { inputTokens: 0, outputTokens: 0 }
					});
					controller.close();
				}
			});
			await fallbackStream.pipeTo(writer);
			return {
				text: friendlyMsg,
				resolvedFiles: inputData.fileItems
			};
		}

		await stream.fullStream.pipeTo(writer);
		return {
			text: await stream.text,
			resolvedFiles: inputData.fileItems
		};
	}
});

const titleStep = createStep({
	id: 'title',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: z.object({}),
	execute: async ({ inputData, writer, mastra: m }) => {
		console.log("TITLE HIT");

		const agent = m?.getAgent('assistant');
		const memory = agent ? await agent.getMemory() : undefined;
		try {
			await generateThreadTitle({
				resourceId: inputData.resourceId,
				memory,
				threadId: inputData.threadId,
				prompt: inputData.promptText,
				writer,
			});

		} catch (err) {
			console.error('Failed to generate thread title:', err);
		}

		return {};
	}
});

// ─── Sub-workflow: classify + per-file stream ────────────────────────────────

const classifyAndStreamWorkflow = createWorkflow({
	id: 'classify-and-stream',
	description: 'classifyStep → foreach(streamDocumentStep, concurrency: 4)',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: z.array(fileStreamItemSchema)
})
	.then(classifyStep)
	.foreach(streamDocumentStep, { concurrency: 4 })
	.commit();

// ─── Bridge step: extract array from parallel record ─────────────────────────

const extractFileItemsStep = createStep({
	id: 'extract-file-items',
	description: 'Flattens the `.parallel()` record into the array contract required by collapseStep',
	inputSchema: z.object({
		'classify-and-stream': z.array(fileStreamItemSchema),
		title: z.object({})
	}),
	outputSchema: z.array(fileStreamItemSchema),
	execute: async ({ inputData }) => inputData['classify-and-stream']
});

// ─── Workflow ───────────────────────────────────────────────────────────────

export const chatWorkflow = createWorkflow({
	id: 'chatWorkflow',
	description: 'Per-file OCR streaming + assistant text generation',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: chatWorkflowOutputSchema,
	retryConfig: {
		attempts: 2,
		delay: 1000
	},
	options: {
		onFinish: async (result) => {
			if (result.status === 'failed') {
				console.error('[chatWorkflow] failed', {
					runId: result.runId,
					workflowId: result.workflowId,
					error: result.error
				});
				return;
			}
			if (result.status === 'success') {
				console.info('[chatWorkflow] completed', {
					runId: result.runId,
					workflowId: result.workflowId,
					fileCount: result.result?.resolvedFiles?.length ?? 0,
					textLength: result.result?.text?.length ?? 0
				});
			}

			if (result.status === 'suspended') {
				console.info('[chatWorkflow] suspended', {
					runId: result.runId,
					workflowId: result.workflowId,
					reason: "Human In The Loop Verification Required",
				});
			}
		},
		onError: async (errorInfo) => {
			console.error('[chatWorkflow] error', {
				runId: errorInfo.runId,
				workflowId: errorInfo.workflowId,
				status: errorInfo.status,
				error: errorInfo.error
			});
		}
	}
})
	.parallel([classifyAndStreamWorkflow, titleStep])
	.then(extractFileItemsStep)
	.then(collapseStep)
	.then(hitlVerifyStep)
	.then(assistantStep)
	.commit();

/**
 * Sentinel export for the resume route — the resume endpoint keys its
 * `step:` argument off this id so the workflow ID and step ID stay in sync.
 */
export const HITL_VERIFY_STEP_ID = hitlVerifyStep.id as 'hitl-verify';
