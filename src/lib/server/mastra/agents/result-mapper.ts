/**
 * Result Mapper Agent — EdApex Structured-Output Pipeline
 *
 * Reads OCR'd transcript markdown and emits a structured `ResultOutput`
 * JSON object that conforms to `$lib/schema/result-output`. This is the
 * missing piece in the `/generate` workflow (`workflows/generate.ts:80-90`),
 * which previously failed with `MISSING_AGENT` per the B12 audit.
 *
 * ## Model
 * Reads `modelId` from requestContext (per-request gateway-resolved model),
 * falling back to `DEFAULT_MODEL` from `agents/shared.ts`.
 *
 * ## Output
 * The `output` property binds the agent to `resultOutputSchema` so
 * `agent.generate()` returns `{ object, text }` where `object` is a
 * validated `ResultOutput`. The downstream Step in `generate.ts` reads
 * `response.object || JSON.parse(response.text)` as a safety net.
 *
 * ## Tenant Isolation
 * `tenantContext` from requestContext is injected into the instructions so
 * the model knows the active school boundary (schoolId, classId, sectionId,
 * examId). It is read-only here — no DB writes happen in this agent.
 *
 * ## Confidence Threshold
 * The `/generate` flow is read-only (it stages a result for the user to
 * approve via the `open-artifact` step). Per AGENTS.md, read-only LLM
 * intents must reach 70% confidence; mutations 90%. The instructions
 * include the threshold so the model self-reports when it is uncertain
 * and emits `null` for ambiguous fields rather than guessing.
 */
import { Agent } from '@mastra/core/agent';
import { resultOutputSchema } from '$lib/schema/result-output';
import type { TenantContext } from '../tenant-context';
import { requestContextSchema, DEFAULT_MODEL } from './shared';

export const resultMapperAgent = new Agent({
	id: 'result-mapper',
	name: 'Result Mapper',
	description:
		'Maps OCR transcript markdown to a structured ResultOutput object that conforms to the school result schema.',
	instructions: ({ requestContext }) => {
		const ctx = requestContext?.get('tenantContext') as TenantContext | undefined;

		const lines = [
			'You are a school-records mapper for the EdApex structured-output pipeline.',
			'Given a chunk of OCR\'d transcript markdown and the active school\'s ResultOutput schema,',
			'emit a JSON object that strictly conforms to that schema.',
			'',
			'BEHAVIORAL RULES:',
			'- Use the most specific subjectId, classId, and examTypeId you can infer from the markdown.',
			'- When a field is ambiguous or missing in the source, return null and the downstream Step will request disambiguation.',
			'- Do NOT invent marks, names, or IDs that are not present in the source markdown.',
			'- Confidence threshold: this is a read-only mapping, so 70% confidence is sufficient for emission. Below that, return null for the ambiguous fields.',
		];

		if (ctx) {
			lines.push(
				'',
				'TENANT BOUNDARIES (IDs):',
				`- School ID: ${ctx.schoolId}`,
				`- Class ID: ${ctx.classId || 'None'}`,
				`- Section ID: ${ctx.sectionId || 'None'}`,
				`- Exam ID: ${ctx.examId || 'None'}`,
				'- Stay within the active school boundary. If the markdown references a different school, return null and report the mismatch.',
			);
		}

		return lines.join('\n');
	},
	model: ({ requestContext }) => {
		return (requestContext?.get('modelId') as string) || DEFAULT_MODEL;
	},
	defaultOptions: {
		structuredOutput: { schema: resultOutputSchema }
	},
	requestContextSchema,
});
