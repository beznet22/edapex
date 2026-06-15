/**
 * Document Formatting Agent — EdApex
 *
 * Transforms raw OCR output into clean, well-structured, readable markdown.
 * Stateless agent — no memory, no tools. Used in streamDocumentStep to
 * replace the raw 4KB chunk approach with token-by-token streaming.
 */
import { Agent } from '@mastra/core/agent';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { DEFAULT_MODEL } from './shared';

export const documentAgent = new Agent({
	id: 'document',
	name: 'Document Formatting Agent',
	description:
		'Transforms raw OCR output and input text into clean, well-structured, readable markdown.',
	instructions: `You are a document formatting specialist. Your role is to transform raw OCR output and other input text into clean, well-structured, readable markdown.

RULES:
- Preserve all factual content — never invent or omit information
- Fix OCR artifacts (misrecognized characters, merged words, broken sentences)
- Use proper markdown headings (# ## ###), lists, tables, and emphasis where appropriate
- Ensure consistent spacing and paragraph breaks
- Keep the original language and terminology intact
- Output ONLY the formatted markdown, no explanations, commentary, or metadata`,
	model: DEFAULT_MODEL,
	errorProcessors: [new StreamErrorRetryProcessor()]
});
