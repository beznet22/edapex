/**
 * Assessment OCR Service — EdApex
 *
 * Owns the per-request OCR extraction pipeline that turns uploaded mark sheets
 * into a structured extraction result ready for the result-mapper agent to
 * finish mapping to a `ResultInput`.
 *
 * Pipeline (per file):
 *  1. Look up class/section names for storage path resolution
 *  2. Call `MistralOcrService.processDocument` to OCR the file
 *  3. Persist OCR markdown to the workspace at `exams/examType-{id}/ocr/<filename>.md`
 *  4. Build a partially-populated extraction result. The full markdown →
 *     structured mapping requires the result-mapper agent; until then this
 *     method returns the OCR text + populated studentData shell so the UI can
 *     render the review form.
 *
 * The pipeline is invoked from:
 *  - `routes/api/uploads/+server.ts` (file drop)
 *  - `mastra/workflows/extraction.ts` (via the `runExtractionForTool`
 *    orchestrator method in `AssessmentService`)
 *  - `(chat)/+page.server.ts` action
 *
 * Slice 10: tenant-scoped via `ScopedRepositoryProvider` (no module singletons).
 */
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository, StudentRepository } from "$lib/server/repository";
import { mistralOcrService } from "./mistral-ocr.service";
import type { Category } from "$lib/schema/marksheet";
import { GRADE_RANGES } from "$lib/server/service/assessment.service";
import { resolveTenantFilesystem } from "$lib/server/workspace";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { ocrMarkdownPath, uploadPath } from "$lib/server/workspace/paths";
import { addEntry, updateEntry } from "$lib/server/workspace/manifest";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";

export interface ExtractionResult {
  success: boolean;
  studentData: { studentId?: number; admissionNo?: number; fullName?: string; className: string; sectionName: string; class: string };
  marks: {
    studentData: ExtractionResult["studentData"];
    marksData: Array<Record<string, unknown>>;
    rawText: string;
    mappingStatus: "pending";
  };
  storagePath: string;
  is_fallback: boolean;
  rawText: string;
}

export class AssessmentOcrService {
  private readonly provider: ScopedRepositoryProvider;
  private readonly tenant: TenantContext;

  constructor(provider: ScopedRepositoryProvider, tenant: TenantContext) {
    this.provider = provider;
    this.tenant = tenant;
  }

  private result() {
    return this.provider.getRepo(ResultsRepository);
  }

  private student() {
    return this.provider.getRepo(StudentRepository);
  }

  /**
   * Run Mistral OCR on a single file and persist OCR markdown + upload to
   * the tenant workspace at `ocr/<filename>.md` and `uploads/<filename>`.
   * Returns an `ExtractionResult` with the raw text and student data.
   */
  async runExtraction(params: {
    userId: number;
    teacherId: number;
    file: Blob;
    classId: number;
    sectionId: number;
    studentId?: number;
    fullName?: string;
    admissionNo?: number;
    originalName?: string;
  }): Promise<ExtractionResult | null> {
    const { file, classId, sectionId, studentId, fullName, admissionNo, originalName } = params;

    const classSection = await this.result().getClassSectionById(classId, sectionId);
    if (!classSection) throw new Error("Class section not found");

    const fileName = originalName || "uploaded";
    const ocrResponse = await mistralOcrService.processDocument(file, fileName, {
      db: getAppDb(),
      userId: params.userId,
      schoolId: null,
      userRole: null
    });
    const rawText = (ocrResponse as { pages?: Array<{ markdown?: string }> }).pages
      ?.map((p) => p.markdown ?? "")
      .filter(Boolean)
      .join("\n\n") || "";

    if (!rawText) {
      console.error("Extraction produced no OCR text for", fileName);
      return null;
    }

    // Persist OCR markdown to the workspace at the canonical path
    const rc = buildWorkspaceRequestContext(this.tenant);
    const fs = await resolveTenantFilesystem({ requestContext: rc as never });
    if (!fs) throw new Error("Tenant workspace filesystem unavailable");
    if (this.tenant.examTypeId == null) {
      throw new Error("TENANT_EXAM_TYPE_REQUIRED: assessment-ocr requires an active examTypeId");
    }
    const examTypeId = this.tenant.examTypeId;

    const ocrPath = ocrMarkdownPath(fileName, examTypeId);
    await fs.writeFile(ocrPath, rawText, { recursive: true });
    await addEntry(
      this.tenant,
      {
        path: ocrPath,
        examTypeId,
        kind: "ocr-markdown",
        fileName,
        uploadedAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        mimeType: "text/markdown",
      },
      examTypeId
    );

    const sourceFilePath = uploadPath(fileName, examTypeId);
    await updateEntry(this.tenant, sourceFilePath, { status: 'Extracted' }, examTypeId);

    const finalClassName = classSection.className || "Unknown";
    const finalSectionName = classSection.sectionName || "Unknown";
    const extractedData = {
      studentData: {
        studentId,
        admissionNo,
        fullName,
        className: finalClassName,
        sectionName: finalSectionName,
        class: `${finalClassName} ${finalSectionName}`.trim(),
      },
      marksData: [],
      rawText,
      mappingStatus: "pending" as const,
    };

    const storagePath = ocrPath;

    return {
      success: true,
      studentData: extractedData.studentData,
      marks: extractedData,
      storagePath,
      is_fallback: false,
      rawText,
    };
  }

  /**
   * Load the OCR markdown for a student from the active tenant workspace.
   * Returns null when no OCR record exists.
   */
  async getExtractedAssessment(studentId: number, examTypeId: number) {
    const student = await this.student().getStudentById(studentId);
    if (!student) return null;

    const rc = buildWorkspaceRequestContext(this.tenant);
    const fs = await resolveTenantFilesystem({ requestContext: rc as never });
    if (!fs) return null;

    // Scan exam-scoped ocr/ directory for any markdown content
    try {
      const ocrDir = `exams/examType-${examTypeId}/ocr/`;
      const entries = await fs.readdir(ocrDir);
      const ocrEntry = entries.find((e) => e.name.endsWith(".md") && e.type === "file");
      const entryPath = ocrEntry ? `${ocrDir}${ocrEntry.name}` : null;
      if (!entryPath) return null;

      const rawText = await fs.readFile(entryPath, { encoding: "utf-8" });
      const content = typeof rawText === "string" ? rawText : rawText.toString("utf-8");

      return {
        studentId,
        examTypeId,
        marksData: [],
        studentData: {
          fullName: student.fullName,
          className: student.className,
          sectionName: student.sectionName,
        },
        rawText: content,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Transforms raw mapping data into a concise Markdown lookup index for LLM reasoning.
 */
export function formatMappingDataToIndex(data: any): string {
  const lines: string[] = ["## Lookup Reference Index"];

  if (data.subjects) {
    lines.push("\n### Subjects");
    data.subjects.forEach((s: any) => {
      lines.push(`- ID ${s.subjectId}: ${s.subjectName} (${s.subjectCode})`);
    });
  }

  if (data.examTypes) {
    lines.push(`\n### Exam Term/Type\n- ID ${data.examTypes.id}: ${data.examTypes.title}`);
  }

  if (data.classSection) {
    lines.push(`\n### Current Class Context\n- Class: ${data.classSection.className}\n- Section: ${data.classSection.sectionName}`);
  }

  return lines.join("\n");
}

/**
 * Applies grading business logic and HTML formatting to the raw extracted JSON.
 */
export function applyGradingBusinessLogic(data: any, category: Category): any {
  if (!data.marksData) return data;

  const ranges = (category === "LOWERBASIC" || category === "MIDDLEBASIC" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS) as any;

  data.marksData = data.marksData.map((subject: any) => {
    if (subject.total !== undefined) {
      const score = subject.total;
      const match = ranges.find((r: any) => score >= r.min && score <= r.max);

      const label = match ? match.grade : "N/A";
      const color = match ? match.color : "bg-gray-200";

      subject.grade = `<span class="${color} text-violet-600 py-1 px-3 rounded-full text-xs">${label}</span>`;
    }
    return subject;
  });

  return data;
}

/**
 * Validates attendance consistency: daysPresent + daysAbsent MUST equal daysOpened.
 */
export function validateAttendance(attendance: any): any {
  if (!attendance) return attendance;

  const opened = Number(attendance.daysOpened || 0);
  const present = Number(attendance.daysPresent || 0);
  const absent = Number(attendance.daysAbsent || 0);

  if (opened > 0 && present + absent !== opened) {
    if (present <= opened) {
      attendance.daysAbsent = opened - present;
    } else {
      attendance.daysOpened = present + absent;
    }
  }

  return attendance;
}

export async function createAssessmentOcrServiceForRequest(
  tenant: TenantContext,
): Promise<AssessmentOcrService> {
  const { getDatabase } = await import("$lib/server/db");
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(db, tenant);
  return new AssessmentOcrService(provider, tenant);
}
