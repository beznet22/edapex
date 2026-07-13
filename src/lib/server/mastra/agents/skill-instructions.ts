import { ensureRegistry, skillRegistry, SKILL_COMMAND_MAP } from '$lib/server/mastra/skill-tools';
import type { TenantContext } from '../tenant-context';
import { getDatabase } from '$lib/server/db';
import {
  smSchools,
  smClasses,
  smSections,
  smExamTypes,
  smAcademicYears,
  smStudents,
  studentRecords,
} from '$lib/server/db/sms-schema';
import { DESIGNATIONS } from '$lib/types/sms-types';
import { and, asc, eq } from 'drizzle-orm';

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
  examTypeId?: number | string;
  academicId?: number | string;
}

/**
 * Readable view of the active tenant. Every field is optional because the
 * request may carry a partial `TenantLike` (e.g. an unauthenticated probe
 * or a tool call from a non-tenant-bound workflow).
 */
interface DisplayContext {
  schoolName?: string;
  className?: string;
  sectionName?: string;
  academicYearTitle?: string;
  examTypeTitle?: string;
  designationTitle?: string;
}

/**
 * Resolves human-readable names for every tenant field that the assistant
 * might mention. Each lookup is independent so a missing row for one ID
 * never short-circuits the rest. Returns `undefined` for fields whose ID
 * is absent or whose row could not be found.
 */
async function resolveDisplayContext(ctx: TenantLike): Promise<DisplayContext> {
  const db = await getDatabase();
  const out: DisplayContext = {};

  if (ctx.schoolId != null) {
    const rows = await db
      .select({ name: smSchools.schoolName })
      .from(smSchools)
      .where(eq(smSchools.id, Number(ctx.schoolId)))
      .limit(1);
    if (rows[0]?.name) out.schoolName = rows[0].name;
  }

  if (ctx.classId != null) {
    const rows = await db
      .select({ name: smClasses.className })
      .from(smClasses)
      .where(eq(smClasses.id, Number(ctx.classId)))
      .limit(1);
    if (rows[0]?.name) out.className = rows[0].name;
  }

  if (ctx.sectionId != null) {
    const rows = await db
      .select({ name: smSections.sectionName })
      .from(smSections)
      .where(eq(smSections.id, Number(ctx.sectionId)))
      .limit(1);
    if (rows[0]?.name) out.sectionName = rows[0].name;
  }

  if (ctx.academicId != null) {
    const rows = await db
      .select({ title: smAcademicYears.title, year: smAcademicYears.year })
      .from(smAcademicYears)
      .where(eq(smAcademicYears.id, Number(ctx.academicId)))
      .limit(1);
    if (rows[0]) out.academicYearTitle = rows[0].title || rows[0].year || undefined;
  }

  if (ctx.examTypeId != null) {
    const rows = await db
      .select({ title: smExamTypes.title })
      .from(smExamTypes)
      .where(eq(smExamTypes.id, Number(ctx.examTypeId)))
      .limit(1);
    if (rows[0]?.title) out.examTypeTitle = rows[0].title;
  }

  if (ctx.designationId != null) {
    const idx = Number(ctx.designationId);
    if (Number.isInteger(idx) && idx >= 0 && idx < DESIGNATIONS.length) {
      out.designationTitle = DESIGNATIONS[idx];
    }
  }

  return out;
}

/**
 * Returns the active class roster as `{ name, admissionNo }` rows. Joins
 * `smStudents` with `studentRecords` to scope by class+section+academic
 * year and the default-record flag — the same join shape used by
 * `StudentRepository.getStudentsByClassSection`. Returns an empty list
 * when any required ID is missing.
 */
async function getClassRoster(
  ctx: TenantLike
): Promise<Array<{ id: number; name: string; admissionNo?: string }>> {
  if (ctx.classId == null || ctx.sectionId == null || ctx.academicId == null) return [];
  const db = await getDatabase();
  const rows = await db
    .select({
      id: smStudents.id,
      fullName: smStudents.fullName,
      admissionNo: smStudents.admissionNo,
    })
    .from(smStudents)
    .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
    .where(
      and(
        eq(studentRecords.classId, Number(ctx.classId)),
        eq(studentRecords.sectionId, Number(ctx.sectionId)),
        eq(studentRecords.academicId, Number(ctx.academicId)),
        eq(studentRecords.isDefault, 1),
        eq(studentRecords.activeStatus, 1),
        eq(smStudents.activeStatus, 1)
      )
    )
    .orderBy(asc(smStudents.fullName));

  return rows.map((r) => ({
    id: r.id,
    name: r.fullName?.trim() || `Student #${r.id}`,
    admissionNo: r.admissionNo != null ? String(r.admissionNo) : undefined,
  }));
}

/**
 * Builds the full assistant system prompt. Composed of three layers:
 *
 *   1. Global identity + behavior rules (tenant isolation, no hallucination,
 *      tone, etc.) — present in every request.
 *   2. Tenant context — readable names, class roster, resolved @mentions,
 *      and a separate TOOL CALLING CONTEXT (IDs only) — present when
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
  const resolvedMentions = requestContext.get('resolvedMentions') as
    | Array<{ category: string; name: string; admissionNo?: string; parentContext?: string }>
    | undefined;

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
    '### FILE RETRIEVAL DISCIPLINE ###',
    'When the user references an existing file or you need to read a workspace artifact:',
    '1. Locate the file via the FILE MANIFEST section below — use the exact `contentHash` (also known as `fileId`). Never invent file identifiers.',
    '2. Read the file with `readWorkspaceFile` (or the appropriate workspace read tool) — never guess or summarize content you have not retrieved.',
    '3. If multiple files match the user\'s description, ask the user to disambiguate using the manifest titles before reading.',
    '4. After reading, surface the key facts in your thinking block before acting on them, and cite the file path you read.',
    '',
    '### TOOL CALLING DISCipline ###',
    '1. Tool arguments must use the IDs from TOOL CALLING CONTEXT (schoolId, classId, sectionId, academicId, examTypeId, staffId, etc.). Never pass user-facing names to tools that expect IDs.',
    '2. For mutating tools (those that declare `requireApproval: true`), you MUST include a `reason` string summarizing the action in plain language so the reviewer can decide without reading raw arguments.',
    '3. Always emit a clear, concise `reason` describing WHY you are calling the tool (e.g., "Enroll new student Jane Doe into JSS1A for 2024/2025").',
    '4. After a tool returns, inspect the result before proceeding — never assume success. On failure, explain the cause in plain language and propose a corrective next step.'
  ];

  if (ctx) {
    const display = await resolveDisplayContext(ctx);
    const roster = await getClassRoster(ctx);
    const focusStudent = resolvedMentions?.find((m) => m.category === 'students');

    instructions.push(
      '',
      'TENANT CONTEXT (user-facing):',
      `- School: ${display.schoolName ?? 'Unknown'}`,
      `- Class: ${display.className ?? 'Unknown'}${display.sectionName ? ` - ${display.sectionName}` : ''}`,
      `- Academic Year: ${display.academicYearTitle ?? 'Unknown'}`,
      `- Exam Type: ${display.examTypeTitle ?? 'Unknown'}`,
      `- Designation: ${display.designationTitle ?? 'Unknown'}`,
      focusStudent
        ? `- Focus Student: ${focusStudent.name}${focusStudent.admissionNo ? ` (Adm#${focusStudent.admissionNo})` : ''}`
        : '- Focus Student: None',
      '',
      'CLASS ROSTER:'
    );

    if (roster.length === 0) {
      instructions.push('- (no active students in this class/section)');
    } else {
      const MAX_ROSTER = 100;
      const visible = roster.slice(0, MAX_ROSTER);
      for (const r of visible) {
        instructions.push(
          `- ${r.name}${r.admissionNo ? ` (Adm#${r.admissionNo})` : ''} [studentId=${r.id}]`
        );
      }
      if (roster.length > MAX_ROSTER) {
        instructions.push(`... and ${roster.length - MAX_ROSTER} more`);
      }
    }

    if (resolvedMentions && resolvedMentions.length > 0) {
      instructions.push('', 'RESOLVED @MENTIONS:');
      for (const m of resolvedMentions) {
        const label = m.parentContext ? `${m.name} (in ${m.parentContext})` : m.name;
        instructions.push(`- ${m.category}: ${label}`);
      }
    }

    instructions.push(
      '',
      'TOOL CALLING CONTEXT (for tool arguments only, never show user):',
      `- schoolId: ${ctx.schoolId ?? 'None'}`,
      `- userId: ${ctx.userId ?? 'None'}`,
      `- staffId: ${ctx.staffId ?? 'None'}`,
      `- designationId: ${ctx.designationId ?? 'None'}`,
      `- roleId: ${ctx.roleId ?? 'None'}`,
      `- classId: ${ctx.classId ?? 'None'}`,
      `- sectionId: ${ctx.sectionId ?? 'None'}`,
      `- academicId: ${ctx.academicId ?? 'None'}`,
      `- examTypeId: ${ctx.examTypeId ?? 'None'}`,
      '',
      'CRITICAL: When presenting action summaries or talking to the user, ALWAYS use readable names from TENANT CONTEXT and RESOLVED @MENTIONS. NEVER present raw IDs unless the user explicitly asks. Admission numbers may be shown because they have no readable equivalent.',
      '',
      'FILE MANIFEST:',
      'When files are attached, they appear in the FILE MANIFEST below.',
      'Pass the `contentHash` (same as `fileId`) to the appropriate streaming tool — never invent file identifiers.',
      '',
      typeof fileManifest === 'string' ? fileManifest : 'No files attached'
    );
  }

  // if (isSlashCommand === true && typeof lastMessage === 'string' && lastMessage.length > 0) {
  //   await ensureRegistry();
  //   const skillName = resolveSkillName(lastMessage, true);
  //   if (skillName) {
  //     const skill = skillRegistry.getSkill(skillName);
  //     if (skill?.instructions) {
  //       instructions.push(
  //         '',
  //         `### SKILL INSTRUCTIONS — ${skill.name || skillName} ###`,
  //         skill.instructions,
  //         '',
  //         '### END SKILL INSTRUCTIONS ###',
  //         '',
  //         'Follow the SKILL INSTRUCTIONS above precisely when handling this slash command.'
  //       );
  //     }
  //   }
  // }

  return instructions.join('\n');
}
