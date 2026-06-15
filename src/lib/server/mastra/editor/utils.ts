/**
 * Editor Utility Layer — EdApex
 *
 * Pure string helpers for building structured prompts for editor AI agents.
 * Ported from basic-ai-editor/mastra/editor/utils.ts with all PlateJS
 * dependencies removed. These functions operate on raw markdown strings
 * and AI SDK UIMessage objects — no Slate/ProseMirror types.
 */
import type { UIMessage } from 'ai';

const SELECTION_START = '<Selection>';
const SELECTION_END = '</Selection>';

export { SELECTION_START, SELECTION_END };

/**
 * Wraps content in an XML tag. Returns empty string if content is falsy.
 */
export const tag = (tagName: string, content?: string | null): string => {
	if (!content) return '';
	return [`<${tagName}>`, content, `</${tagName}>`].join('\n');
};

/**
 * Joins non-falsy sections with double newlines.
 */
export const sections = (items: (boolean | string | null | undefined)[]): string =>
	items.filter(Boolean).join('\n\n');

/**
 * Assembles a structured prompt from labeled sections using XML tags.
 *
 * This is the core prompt template used by both edit and generate prompt builders.
 * The structure follows the pattern:
 *   <context>
 *     <backgroundData>...</backgroundData>
 *     rules...
 *     <examples>...</examples>
 *     <history>...</history>
 *   </context>
 *   task...
 *   <outputFormatting>...</outputFormatting>
 *   <prefilledResponse>...</prefilledResponse>
 */
export const buildStructuredPrompt = ({
	backgroundData,
	examples,
	history,
	outputFormatting,
	prefilledResponse,
	rules,
	task,
}: {
	backgroundData?: string;
	examples?: string[];
	history?: string;
	outputFormatting?: string;
	prefilledResponse?: string;
	rules?: string;
	task?: string;
}): string => {
	const formattedExamples = examples?.map((example) => tag('example', example)).join('\n');

	const context = sections([
		backgroundData &&
			`Here is the background data you should reference:\n<backgroundData>\n  ${backgroundData}\n</backgroundData>`,
		rules && `Here are the rules:\n${rules}`,
		formattedExamples && `Here are examples:\n${tag('examples', formattedExamples)}`,
		history && `Here is the conversation history:\n${tag('history', history)}`,
	]);

	return sections([
		tag('context', context),
		task,
		outputFormatting && tag('outputFormatting', outputFormatting),
		prefilledResponse !== undefined && tag('prefilledResponse', prefilledResponse),
	]);
};

/**
 * Extracts plain text from a single UIMessage by concatenating its text parts.
 */
export function getTextFromMessage(message: UIMessage): string {
	return message.parts
		.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

/**
 * Formats an array of UIMessages into a labeled conversation history string.
 * Each message becomes `ROLE: text` on its own line.
 */
export function formatTextFromMessages(
	messages: UIMessage[] | undefined,
	options?: { limit?: number },
): string {
	if (!messages?.length) return '';

	const historyMessages = options?.limit ? messages.slice(-options.limit) : messages;

	return historyMessages
		.map((message) => {
			const text = getTextFromMessage(message).trim();
			if (!text) return null;
			return `${message.role.toUpperCase()}: ${text}`;
		})
		.filter(Boolean)
		.join('\n');
}

/**
 * Removes markdown image `![alt](url)` and HTML `<img>` references from the text,
 * preventing non-vision models from rejecting the request when the document
 * contains embedded image references.
 */
export function stripImageRefs(markdown: string): string {
	return markdown
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/<img[^>]*>/gi, '');
}

/**
 * Wraps `selectedText` in <Selection> tags within the full markdown document.
 * If the selectedText appears in the markdown, it's replaced with the tagged version.
 * If not found (edge case), the selection is appended at the end.
 */
export function injectSelectionMarkers(
	markdown: string,
	selectedText: string,
): string {
	if (!selectedText) return markdown;

	const markedSelection = `${SELECTION_START}${selectedText}${SELECTION_END}`;
	const index = markdown.indexOf(selectedText);

	if (index !== -1) {
		return (
			markdown.slice(0, index) +
			markedSelection +
			markdown.slice(index + selectedText.length)
		);
	}

	return `${markdown}\n\n${markedSelection}`;
}
