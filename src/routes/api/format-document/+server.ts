import { json, error, type RequestHandler } from '@sveltejs/kit';
import { resolveTenantWorkspace } from '$lib/server/workspace/scope';
import { readManifest, addEntry, updateEntry, updateEntryStatus } from '$lib/server/workspace/manifest';
import { ocrMarkdownPath } from '$lib/server/workspace/paths';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { getClassRoster } from '$lib/server/mastra/agents/skill-instructions';
import { extractRateLimitFromHeaders } from '$lib/provider/rate-limit';
import { deriveInitialFilename } from '$lib/server/mastra/tools/operations/reporting/marksheet/stream-document';
import { buildMarksheetParseContext } from '$lib/server/mastra/tools/operations/reporting/marksheet/parse-context';
import { ensureMarksheetCommitted } from '$lib/server/mastra/tools/operations/reporting/marksheet/ensure-committed';
import { type Marksheet } from '$lib/schema/marksheet';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { GROQ_FORMAT_MODEL } from '$lib/server/mastra/agents/format';
import { resolveModelForRequest } from '$lib/server/mastra/provider';
import { resolveUserRole } from '$lib/server/mastra/provider/role-resolver';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { env } from '$env/dynamic/private';

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

  // PRIMARY CALL — the format agent always runs on Groq. Use the
  // canonical GROQ_FORMAT_MODEL constant (from agents/format.ts) so
  // the tier-1/2/3 router walks the user's Groq credentials on
  // every request. The `selected-model` cookie is intentionally
  // NOT consulted here — it is reserved for the rate-limit
  // fallback below.
  //
  // Failure is non-fatal: if no Groq credential can be resolved
  // (no user key, no pool, no env), the agent's `model` callback
  // falls through to its built-in `buildDefaultModelForRole('formatter')`
  // which uses `env.GROQ_API_KEY` at call time — preserving the
  // prior behavior.
  const cookieModel = cookies.get('selected-model') ?? '';
  const db = getAppDb();
  const traceContext = {
    userId: user.id,
    schoolId: tenant.schoolId,
    actorStaffId: tenant.staffId,
    userRole: resolveUserRole(tenant.designationId),
    todayTokenUsage: 0
  };
  try {
    const resolved = await resolveModelForRequest(
      user.id, GROQ_FORMAT_MODEL, db, undefined, traceContext
    );
    requestContext.set('modelConfig', resolved.config as never);
    if (resolved.providerOptions) {
      requestContext.set('providerOptions', resolved.providerOptions as never);
    }
  } catch (err) {
    // Resolution failed (e.g. AllTiersFailedError) — leave modelConfig
    // unset so the agent falls through to its per-call env default.
    console.warn('[format-document] model resolution skipped:', err instanceof Error ? err.message : err);
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
		console.log('[format-document] already formatted, post-format identity:', { studentId: entry.studentId, admissionNo: entry.admissionNo, path: entry.path });
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
    'If exactly one name matches, use the roster admissionNo in the Admission No field — NOT the value from the OCR. If multiple students share the same name, PRESERVE the admissionNo from the OCR input to disambiguate.',
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

  let markdown: string;
  try {
    const result = await agent.generate(prompt, {
      ...(requestContext ? { requestContext: requestContext as never } : {}),
      providerOptions: { groq: { reasoningEffort: 'none' } } as never
    });
    markdown = result.text;
  } catch (err: unknown) {
    const apicallErr = err as { statusCode?: number; responseHeaders?: Record<string, string>; message?: string };
    if (apicallErr?.statusCode === 429 && apicallErr?.responseHeaders) {
      const rl = extractRateLimitFromHeaders('groq', apicallErr.responseHeaders);
      const groqRetryAfterSeconds = rl.retryAfterSeconds ?? 15;
      const groqResetAt = new Date(Date.now() + groqRetryAfterSeconds * 1000);

      // RATE-LIMIT FALLBACK — re-resolve the user's `cookieModel`
      // (the `selected-model` cookie) through the tier 1/2/3 router
      // so the user's own key for that provider wins over pool/env.
      // No module-level env capture — the resolver reads the key
      // per-request. If resolution fails (e.g. no cookie, no
      // credential anywhere), surface the 429 to the client.
      if (cookieModel) {
        try {
          const fallbackResolved = await resolveModelForRequest(
            user.id, cookieModel, db, undefined, traceContext
          );
          const result = await agent.generate(prompt, {
            ...(requestContext ? { requestContext: requestContext as never } : {}),
            model: fallbackResolved.config as never,
            providerOptions: (fallbackResolved.providerOptions ?? { deepseek: { reasoningEffort: 'none' } }) as never
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
        const remaining = Math.max(1, Math.ceil((groqResetAt.getTime() - Date.now()) / 1000));
        return json({
          success: false,
          rateLimited: true,
          retryAfterSeconds: remaining,
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

  // Parse generated marksheet to resolve student identity.
  // Use the shared parse-context builder so subjectId is resolved from
  // the school subject mapping, school info from the SchoolRepository, and
  // roster is available for name-based student resolution. This matches
  // the pipeline used by /api/file/[...path] PUT validation and /api/commit.
  let parsedAdmNo: number | null = null;
  let resolvedStudentId: number | null = entry.studentId ?? null;
  let resolvedAdmNo: number | null = null;
  let studentFullName: string | null = null;
  let resolutionError: string | null = null;
  let parsedMarksheet: Marksheet | null = null;
  try {
    const { parseMarksheetMarkdown } = await import('$lib/utils/marksheet-ast-parser');
    const parseContext = await buildMarksheetParseContext(markdown, tenant);
    parsedMarksheet = parseMarksheetMarkdown(markdown, parseContext);
    const parsed = parsedMarksheet;
    parsedAdmNo = parsed.student?.adminNo != null ? Number(parsed.student.adminNo) : null;
    studentFullName = parsed.student?.fullName ?? null;
    console.log('[format-document] post-format parse result', {
      parsedAdmNo,
      studentFullName,
      adminNoRaw: parsed.student?.adminNo,
      subjectIdSample: parsed.records?.[0]?.subjectId,
    });
    if (parsedAdmNo) {
      const roster = await getClassRoster({
        classId: tenant.classId ?? undefined,
        sectionId: tenant.sectionId ?? undefined,
        academicId: tenant.academicId ?? undefined,
      });
      const match = roster.find(
        (r: { admissionNo?: string | number | null }) => r.admissionNo != null && Number(r.admissionNo) === parsedAdmNo
      );
      if (match) {
        resolvedStudentId = match.id;
        resolvedAdmNo = parsedAdmNo;
      } else {
        resolutionError = `Student with Admission No ${parsedAdmNo} not found in class roster`;
      }
    }
  } catch {
    // Parsing is best-effort — don't block the format response
  }

  const entryUpdate: Record<string, unknown> = {};
  if (resolvedStudentId) entryUpdate.studentId = resolvedStudentId;
  if (resolvedAdmNo) entryUpdate.admissionNo = resolvedAdmNo;
  if (resolutionError) {
    entryUpdate.validationErrors = [resolutionError];
    entryUpdate.validationErrorCount = 1;
  }

  if (Object.keys(entryUpdate).length > 0) {
    await updateEntry(tenant, initialMarkdownPath, entryUpdate as Partial<import('$lib/server/workspace/manifest').ManifestEntry>, examTypeId);
    if (entry.path) {
      await updateEntry(tenant, entry.path, entryUpdate as Partial<import('$lib/server/workspace/manifest').ManifestEntry>, examTypeId);
    }
  }

    

  // Server-side commit when validation passed. This runs synchronously
  // inside format-document so the marksheet record exists in student_records
  // by the time this response returns — eliminates the round-trip the
  // client used to need (and the MARKSHEET_NOT_FOUND error it caused).
  // Delegates to `ensureMarksheetCommitted` (also used by
  // `generate-result-pdf` before PDF rendering) so the read-parse-validate-commit
  // pipeline has a single source of truth and the two call sites stay in lock-step.
  let recordId: number | null = null;
  if (!resolutionError && resolvedStudentId) {
    const commitResult = await ensureMarksheetCommitted(
      tenant,
      {
        studentId: resolvedStudentId,
        markdownPath: initialMarkdownPath,
        reason: 'Auto-commit after format-document validation',
      },
      { throwOnFailure: false }
    );
    if (commitResult.ok) {
      recordId = commitResult.recordId;
      console.log('[format-document] immediate commit succeeded', { recordId, studentId: resolvedStudentId });
    } else {
      console.warn('[format-document] immediate commit failed:', commitResult.errors);
    }
  }

  return json({
    success: true,
    manifestStatus: 'Formatted',
    contentHash,
    initialMarkdownPath,
    studentId: resolvedStudentId,
    admissionNo: resolvedAdmNo,
    studentFullName,
    error: resolutionError,
    recordId,
  });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 500 });
  }
};
