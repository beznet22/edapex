import type { MarksheetAnnotation } from "../../../schema/marksheet-annotation";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";
import { matchStudent, validateMarksheetAnnotation } from "../domain";
import { extractOrGetCached } from "./ocr-extraction";
import type { OcrExtractionResult } from "./ocr-extraction";

export type CaptureStatus =
  | "uploaded"
  | "extracted"
  | "needs_review"
  | "confirmed"
  | "committed"
  | "failed";

export type CaptureMatchMethod = "slot" | "name" | "admission_no" | "manual";

export interface CaptureRow {
  readonly id: string;
  readonly schoolId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly academicId: number;
  readonly examTypeId: number;
  readonly studentId: number | null;
  readonly ocrContentSha256: string;
  readonly ocrParserVersion: string;
  readonly fileName: string;
  readonly uploadedBy: number;
  readonly status: CaptureStatus;
  readonly matchMethod: CaptureMatchMethod | null;
  readonly matchScore: number | null;
  readonly matchCandidatesJson: string | null;
  readonly ocrName: string | null;
  readonly ocrAdmissionNo: string | null;
  readonly ocrClassLabel: string | null;
  readonly ocrTerm: string | null;
  readonly ocrCategory: string | null;
  readonly validationJson: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly confirmedBy: number | null;
  readonly confirmedAt: number | null;
}

export interface CreateCaptureInput {
  readonly file: Blob;
  readonly fileName: string;
  readonly classId: number;
  readonly sectionId: number;
  readonly academicId: number;
  readonly examTypeId: number;
  readonly studentId?: number;
  readonly uploadedBy: number;
}

export interface CreateCaptureResult {
  readonly capture: CaptureRow;
  readonly extraction: OcrExtractionResult;
}

const classLabelOf = (annotation: MarksheetAnnotation): string | null => {
  const className = annotation.student.className ?? "";
  const sectionName = annotation.student.sectionName ?? "";
  const label = `${className}${sectionName}`.trim();
  return label.length === 0 ? null : label;
};

export class MarksheetCaptureService {
  constructor(private readonly ctx: ServiceContext) {}

  async createCapture(input: CreateCaptureInput): Promise<CreateCaptureResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (input.classId <= 0 || input.sectionId <= 0 || input.examTypeId <= 0) {
      throw new ValidationError("Class, section and exam type are required", "classId");
    }
    if (input.uploadedBy <= 0) {
      throw new ValidationError("A positive uploader id is required", "uploadedBy");
    }
    if (
      scoped.tenant.academicId !== null &&
      input.academicId !== scoped.tenant.academicId
    ) {
      throw new ValidationError("Academic year does not match the tenant context", "academicId");
    }

    const classSection = await this.ctx.repos.academics.findClassSectionById(
      scoped,
      input.classId,
      input.sectionId
    );
    if (classSection === null) {
      throw new ValidationError("Class section not found", "sectionId");
    }
    const subjects = await this.ctx.repos.academics.listSubjectsByClass(
      scoped,
      input.classId,
      input.sectionId
    );
    const expectedSubjects = subjects
      .map((subject) => subject.subjectCode)
      .filter((code): code is string => typeof code === "string" && code.length > 0);

    const extraction = await extractOrGetCached(this.ctx, {
      file: input.file,
      fileName: input.fileName
    });
    const annotation = extraction.annotation;
    const validation =
      annotation === null
        ? null
        : validateMarksheetAnnotation(annotation, {
            expectedSubjects,
            className: classSection.className,
            sectionName: classSection.sectionName,
            category: null
          });
    const validationJson =
      validation === null
        ? JSON.stringify({
            errors: [
              {
                code: "invalid_annotation",
                path: "annotation",
                message: "The OCR annotation is missing or does not match the schema",
                severity: "error"
              }
            ],
            warnings: [],
            computed: [],
            hasErrors: true
          })
        : JSON.stringify(validation);

    const roster = await this.ctx.ports.students.listRoster({
      classId: input.classId,
      sectionId: input.sectionId,
      academicId: input.academicId
    });

    let studentId: number | null = null;
    let status: CaptureStatus = "needs_review";
    let matchMethod: CaptureMatchMethod | null = null;
    let matchScore: number | null = null;
    let matchCandidatesJson: string | null = null;
    let confirmedBy: number | null = null;
    let confirmedAt: number | null = null;
    const now = this.ctx.ports.clock.now();

    if (input.studentId !== undefined) {
      if (!roster.some((entry) => entry.id === input.studentId)) {
        throw new ValidationError("Student is not in the class roster", "studentId");
      }
      studentId = input.studentId;
      matchMethod = "slot";
      matchScore = 1;
      confirmedBy = input.uploadedBy;
      confirmedAt = now;
      status = validation !== null && validation.hasErrors ? "needs_review" : "confirmed";
    } else if (annotation !== null) {
      const match = matchStudent(
        {
          fullName: annotation.student.fullName,
          admissionNo: annotation.student.admissionNo,
          classLabel: classLabelOf(annotation),
          category: annotation.student.category
        },
        roster,
        {
          className: classSection.className,
          sectionName: classSection.sectionName,
          category: null
        }
      );
      matchMethod = match.method;
      matchScore = match.score;
      matchCandidatesJson = JSON.stringify(match.candidates);
    }

    const existing = await this.ctx.repos.assessments.findCaptureByFile(scoped, {
      classId: input.classId,
      sectionId: input.sectionId,
      examTypeId: input.examTypeId,
      contentSha256: extraction.contentHash,
      parserVersion: extraction.parserVersion
    });
    if (existing !== null) {
      return { capture: existing, extraction };
    }

    const capture = await this.ctx.repos.assessments.createCapture(scoped, {
      id: crypto.randomUUID(),
      classId: input.classId,
      sectionId: input.sectionId,
      academicId: input.academicId,
      examTypeId: input.examTypeId,
      studentId,
      ocrContentSha256: extraction.contentHash,
      ocrParserVersion: extraction.parserVersion,
      fileName: input.fileName,
      uploadedBy: input.uploadedBy,
      status,
      matchMethod,
      matchScore,
      matchCandidatesJson,
      ocrName: annotation?.student.fullName ?? null,
      ocrAdmissionNo: annotation?.student.admissionNo ?? null,
      ocrClassLabel: annotation === null ? null : classLabelOf(annotation),
      ocrTerm: annotation?.student.term ?? null,
      ocrCategory: annotation?.student.category ?? null,
      validationJson,
      createdAt: now,
      updatedAt: now,
      confirmedBy,
      confirmedAt
    });

    return { capture, extraction };
  }

  async confirmCapture(
    captureId: string,
    studentId: number,
    confirmedBy: number
  ): Promise<CaptureRow> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const capture = await this.ctx.repos.assessments.findCaptureById(scoped, captureId);
    if (capture === null) {
      throw new ValidationError("Capture not found", "captureId");
    }
    if (capture.status === "committed") {
      throw new ValidationError("A committed capture cannot be rebound", "captureId");
    }
    const roster = await this.ctx.ports.students.listRoster({
      classId: capture.classId,
      sectionId: capture.sectionId,
      academicId: capture.academicId
    });
    if (!roster.some((entry) => entry.id === studentId)) {
      throw new ValidationError("Student is not in the class roster", "studentId");
    }
    const now = this.ctx.ports.clock.now();
    const updated = await this.ctx.repos.assessments.updateCapture(scoped, captureId, {
      studentId,
      status: "confirmed",
      matchMethod: "manual",
      matchScore: 1,
      confirmedBy,
      confirmedAt: now
    });
    if (updated === null) {
      throw new ValidationError("Capture could not be updated", "captureId");
    }
    return updated;
  }

  async listClassCaptures(
    classId: number,
    sectionId: number,
    examTypeId: number
  ): Promise<readonly CaptureRow[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.assessments.listCapturesForClassExam(
      scoped,
      classId,
      sectionId,
      examTypeId
    );
  }
}
