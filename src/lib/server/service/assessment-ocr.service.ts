/**
 * Assessment OCR Service — EdApex
 *
 * Owns the per-request OCR extraction pipeline that turns uploaded mark sheets
 * into a structured `ExtractedAssessment` shell ready for the result-mapper
 * agent (Slice 12) to finish mapping to a `ResultInput`.
 *
 * Pipeline (per file):
 *  1. Look up class/section names for storage path resolution
 *  2. Call `MistralOcrService.processDocument` — the same call the
 *     `extractionWorkflow` uses internally
 *  3. Persist OCR markdown via `TenantFileStorage` (per-tenant workspace)
 *  4. Build a partially-populated `ExtractedAssessment` shell. The
 *     full markdown → structured mapping requires the result-mapper agent;
 *     until then this method returns the OCR text + populated studentData
 *     shell so the UI can render the review form.
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
import { createTenantFileStorage, TenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";
import { mistralOcrService } from "./mistral-ocr.service";
import type { Category } from "$lib/schema/marksheet";
import { GRADE_RANGES } from "$lib/server/service/assessment.service";

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
  private readonly fileStorage: TenantFileStorage;

  constructor(provider: ScopedRepositoryProvider, fileStorage: TenantFileStorage) {
    this.provider = provider;
    this.fileStorage = fileStorage;
  }

  private result() {
    return this.provider.getRepo(ResultsRepository);
  }

  private student() {
    return this.provider.getRepo(StudentRepository);
  }

  /**
   * Run Mistral OCR on a single file and persist an `ExtractedAssessment`
   * shell to the tenant's `extracted/<studentName>/` folder. Returns null
   * when OCR produces no text (caller should treat as a hard failure).
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

    const identifier = studentId?.toString() || admissionNo?.toString() || fullName || "Unknown";
    const studentFolder = this.fileStorage.formatName(identifier);

    const fileName = originalName || "uploaded";
    const ocrResponse = await mistralOcrService.processDocument(file, fileName);
    const rawText = (ocrResponse as { pages?: Array<{ markdown?: string }> }).pages
      ?.map((p) => p.markdown ?? "")
      .filter(Boolean)
      .join("\n\n") || "";

    if (!rawText) {
      console.error("Extraction produced no OCR text for", fileName);
      return null;
    }

    await this.fileStorage.saveRawText(studentFolder, "ocr.md", rawText);

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

    const storagePath = await this.fileStorage.save(
      {
        data: extractedData as any,
        extractedAt: new Date(),
        verified: false,
        status: "extracted",
        originalName: originalName || "file.json",
      },
      Buffer.from(await file.arrayBuffer())
    );

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
   * Load the verified `ExtractedAssessment` for a student from the active
   * tenant workspace. Returns null when the file hasn't been approved or
   * no record exists for the student.
   */
  async getExtractedAssessment(studentId: number, _examId: number) {
    const student = await this.student().getStudentById(studentId);
    if (!student) return null;

    const studentFolder = this.fileStorage.formatName(student.fullName || "Unknown");
    const extracted = await this.fileStorage.load(studentFolder);
    if (!extracted || !extracted.verified) return null;

    return {
      studentId: extracted.data?.studentData?.studentId,
      examTypeId: extracted.data?.studentData?.examTypeId,
      marksData: extracted.data?.marksData?.map((m: any) => ({
        subjectCode: m.subjectCode,
        marks: m.marks,
        subjectName: m.subjectName,
        subjectId: m.subjectId,
        examTitles: m.examTitles,
      })),
      studentData: { ...extracted.data?.studentData },
      teachersRemark: extracted.data?.teachersRemark,
      studentRatings: extracted.data?.studentRatings,
    } as any;
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
  const fileStorage = await createTenantFileStorage(tenant);
  return new AssessmentOcrService(provider, fileStorage);
}
