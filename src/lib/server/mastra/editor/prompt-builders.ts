/**
 * Editor Prompt Builders — EdApex
 *
 * Builds structured prompts for the edit and generate agents.
 * Operates on plain markdown strings with selection injection via utils.
 *
 * The prompt structure uses XML tags (<context>, <backgroundData>, <Selection>, <rules>, <history>)
 * following the pattern established in the basic-ai-editor reference implementation.
 */
import type { DerivedEditorCommandRequest } from './schemas';
import {
	buildStructuredPrompt,
	formatTextFromMessages,
	injectSelectionMarkers,
} from './utils';

/**
 * Prepares the backgroundData string for the prompt by injecting <Selection> tags
 * around the selected text when present. Centralizes the selection-vs-no-selection
 * branching so the generate and edit builders stay symmetric.
 */
function prepareBackgroundData(
	markdown: string,
	selectedText: string | undefined
): string {
	if (!selectedText) return markdown;
	return injectSelectionMarkers(markdown, selectedText);
}

/**
 * Builds a prompt for the generate agent.
 */
export function buildGeneratePrompt(request: DerivedEditorCommandRequest): string {
	const { ctx, hasSelection, messages } = request;
	const { markdown, selectedText } = ctx;

	const backgroundData = prepareBackgroundData(markdown, hasSelection ? selectedText : undefined);

	return buildStructuredPrompt({
		backgroundData,
		examples: [
			'USER: Summarize the selected text. -> Return a concise summary.',
			'USER: Explain this paragraph. -> Return a plain-language explanation.',
			'USER: Continue writing. -> Return the next fitting markdown content only.',
		],
		history: formatTextFromMessages(messages),
		rules: [
			'- Use the background data as the source of truth.',
			'- If <Selection> is present, prioritize it.',
			'- Return markdown only.',
			'- Do not wrap the result in code fences.',
			'- Do not add explanations before or after the result.',
		].join('\n'),
		task: [
			'You are an AI writing assistant inside a rich-text editor.',
			'Generate the result requested in the latest user message using the background data.',
		].join('\n'),
	});
}

/**
 * Builds a prompt for the edit agent.
 *
 * The selected text is wrapped in <Selection> tags within the full markdown context.
 * For single-block edits, a "prefilled response" is provided — the text before the
 * selection — to guide the agent toward a natural continuation.
 */
export function buildEditPrompt(request: DerivedEditorCommandRequest): string {
	const { ctx, messages } = request;
	const { markdown, selectedText } = ctx;

	if (!selectedText) {
		return buildStructuredPrompt({
			backgroundData: markdown,
			history: formatTextFromMessages(messages),
			outputFormatting: 'markdown',
			rules: [
				'- Return only the replacement content.',
				'- Preserve overall markdown structure unless the user asks to change it.',
				'- Do not include commentary.',
				'- Do not include code fences.',
			].join('\n'),
			task: "Edit the selected markdown content according to the user's request.",
		});
	}

	const backgroundData = injectSelectionMarkers(markdown, selectedText);
	const isMultiBlocks = selectedText.includes('\n');

	if (isMultiBlocks) {
		return buildStructuredPrompt({
			backgroundData,
			history: formatTextFromMessages(messages),
			outputFormatting: 'markdown',
			rules: [
				'- Return only the replacement content.',
				'- Preserve overall markdown structure unless the user asks to change it.',
				'- Do not include commentary.',
				'- Do not include code fences.',
				'- Only modify text inside <Selection>.',
				'- Do not include the <Selection> tags in your output.',
			].join('\n'),
			task: "Edit the selected markdown content according to the user's request.",
		});
	}

	const selectionIndex = backgroundData.indexOf('<Selection>');
	const prefilledResponse = selectionIndex > 0
		? backgroundData.slice(0, selectionIndex)
		: undefined;

	return buildStructuredPrompt({
		backgroundData,
		history: formatTextFromMessages(messages),
		outputFormatting: 'markdown',
		prefilledResponse,
		rules: [
			'- Only modify text inside <Selection>.',
			'- Return only the replacement text for <Selection>.',
			'- Keep the output natural and grammatically correct.',
			'- Do not include the <Selection> tags in your output.',
		].join('\n'),
		task: [
			'The background data contains a selected fragment marked with <Selection>.',
			"Rewrite only that fragment based on the user's request.",
		].join('\n'),
	});
}
