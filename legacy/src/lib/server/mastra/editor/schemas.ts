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

export const editorToolNameSchema = z.enum([
	'improve',
	'fix',
	'shorter',
	'longer',
	'continue',
	'edit',
	'generate',
]);

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
 * A single mention resolved from the markdown.
 */
export const resolvedMentionSchema = z.object({
	category: z.string(),
	id: z.union([z.number(), z.string()]),
	/**
	 * Populated for `students` mentions only — the admissionNo embedded
	 * in the markdown as `{{studentName:<fullName>|student:<id>|
	 * admissionNo:<num>}}` so downstream workflow steps can link the
	 * document to the sm_students row. admissionNo is the raw DB column
	 * value (a number) — no `Adm#` prefix.
	 */
	admissionNo: z.string().optional(),
	/**
	 * Populated for `students` mentions — the human-readable student name
	 * embedded in the markdown as `{{studentName:<fullName>|...}}`. The
	 * resolver prefers the DB row's fullName but falls back to this
	 * embedded value when the DB lookup is skipped.
	 */
	studentName: z.string().optional(),
	label: z.string(),
});

/**
 * Markdown with all @mentions resolved against tenant data, plus the
 * list of mentions that were resolved.
 */
export const resolvedMentionsSchema = derivedEditorCommandSchema.extend({
	resolvedMarkdown: z.string(),
	mentions: z.array(resolvedMentionSchema),
});

/**
 * Resolved command after prompt building.
 */
export const resolvedEditorCommandSchema = resolvedMentionsSchema.extend({
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
 * Cursor semantic position relative to the surrounding text. Used by the
 * editor's copilot and AI command workflows to choose context-aware system
 * prompts.
 */
export const editorCursorPositionSchema = z.enum([
	'paragraph-start',
	'sentence-mid',
	'sentence-end',
	'paragraph-end',
]);

export type EditorCursorPosition = z.infer<typeof editorCursorPositionSchema>;

/**
 * Context payload sent from the Tiptap frontend alongside copilot
 * requests. The workflow uses these fields to build richer system prompts
 * (e.g. "You are continuing a marksheet for student: Adakole Yusuf…").
 */
export const editorCopilotContextSchema = z.object({
	cursorText: z.string(),
	documentTitle: z.string().optional(),
	documentHeaders: z.array(z.string()).optional(),
	studentName: z.string().optional(),
	examType: z.string().optional(),
	subject: z.string().optional(),
	recentEdits: z.array(z.string()).optional(),
	cursorPosition: editorCursorPositionSchema,
});

export type EditorCopilotContext = z.infer<typeof editorCopilotContextSchema>;

/**
 * Request payload for the /api/ai/editor/copilot endpoint.
 */
export const copilotRequestSchema = z.object({
	model: z.string().optional(),
	prompt: z.string(),
	system: z.string().optional(),
	context: editorCopilotContextSchema.optional(),
});

export type EditorContext = z.infer<typeof editorContextSchema>;
export type EditorCommandRequest = z.infer<typeof editorCommandRequestSchema>;
export type DerivedEditorCommandRequest = z.infer<typeof derivedEditorCommandSchema>;
export type ResolvedMention = z.infer<typeof resolvedMentionSchema>;
export type ResolvedMentions = z.infer<typeof resolvedMentionsSchema>;
export type ResolvedEditorCommand = z.infer<typeof resolvedEditorCommandSchema>;
export type CopilotRequest = z.infer<typeof copilotRequestSchema>;
export type EditorToolName = z.infer<typeof editorToolNameSchema>;
