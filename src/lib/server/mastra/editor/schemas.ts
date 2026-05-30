/**
 * Editor Schemas — EdApex
 *
 * Zod schemas for editor AI command requests and responses.
 * Adapted from basic-ai-editor/mastra/editor/schemas.ts:
 * - Removed PlateJS types (Value, TRange, SlateEditor)
 * - Context now uses raw markdown string + optional selectedText string
 *   (extracted client-side from Tiptap via editor.state.doc.textBetween())
 */
import type { UIMessage } from 'ai';
import { z } from 'zod';

export const editorToolNameSchema = z.enum(['edit', 'generate']);

const uiMessageSchema = z.custom<UIMessage>();

/**
 * Editor context sent from the Tiptap frontend.
 * - `markdown`: Full document content as markdown (from tiptap-markdown storage)
 * - `selectedText`: The currently selected text fragment (if any)
 * - `toolName`: Explicit command override (nullable = auto-detect from selection)
 */
export const editorContextSchema = z.object({
	markdown: z.string(),
	selectedText: z.string().optional(),
	toolName: editorToolNameSchema.nullable().optional(),
});

/**
 * Top-level request payload for the /api/ai/editor/command endpoint.
 */
export const editorCommandRequestSchema = z.object({
	ctx: editorContextSchema,
	messages: z.array(uiMessageSchema).optional().default([]),
	model: z.string().optional(),
});

/**
 * Derived context after the first workflow step analyzes the request.
 */
export const derivedEditorCommandSchema = editorCommandRequestSchema.extend({
	hasSelection: z.boolean(),
	toolName: editorToolNameSchema,
});

/**
 * Resolved command after prompt building.
 */
export const resolvedEditorCommandSchema = derivedEditorCommandSchema.extend({
	prompt: z.string(),
});

/**
 * Result from either the edit or generate agent step.
 */
export const editorCommandResultSchema = z.object({
	branch: editorToolNameSchema,
	text: z.string(),
});

/**
 * Final workflow output — same shape as result.
 */
export const finalizedEditorCommandSchema = z.object({
	branch: editorToolNameSchema,
	text: z.string(),
});

/**
 * Request payload for the /api/ai/editor/copilot endpoint.
 */
export const copilotRequestSchema = z.object({
	model: z.string().optional(),
	prompt: z.string(),
	system: z.string().optional(),
});

export type EditorContext = z.infer<typeof editorContextSchema>;
export type EditorCommandRequest = z.infer<typeof editorCommandRequestSchema>;
export type DerivedEditorCommandRequest = z.infer<typeof derivedEditorCommandSchema>;
export type ResolvedEditorCommand = z.infer<typeof resolvedEditorCommandSchema>;
export type CopilotRequest = z.infer<typeof copilotRequestSchema>;
export type EditorToolName = z.infer<typeof editorToolNameSchema>;
