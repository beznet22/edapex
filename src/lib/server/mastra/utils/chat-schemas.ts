/**
 * Zod schemas + z.infer types for the chat workflow.
 *
 * Centralised here so individual step files can import only the contracts
 * they need without re-defining the full envelope.
 *
 * Public exports:
 *   - `chatWorkflowInputSchema`  — what `/api/chat` POSTs into `handleWorkflowStream`
 *   - `chatWorkflowOutputSchema` — what the workflow returns
 *
 * Internal exports (re-used by step files):
 *   - `optionItemSchema`, `pendingSelectionSchema` — selectionGate suspend payload
 *   - `fileReferenceSchema`                       — input file refs
 *   - `fileStreamItemSchema`, `workflowEnvelopeSchema` — intra-workflow contracts
 *   - `WorkflowEnvelope`, `FileStreamItem`, `ChatWorkflowInput`, `ChatWorkflowOutput` — types
 */

import { z } from 'zod';

/** Step 4 `selectionGate` suspend payload — the option list shown to the user. */
export const optionItemSchema = z.object({
	id: z.string(),
	label: z.string(),
	icon: z.string().optional()
});

/** Step 4 `selectionGate` resume schema — what the user picked. */
export const pendingSelectionSchema = z.object({
	options: z.array(optionItemSchema),
	prompt: z.string(),
	contextKey: z.string()
});

/** File reference passed in via `chatWorkflowInput.fileReferences`. */
export const fileReferenceSchema = z.object({
	toolCallId: z.string().optional(),
	fileId: z.string().optional(),
	contentHash: z.string().optional(),
	key: z.string().optional(),
	name: z.string().optional(),
	type: z.enum(['file', 'dir']).optional(),
	size: z.number().optional(),
	mimeType: z.string().optional()
});

/**
 * Public workflow input. Posted by `/api/chat` as the `inputData` of
 * `handleWorkflowStream({ params: { inputData: ChatWorkflowInput } })`.
 */
export const chatWorkflowInputSchema = z.object({
	threadId: z.string(),
	resourceId: z.string(),
	promptText: z.string(),
	fileReferences: z.array(fileReferenceSchema).default([]),
	// Carried through to the agent step; not validated by the workflow.
	requestContext: z.unknown().optional(),
	abortSignal: z.unknown().optional()
});

/** Per-file status carried through the `classifyAndStream` sub-workflow. */
export const fileStreamItemSchema = z.object({
	toolCallId: z.string(),
	fileId: z.string().optional(),
	contentHash: z.string().optional(),
	fileName: z.string(),
	status: z.enum(['streaming', 'complete', 'error']),
	content: z.string().optional(),
	error: z.string().optional(),
	correctedContent: z.string().optional()
});

/**
 * Envelope shape shared by `collapse`, `hitlVerify`, and `assistant` steps.
 * Combines the workflow input with the resolved file items.
 */
export const workflowEnvelopeSchema = z.object({
	threadId: z.string(),
	resourceId: z.string(),
	promptText: z.string(),
	requestContext: z.unknown().optional(),
	abortSignal: z.unknown().optional(),
	fileItems: z.array(fileStreamItemSchema)
});

/** Public workflow output. Returned via `createUIMessageStreamResponse`. */
export const chatWorkflowOutputSchema = z.object({
	text: z.string(),
	resolvedFiles: z.array(fileStreamItemSchema).default([])
});

export type WorkflowEnvelope = z.infer<typeof workflowEnvelopeSchema>;
export type FileStreamItem = z.infer<typeof fileStreamItemSchema>;
export type ChatWorkflowInput = z.infer<typeof chatWorkflowInputSchema>;
export type ChatWorkflowOutput = z.infer<typeof chatWorkflowOutputSchema>;

