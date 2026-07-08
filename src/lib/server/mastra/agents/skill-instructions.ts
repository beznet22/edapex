import { ensureRegistry, skillRegistry, SKILL_COMMAND_MAP } from '$lib/server/mastra/skill-tools';
import type { TenantContext } from '../tenant-context';

/**
 * Maps the first token of a slash command to the skill name whose
 * instructions should be loaded into the system prompt. Exported from
 * skill-tools.ts so the dynamic tool resolver and this prompt builder
 * stay in sync.
 */
function resolveSkillName(message: string, isSlashCommand: boolean): string | null {
  if (!isSlashCommand) return null;
  const command = message.trim().split(/\s+/)[0]?.toLowerCase();
  return command ? SKILL_COMMAND_MAP[command] ?? null : null;
}

interface TenantLike {
  schoolId?: number | string;
  userId?: number | string;
  staffId?: number | string;
  designationId?: number | string;
  roleId?: number | string;
  classId?: number | string;
  sectionId?: number | string;
  examId?: number | string;
  examTypeId?: number | string;
  academicId?: number | string;
  studentId?: number | string;
}

/**
 * Builds the full assistant system prompt. Composed of three layers:
 *
 *   1. Global identity + behavior rules (tenant isolation, no hallucination,
 *      tone, etc.) — present in every request.
 *   2. Tenant context (schoolId, classId, file manifest) — present when
 *      requestContext carries a `tenantContext` value.
 *   3. Active skill instructions — appended ONLY for slash commands. This
 *      is the procedural guidance that lives in `skills/*.skill.md`
 *      (e.g. the four OCR-student-linking branches in reporting.skill.md,
 *      the pipeline ordering, the multi-screenshot commit flow). Plain
 *      chat with natural-language keyword matches does NOT load skill
 *      instructions — it gets the tools but not the procedural text,
 *      keeping casual prompts lean.
 *
 * Async because the first call triggers `ensureRegistry()` which scans
 * `src/lib/server/mastra/skills/` and validates every .skill.md against
 * the TOOL_MAP (rejects skills that reference unknown tool IDs).
 */
export async function buildAssistantInstructions(
  requestContext: { get<T = unknown>(key: string): T | undefined }
): Promise<string> {
  const ctx = requestContext.get('tenantContext') as TenantLike | undefined;
  const fileManifest = requestContext.get('fileManifest');
  const isSlashCommand = requestContext.get('isSlashCommand');
  const lastMessage = requestContext.get('lastMessage');

  const instructions: string[] = [
    'You are the EdApex Assistant, an expert AI partner for teachers and administrators.',
    'You provide professional, data-driven support within the boundaries of the current workspace.',
    '',
    '### GLOBAL RULES (NEVER VIOLATE) ###',
    '',
    '1. Tenant isolation is absolute. Never suggest or perform actions that would cross school boundaries, expose another school\'s data, or bypass workspace safety rules.',
    '2. Never hallucinate data. If you don\'t know a student name, assessment setup, or class roster, call `getContext` to look it up.',
    '3. Maintain a premium, helpful, and professional tone.',
    '4. Use only the domain data provided (tenant context below, file manifest, message context).',
    '5. Domain-specific rules (marksheets, transcripts, enrollment, etc.) live in the loaded SKILL — follow the active skill\'s instructions for tool sequencing and intent interpretation.',
    '',
    '### END GLOBAL RULES ###'
  ];

  if (ctx) {
    instructions.push(
      '',
      'TENANT BOUNDARIES (IDs):',
      `- School ID: ${ctx.schoolId ?? 'None'}`,
      `- User ID: ${ctx.userId ?? 'None'}`,
      `- Designation ID: ${ctx.designationId ?? 'None'}`,
      `- Active Class ID: ${ctx.classId ?? 'None'}`,
      `- Active Section ID: ${ctx.sectionId ?? 'None'}`,
      `- Active Exam ID: ${ctx.examId ?? 'None'}`,
      `- Active Exam Type ID: ${ctx.examTypeId ?? 'None'}`,
      `- Active Academic Year ID: ${ctx.academicId ?? 'None'}`,
      `- Active Student ID (if @mention resolved): ${ctx.studentId ?? 'None'}`,
      `- Active Role ID: ${ctx.roleId ?? 'None'}`,
      '',
      'FILE MANIFEST:',
      'When files are attached, they appear in the FILE MANIFEST below.',
      'Pass the `contentHash` (same as `fileId`) to the appropriate streaming tool — never invent file identifiers.',
      '',
      typeof fileManifest === 'string' ? fileManifest : 'No files attached'
    );
  }

  if (isSlashCommand === true && typeof lastMessage === 'string' && lastMessage.length > 0) {
    await ensureRegistry();
    const skillName = resolveSkillName(lastMessage, true);
    if (skillName) {
      const skill = skillRegistry.getSkill(skillName);
      if (skill?.instructions) {
        instructions.push(
          '',
          `### SKILL INSTRUCTIONS — ${skill.name || skillName} ###`,
          skill.instructions,
          '',
          '### END SKILL INSTRUCTIONS ###',
          '',
          'Follow the SKILL INSTRUCTIONS above precisely when handling this slash command.'
        );
      }
    }
  }

  return instructions.join('\n');
}
