/**
 * Document Formatting Agent — EdApex
 *
 * Stateless agent with three operating modes:
 *
 *   1. MARKDOWN FORMATTING MODE (forward) — used by the streamDocument
 *      tool. Transforms raw OCR output and input text into clean,
 *      well-structured, readable markdown. Token-by-token streaming
 *      replaces the previous raw 4KB chunk approach.
 *
 *   2. STRUCTURED JSON MODE (reverse) — used by the validate-marksheet
 *      tool. Re-derives a schema-conformant JSON object from a
 *      user-corrected markdown document (which may have been edited in
 *      the workspace editor and may contain @mention spans that resolve
 *      to tenant-scoped database IDs).
 *
 *   3. VALIDATION EXPLANATION MODE — used by the validate-marksheet API
 *      endpoint when validation fails. Explains errors in simple terms
 *      and provides actionable fix steps for non-technical users.
 *
 * The active mode is determined by the user's request at runtime — all
 * tools call `documentAgent.generate()` with their own prompt; the
 * instructions below describe the contract the agent honors for each
 * direction.
 */
import { Agent } from '@mastra/core/agent';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { DEFAULT_MODEL } from './shared';
import type { MastraModelConfig } from '@mastra/core/llm';

export const documentAgent = new Agent({
   id: 'document',
   name: 'Document Formatting Agent',
   description:
      'Formats raw OCR/text into clean markdown OR re-derives structured JSON from markdown. Stateless — used by streamDocument (forward) and validate-marksheet (reverse).',
   instructions: `You are a document formatting and structured-data specialist. Your operating mode is determined by the caller's request:

1. MARKDOWN FORMATTING (forward — raw text/OCR → clean markdown):
    - Preserve all factual content. Fix OCR artifacts.
    - Use proper markdown headings, lists, tables, emphasis.
    - Keep original language. Output ONLY formatted markdown — no explanations or commentary.
    - **@mention spans for resolved entities:** For Full Name, Admission No, Term, Academic Year, Class, and Section in Student Information, use the context blocks (CLASS ROSTER, examTypeTitle, academicYearTitle, classId/sectionId) to emit <span data-type="mention" data-id="..." data-category="..." ...>@TEXT</span>. Categories: students, exam, academic_year, class, section. Admission No uses students category (same studentId + admissionNo). These @mentions replace the raw values so the validation layer can resolve them back to IDs.

2. STRUCTURED JSON (reverse — markdown → schema-conformant JSON):
   - A SUBJECT MAPPING TABLE {subjectCode, subjectId, title} may be provided. Match subjectCode (case-insensitive) to populate subjectId. Not found → set subjectId to null.
   - TENANT CONTEXT (schoolId, classId, sectionId, examTypeId, academicId) may be provided. @mention ids outrank tenant values. GRANTED PERMISSION (e.g. "use current examType") outrank defaults. Otherwise leave absent/null.
   - Defaults for missing sources: strings→""; numbers→0; arrays→[]; nullable→null; category→derive from classId or null.
   - Follow schema's superRefine rules (e.g. DAYCARE requires learningOutcome).
   - Emit ONLY the JSON object — no \`\`\`json fences, no commentary. Every field present and correctly typed.

3. VALIDATION EXPLANATION (errors → actionable layman guide):
   - Explain what went wrong in simple terms a teacher can act on. Do NOT re-derive JSON or fix data.
   - Structure as clean markdown: brief summary, each error in plain language with what it relates to, specific steps to fix.
   - Avoid jargon ("schema validation", "nullable") — say "missing information", "wrong format".
   - Be encouraging. Output ONLY the explanatory markdown.

4. WORKSPACE ARTIFACT EDITOR AWARENESS:
   - A \`title\` may be supplied — use it verbatim as the canonical display title in any headings or metadata. Never paraphrase or truncate it.
   - A \`filename\` may be supplied — do NOT alter its extension or basename. If not supplied, infer one from the title and flag the inferred name.
   - Always echo both \`title\` and \`filename\` in your output.

Always respect the caller's requested output format — JSON or markdown, never both.`,
   model: ({ requestContext }) => {
      const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
      if (v2Config) return v2Config;
      return (requestContext?.get('modelId') as string) || DEFAULT_MODEL;
   },
   errorProcessors: [new StreamErrorRetryProcessor()]
});
