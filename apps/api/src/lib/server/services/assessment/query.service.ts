import type { Category, Marksheet } from "../../../schema/marksheet";
import { transcriptSchema, type Transcript } from "../../../schema/transcript";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { getGrade } from "../domain";
import { parseOrThrow } from "../validation";
import { buildMarksheet, parseAddress, toCategory } from "./marksheet-query";

export interface StudentResultParams {
  readonly id?: number;
  readonly examId: number;
  readonly isAdminNo?: boolean;
  readonly withImages?: boolean;
}

export interface TranscriptParams {
  readonly studentId: number;
  readonly academicId: number;
  readonly withImages?: boolean;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export class AssessmentQueryService {
  constructor(private readonly ctx: ServiceContext) {}

  async getStudentResult(params: StudentResultParams): Promise<Marksheet | null> {
    if (params.id === undefined || params.id <= 0 || params.examId <= 0) return null;
    return buildMarksheet(this.ctx, {
      studentId: params.id,
      examId: params.examId,
      byAdmissionNumber: params.isAdminNo ?? false,
      withImages: params.withImages ?? false
    });
  }

  async getTranscript(params: TranscriptParams): Promise<Transcript | null> {
    if (params.studentId <= 0 || params.academicId <= 0) return null;
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const details = await this.ctx.repos.queries.findStudentDetails(
      scoped,
      params.studentId
    );
    if (details === null) return null;

    const data = await this.ctx.repos.queries.getTranscriptData(
      scoped,
      params.studentId,
      params.academicId
    );
    if (data.terms.length === 0 || data.records.length === 0) return null;

    const category = toCategory(details.categoryName);
    const subjectMap = new Map<
      number,
      { subjectId: number; subject: string; subjectCode: string; marks: (number | null)[] }
    >();
    for (const record of data.records) {
      if (record.subjectId === null) continue;
      const slot = subjectMap.get(record.subjectId) ?? {
        subjectId: record.subjectId,
        subject: record.subjectName ?? "Unknown",
        subjectCode: record.subjectCode ?? "",
        marks: data.terms.map(() => null)
      };
      const termIndex = data.terms.findIndex((term) => term.id === record.examTypeId);
      if (termIndex >= 0) {
        slot.marks[termIndex] =
          record.totalMarks === null || record.totalMarks === undefined
            ? null
            : Number(record.totalMarks);
      }
      subjectMap.set(record.subjectId, slot);
    }

    const subjects = [...subjectMap.values()].map((slot) => {
      const numeric = slot.marks.filter((mark): mark is number => mark !== null);
      const total = numeric.reduce((sum, mark) => sum + mark, 0);
      const percentage = numeric.length > 0 ? round2(total / numeric.length) : 0;
      const grade = getGrade(percentage, category);
      return {
        subjectId: slot.subjectId,
        subject: slot.subject,
        subjectCode: slot.subjectCode,
        marks: slot.marks,
        total: round2(total),
        percentage,
        grade: grade.grade,
        color: grade.color
      };
    });
    if (subjects.length === 0) return null;

    const termMeans: number[] = [];
    if (details.classId !== null && details.sectionId !== null) {
      for (const term of data.terms) {
        const rows = await this.ctx.repos.assessments.getClassAverages(scoped, {
          classId: details.classId,
          sectionId: details.sectionId,
          examId: term.id
        });
        if (rows.length > 0) {
          termMeans.push(
            rows.reduce((sum, row) => sum + Number(row.average ?? 0), 0) / rows.length
          );
        }
      }
    }
    const classAverage =
      termMeans.length > 0
        ? round2(termMeans.reduce((sum, mean) => sum + mean, 0) / termMeans.length)
        : 0;
    const yearlyTotal = subjects.reduce((sum, subject) => sum + subject.total, 0);
    const yearlyAverage = subjects.length > 0 ? yearlyTotal / subjects.length : 0;
    const studentAverage =
      subjects.length > 0
        ? subjects.reduce((sum, subject) => sum + subject.percentage, 0) / subjects.length
        : 0;
    const address = parseAddress(data.school?.address ?? null);
    const reportSettings = await this.ctx.ports.reportSettings.get();

    const payload = {
      school: {
        id: scoped.tenant.schoolId,
        name: data.school?.schoolName ?? "School Name",
        email: data.school?.email ?? "",
        phone: data.school?.phone ?? "",
        city: address.city,
        state: address.state,
        title: data.academicYear?.title ?? "",
        vacation_date: new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric"
        })
      },
      student: {
        id: details.studentId,
        examTypeId: data.terms[0]?.id ?? 0,
        fullName: details.fullName ?? "",
        gender: details.genderName ?? "",
        parentEmail: details.email ?? "",
        parentName: details.guardiansName ?? "Unknown Parent",
        term: data.terms.map((term) => term.name).join(" / "),
        title: reportSettings.annualReportTitle,
        category,
        className: details.className ?? "",
        sectionName: details.sectionName ?? "",
        adminNo: details.admissionNo ?? 0,
        sessionYear:
          data.academicYear === null
            ? ""
            : `${data.academicYear.year}-[${data.academicYear.title}]`,
        daysOpened: 0,
        daysAbsent: 0,
        daysPresent: 0,
        token: `token-${details.studentId}-${params.academicId}`
      },
      academicYear: data.academicYear ?? {
        id: params.academicId,
        title: "",
        year: ""
      },
      terms: data.terms.map((term) => ({
        examTypeId: term.id,
        title: term.name,
        isAverage: false
      })),
      subjects,
      classAverage,
      studentAverage: round2(studentAverage),
      yearlyTotal: round2(yearlyTotal),
      yearlyAverage: round2(yearlyAverage),
      maxPossibleTotal: subjects.length * 100 * data.terms.length
    };

    return parseOrThrow(
      () => transcriptSchema.parseAsync(payload),
      "Transcript validation failed"
    );
  }

  async getObjectives(
    studentId: number,
    category: Category
  ): Promise<readonly { readonly id: number; readonly name: string | null }[]> {
    if (category !== "NURSERY") return [];
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.queries.findObjectives(scoped, studentId);
  }
}
