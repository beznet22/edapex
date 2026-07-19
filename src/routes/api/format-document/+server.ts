import { json, error, type RequestHandler } from '@sveltejs/kit';
import { resolveTenantWorkspace } from '$lib/server/workspace/scope';
import { readManifest, addEntry, updateEntry, updateEntryStatus } from '$lib/server/workspace/manifest';
import { ocrMarkdownPath } from '$lib/server/workspace/paths';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { getClassRoster } from '$lib/server/mastra/agents/skill-instructions';
import { extractRateLimitFromHeaders } from '$lib/provider/rate-limit';
import { deriveInitialFilename } from '$lib/server/mastra/tools/operations/reporting/marksheet/stream-document';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { openCodeProvider } from '$lib/server/mastra/agents/shared';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');

  const body = (await request.json()) as {
    contentHash?: string;
    fileName?: string;
    examTypeId?: number;
  };

  const { contentHash, fileName, examTypeId: bodyExamTypeId } = body;
  if (!contentHash || !fileName) {
    return json({ success: false, error: 'MISSING_REQUIRED_FIELDS: contentHash and fileName are required' }, { status: 400 });
  }

  const { tenant, requestContext, fs } = await resolveTenantWorkspace({
    schoolId: user.schoolId ?? 1,
    userId: user.id,
    staffId: (user as { staffId?: number })?.staffId,
    designationId: (user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
    roleId: (user as { roleId?: number | null })?.roleId ?? null,
    selectedClassCookie: cookies.get('selected-class'),
    examTypeId: bodyExamTypeId ?? null,
  });
  if (!fs) {
    return json({ success: false, error: 'WORKSPACE_UNAVAILABLE' }, { status: 500 });
  }

  const examTypeId = bodyExamTypeId ?? tenant.examTypeId;
  if (examTypeId == null) {
    return json({ success: false, error: 'EXAM_TYPE_REQUIRED: format-document needs an active examTypeId' }, { status: 400 });
  }

  const manifest = await readManifest(tenant, examTypeId);
  const entriesList = Object.values(manifest.entries);

  // The contentHash may belong to the OCR markdown entry (SHA256 of markdown)
  // or the upload entry (MD5 of original file). Find by contentHash first,
  // then locate the user-file entry by matching fileName.
  const contentEntry = entriesList.find((e) => e.contentHash === contentHash);
  if (!contentEntry?.fileName) {
    console.error('[format-document] MANIFEST_ENTRY_NOT_FOUND', {
      contentHash,
      fileName,
      examTypeId,
      tenant: {
        schoolId: tenant.schoolId,
        classId: tenant.classId,
        sectionId: tenant.sectionId,
        className: tenant.className,
        sectionName: tenant.sectionName,
        academicId: tenant.academicId,
        academicYearTitle: tenant.academicYearTitle,
        examTypeId: tenant.examTypeId,
      },
      manifestEntryCount: entriesList.length,
      manifestContentHashes: entriesList.map((e) => e.contentHash),
      manifestPaths: entriesList.map((e) => e.path),
      manifestStatuses: entriesList.map((e) => e.status),
      manifestKinds: entriesList.map((e) => e.kind),
    });
    return json({ success: false, error: 'MANIFEST_ENTRY_NOT_FOUND', contentHash }, { status: 404 });
  }

  // Locate the user-file upload entry by matching fileName
  const entry = entriesList.find(
    (e) => e.kind === 'user-file' && e.fileName === contentEntry.fileName
  ) ?? contentEntry;

  console.log('[format-document] found entry', {
    contentHash,
    matchedKind: contentEntry.kind,
    matchedPath: contentEntry.path,
    entryPath: entry.path,
    entryStatus: entry.status,
    entryKind: entry.kind,
    fileName,
    examTypeId,
  });

  if (entry.status === 'Formatted') {
    return json({ success: true, manifestStatus: 'Formatted', contentHash });
  }

  const mdRelPath = ocrMarkdownPath(entry.fileName!, examTypeId);
  if (!(await fs.exists(mdRelPath))) {
    return json({ success: false, error: 'OCR_MARKDOWN_NOT_FOUND', path: mdRelPath }, { status: 404 });
  }
  const raw = await fs.readFile(mdRelPath, { encoding: 'utf-8' });
  const ocrMarkdown = typeof raw === 'string' ? raw : raw.toString('utf-8');

  const assessment = await createAssessmentServiceForRequest(tenant);
  const mapping = await assessment.getMappingData(
    tenant.classId!,
    tenant.sectionId!
  );

  const examTypeTitle = Array.isArray(mapping.examTypes)
    ? mapping.examTypes[0]?.title
    : (mapping.examTypes as Record<string, unknown>)?.title ?? '';

  let rosterLines = '';
  try {
    const roster = await getClassRoster({
      classId: tenant.classId ?? undefined,
      sectionId: tenant.sectionId ?? undefined,
      academicId: tenant.academicId ?? undefined,
    });
    rosterLines = roster
      .map((r: { name: string; admissionNo?: string | number | null }) => `  - ${r.name}${r.admissionNo ? ` (Adm#${r.admissionNo})` : ''}`)
      .join('\n');
  } catch {
    rosterLines = '  (no roster available)';
  }

  const subjectLines = mapping.subjects
    .filter((s: { id?: number | null; subjectCode?: string | null }) => s.id && s.subjectCode)
    .map((s: { subjectCode: string | null }) => `  - ${s.subjectCode}`)
    .join('\n');

  const CATEGORY_COLS = `DAYCARE: Subject Code | Learning Outcome
NURSERY: Subject Code | CA (30) | ORAL (5) | PSYCHO (5) | HW (10) | EXAM (50)
GRADEK: Subject Code | CA1 (20) | CA2 (20) | HW (2) | REPORT (4) | PSYCHO (4) | EXAM (50)
LOWERBASIC: Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50)
MIDDLEBASIC: Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50)`;

  const prompt = [
    'Format this OCR into a strict marksheet markdown.',
    'Use the context below to fill in the correct values as plain text (no spans).',
    '',
    '# FullName — ExamTitle',
    '',
    '## Student Information (| Field | Details |)',
    'Full Name, Admission No, Class, Section, Category, Term, Academic Year, Days Open, Days Present, Days Absent',
    '',
    '## Academic Performance (single table, subjects as rows)',
    'Infer category, pick columns:',
    CATEGORY_COLS,
    'No Total/Grade rows. DAYCARE must include Learning Outcome column. Use exact Title (Max) format.',
    '',
    "## Learner's Rating (| Trait | Rating | 1-5)",
    'Traits: Adherent and independent, Flexibility and creativity, Meticulous, Neatness, Self-control and interaction, Overall progress.',
    '',
    "## Teacher's Remark",
    '> blockquote',
    '',
    'No markdown fences, no commentary.',
    '',
    '--- CONTEXT ---',
    `Class: ${tenant.className ?? ''} (id=${tenant.classId ?? ''})`,
    `Section: ${tenant.sectionName ?? ''} (id=${tenant.sectionId ?? ''})`,
    `Term: ${examTypeTitle || tenant.examTypeId || ''}`,
    `Academic Year: ${tenant.academicYearTitle ?? ''}`,
    '',
    'STUDENT ROSTER (admissionNo here is AUTHORITATIVE):',
    rosterLines || '  (no roster available)',
    'Match the student Full Name from the OCR to this roster, then use the roster admissionNo in the Admission No field — NOT the value from the OCR.',
    '',
    'SUBJECT CODES:',
    subjectLines || '  (no subjects available)',
    '',
    '--- OCR INPUT ---',
    ocrMarkdown,
  ].join('\n');

  const { mastra } = await import('$lib/server/mastra');
  const agent = mastra.getAgent('format');
  if (!agent) {
    return json({ success: false, error: 'AGENT_NOT_REGISTERED: format agent is not registered on the Mastra instance' }, { status: 500 });
  }

  const selectedModel = cookies.get('selected-model') ?? '';

  let markdown: string;
  try {
    const result = await agent.generate(prompt, {
      providerOptions: { groq: { reasoningEffort: 'none' } } as never,
    });
    markdown = result.text;
  } catch (err: unknown) {
    const apicallErr = err as { statusCode?: number; responseHeaders?: Record<string, string>; message?: string };
    if (apicallErr?.statusCode === 429 && apicallErr?.responseHeaders) {
      const rl = extractRateLimitFromHeaders('groq', apicallErr.responseHeaders);
      const groqRetryAfterSeconds = rl.retryAfterSeconds ?? 15;
      const groqResetAt = new Date(Date.now() + groqRetryAfterSeconds * 1000);

      const fallbackProvider = selectedModel.split('/')[0];
      if (selectedModel && fallbackProvider && fallbackProvider !== 'groq') {
        try {
          const model = openCodeProvider.chatModel(selectedModel.split('/')[1]);
          const result = await agent.generate(prompt, {
            model,
            providerOptions: { deepseek: { reasoningEffort: 'none' } } as never,
          });
          markdown = result.text;
        } catch {
          const remaining = Math.max(1, Math.ceil((groqResetAt.getTime() - Date.now()) / 1000));
          return json({
            success: false,
            rateLimited: true,
            retryAfterSeconds: remaining,
            resetAt: groqResetAt.toISOString(),
          }, { status: 429 });
        }
      } else {
        return json({
          success: false,
          rateLimited: true,
          retryAfterSeconds: groqRetryAfterSeconds,
          resetAt: groqResetAt.toISOString(),
        }, { status: 429 });
      }
    } else {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: `FORMAT_FAILED: ${message}` }, { status: 500 });
    }
  }

  const { title, initialMarkdownPath } = deriveInitialFilename(entry.fileName!, contentHash, examTypeId);

  await fs.writeFile(initialMarkdownPath, markdown, { recursive: true });

  const formattedDocumentId = entry.documentId;
  await addEntry(
    tenant,
    {
      path: initialMarkdownPath,
      kind: 'marksheet-markdown',
      status: 'Formatted',
      documentId: formattedDocumentId,
      fileName: entry.fileName,
      contentHash,
      studentId: entry.studentId ?? undefined,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    examTypeId
  );
  await updateEntryStatus(tenant, initialMarkdownPath, 'formatted', examTypeId);
  if (entry.path) {
    await updateEntry(tenant, entry.path, { status: 'Formatted' }, examTypeId);
  }

  return json({
    success: true,
    manifestStatus: 'Formatted',
    contentHash,
    initialMarkdownPath,
  });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 500 });
  }
};
