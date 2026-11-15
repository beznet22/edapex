/**
 * Defensively strips any leaked `<Selection>...</Selection>` and adjacent
 * wrappers from streamed text. The raw chunks still stream to the client
 * untouched (so the WYSIWYG shows text as it arrives), but the workflow's
 * final `text` field is sanitized.
 */
export function stripLeakedSelection(text: string): string {
	return text
		.replace(/<\/?Selection>/g, '')
		.replace(/<\/?backgroundData>/g, '')
		.replace(/<\/?outputFormatting>/g, '')
		.replace(/<\/?prefilledResponse>/g, '')
		.replace(/<\/?context>/g, '')
		.trim();
}
