/**
 * Format Agent — EdApex
 *
 * Formats raw OCR/text into clean marksheet markdown. Stateless — used
 * by the format-document API endpoint.
 */
import { Agent } from '@mastra/core/agent';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { buildDefaultModelForRole } from './shared';
import type { MastraModelConfig } from '@mastra/core/llm';

export const formatAgent = new Agent({
	id: 'format',
	name: 'Format Agent',
	description:
		'Formats raw OCR/text into clean marksheet markdown. Stateless — used by the format-document API endpoint.',
	instructions: `You are a marksheet formatting specialist.

1. MARKDOWN FORMATTING (raw text/OCR → clean markdown):
    - Preserve all factual content. Fix OCR artifacts.
    - Use proper markdown headings, lists, tables, emphasis.
    - Keep original language. Output ONLY formatted markdown — no explanations or commentary.
    - **@mention spans for resolved entities:** For Full Name, Admission No, Term, Academic Year, Class, and Section in Student Information, use the context blocks (CLASS ROSTER, examTypeTitle, academicYearTitle, classId/sectionId) to emit <span data-type="mention" data-id="..." data-category="..." ...>@TEXT</span>. Categories: students, exam, academic_year, class, section. Admission No uses students category (same studentId + admissionNo). These @mentions replace the raw values so the validation layer can resolve them back to IDs.

Always respect the caller's requested output format — clean markdown only, no JSON.`,
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		const modelId = requestContext?.get('modelId') as string | undefined;
		if (modelId) return modelId;
		return buildDefaultModelForRole('formatter');
	},
	errorProcessors: [new StreamErrorRetryProcessor()]
});
