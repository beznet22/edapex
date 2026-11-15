/**
 * Pure PDF render core for student result reports.
 *
 * Extracted from `generate-result-pdf.ts` so the Telegram parent bot can
 * generate a PDF without spinning up a Mastra tool context, a stream
 * writer, or a workspace manifest. The existing web/admin path still
 * calls this core, then layers on workspace writes + data-parts.
 *
 * Contract:
 *   - No side effects beyond `bin/html2pdf` execution and a transient
 *     temp directory.
 *   - Returns a discriminated `RenderResultPdfResult`: `{ok: true, ...}`
 *     on success or `{ok: false, code, message}` on the well-known
 *     failure modes callers want to translate into Telegram templates.
 *   - Never throws for expected failures — only for programmer errors
 *     (bad input, missing tenant fields).
 */
import { render } from "svelte/server";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { generate as generatePdf } from "$lib/server/helpers/pdf-generator";
import { pageToHtml } from "$lib/server/helpers";
import { marksheetSchema, type Marksheet } from "$lib/schema/marksheet";
import { padMissingRecords } from "./marksheet/validate-cross-ref";
import { sanitizeForFilename } from "$lib/server/workspace/slug";
import { readManifest } from "$lib/server/workspace/manifest";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import {
  _resolveStudentSession,
  resolveStudent,
  type StudentCriteria,
} from "./_shared";
import type { TenantContext } from "$lib/server/mastra/tenant-context";

export type RenderResultPdfFailureCode =
  | "STUDENT_NOT_FOUND"
  | "NO_STUDENT_SESSION"
  | "MARKSHEET_NOT_FOUND"
  | "PDF_RENDER_FAILED"
  | "INVALID_INPUT";

export interface RenderResultPdfInput {
  tenant: TenantContext;
  studentId: number;
  examTypeId: number;
  academicId: number | null;
}

export type RenderResultPdfResult =
  | {
      ok: true;
      pdfBuffer: Buffer;
      filename: string;
      marksheet: Marksheet;
      studentFullName: string;
      studentAdmissionNo: number | null;
    }
  | {
      ok: false;
      code: RenderResultPdfFailureCode;
      message: string;
    };

const EMPTY_FILENAME_STUDENT = "student";

function buildFilename(fullName: string, studentId: number, examTypeId: number): string {
  return `${sanitizeForFilename(fullName || EMPTY_FILENAME_STUDENT)}_${studentId}_e${examTypeId}.pdf`;
}

function buildBaseFilename(fullName: string, admissionNo: number | null, examTypeId: number): string {
  const safeName = sanitizeForFilename(fullName || EMPTY_FILENAME_STUDENT);
  return `res_${safeName}_a${admissionNo ?? 0}_e${examTypeId}_${Date.now()}`;
}

async function resolveTenantForStudent(
  tenant: TenantContext,
  studentId: number,
): Promise<
  | { ok: true; tenant: TenantContext }
  | { ok: false; code: "NO_STUDENT_SESSION" | "STUDENT_NOT_FOUND"; message: string }
> {
  if (tenant.classId !== null && tenant.sectionId !== null && tenant.schoolId !== 0) {
    return { ok: true, tenant };
  }

  const session = await _resolveStudentSession(studentId, tenant.academicId);
  if (session === null || session.classId === null || session.sectionId === null) {
    return {
      ok: false,
      code: "NO_STUDENT_SESSION",
      message: `NO_STUDENT_SESSION: no active student_records row for studentId=${studentId}, academicId=${tenant.academicId ?? "?"}`,
    };
  }
  return {
    ok: true,
    tenant: {
      ...tenant,
      classId: session.classId,
      sectionId: session.sectionId,
      schoolId: session.schoolId ?? tenant.schoolId,
      academicId: session.academicId ?? tenant.academicId,
    },
  };
}

async function validateAndPadMarksheet(
  tenant: TenantContext,
  studentId: number,
  examTypeId: number,
  raw: Marksheet,
): Promise<Marksheet> {
  if (tenant.classId === null || tenant.sectionId === null) {
    return marksheetSchema.parseAsync(raw);
  }
  const assessment = await createAssessmentServiceForRequest(tenant);
  try {
    const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
    let omitSet: Set<number> | undefined;
    try {
      const m = await readManifest(tenant, examTypeId);
      const entry = Object.values(m.entries).find(
        (e) =>
          e.studentId === studentId &&
          typeof e.path === "string" &&
          e.path.includes("/marksheets/") &&
          e.path.endsWith(".md"),
      );
      if (entry?.omittedSubjectIds?.length) omitSet = new Set(entry.omittedSubjectIds);
    } catch {
      // best-effort: a missing manifest must not block PDF generation
    }
    const padded = padMissingRecords(raw, assigned, omitSet);
    return await marksheetSchema.parseAsync(padded);
  } catch {
    return marksheetSchema.parseAsync(raw);
  }
}

function studentCriteriaFromTenant(tenant: TenantContext): StudentCriteria {
  return {
    classId: tenant.classId,
    sectionId: tenant.sectionId,
  };
}

export async function renderResultPdfCore(
  input: RenderResultPdfInput,
): Promise<RenderResultPdfResult> {
  if (
    !Number.isInteger(input.studentId) ||
    input.studentId <= 0 ||
    !Number.isInteger(input.examTypeId) ||
    input.examTypeId <= 0
  ) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: `INVALID_INPUT: studentId=${input.studentId}, examTypeId=${input.examTypeId}`,
    };
  }

  const { tenant } = input;

  let student;
  try {
    student = await resolveStudent(
      tenant,
      { studentId: input.studentId, ...studentCriteriaFromTenant(tenant) },
      tenant.classId,
      tenant.sectionId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("STUDENT_NOT_FOUND") || message.startsWith("WORKSPACE_MISMATCH")) {
      return { ok: false, code: "STUDENT_NOT_FOUND", message };
    }
    return { ok: false, code: "STUDENT_NOT_FOUND", message };
  }

  const resolved = await resolveTenantForStudent(tenant, student.studentId);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  const resolvedTenant = resolved.tenant;

  const assessment = await createAssessmentServiceForRequest(resolvedTenant);
  const fullResult = await assessment.getStudentResult({
    id: student.studentId,
    examId: input.examTypeId,
    isAdminNo: false,
    withImages: true,
  });
  if (!fullResult) {
    return {
      ok: false,
      code: "MARKSHEET_NOT_FOUND",
      message: `MARKSHEET_NOT_FOUND: no marksheet data for studentId=${student.studentId}, examId=${input.examTypeId}`,
    };
  }

  const validated = await validateAndPadMarksheet(
    resolvedTenant,
    student.studentId,
    input.examTypeId,
    fullResult as Marksheet,
  );

  const { body, head } = render(ResultTemplate, { props: { data: validated } });
  const html = pageToHtml(body, head);
  const baseName = buildBaseFilename(
    student.fullName ?? "student",
    student.admissionNo,
    input.examTypeId,
  );
  const generated = await generatePdf({ htmlContent: html, fileName: baseName });
  if (!generated.success || !generated.pdfBuffer) {
    return {
      ok: false,
      code: "PDF_RENDER_FAILED",
      message: generated.error ?? "html2pdf produced no output",
    };
  }

  return {
    ok: true,
    pdfBuffer: generated.pdfBuffer,
    filename: buildFilename(
      student.fullName ?? "student",
      student.studentId,
      input.examTypeId,
    ),
    marksheet: validated,
    studentFullName: student.fullName ?? "student",
    studentAdmissionNo: student.admissionNo,
  };
}
