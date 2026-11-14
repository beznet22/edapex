import { getGrade } from "../domain";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { buildMarksheet } from "../assessment/marksheet-query";
import { buildTranscript } from "../assessment/transcript-builder";
import type {
  ArchiveDocument,
  ArchivePlacement,
  ArchiveRaw,
  ArchiveTermSnapshot,
  RawSummaryRow
} from "../../../schema/archive";
import { ARCHIVE_SCHEMA_VERSION } from "../../../schema/archive";

export interface CaptureStudentParams {
  readonly studentId: number;
  readonly academicId: number;
  readonly archivedAt: number;
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC"
] as const;

const monthYear = (iso: string | null): string => {
  if (iso === null) return "";
  const [year, month] = iso.split("-");
  const index = Number(month) - 1;
  const label = MONTHS[index];
  return label === undefined ? "" : `${label}/${year}`;
};

const termDisplay = (name: string, endsOn: string | null): string => {
  const suffix = monthYear(endsOn);
  return suffix.length === 0 ? name : `${name} EXAMINATION — ${suffix}`;
};

/**
 * Assembles the authoritative student-session document. Everything a 2030
 * reissue needs is snapshotted here; images stay keyed.
 */
export async function captureStudentSession(
  ctx: ServiceContext,
  params: CaptureStudentParams
): Promise<ArchiveDocument | null> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  if (scoped.tenant.academicId !== params.academicId) {
    return null;
  }

  const details = await ctx.repos.queries.findStudentDetails(scoped, params.studentId);
  if (details === null) return null;

  const transcript = await buildTranscript(ctx, {
    studentId: params.studentId,
    academicId: params.academicId
  });
  if (transcript === null) return null;

  const terms = await ctx.repos.queries.listSessionTerms(scoped, params.academicId);
  const termSnapshots: Record<string, ArchiveTermSnapshot> = {};
  const marksheets: ArchiveDocument["marksheets"] = {};
  for (const term of terms) {
    termSnapshots[String(term.id)] = {
      id: term.id,
      sequence: term.sequence,
      name: term.name,
      display: termDisplay(term.name, term.endsOn),
      startsOn: term.startsOn,
      endsOn: term.endsOn
    };
    const marksheet = await buildMarksheet(ctx, {
      studentId: params.studentId,
      examId: term.id
    });
    if (marksheet !== null) {
      marksheets[String(term.id)] = marksheet;
    }
  }
  if (Object.keys(marksheets).length === 0) return null;

  const academic = await ctx.repos.school.selectAcademicYearById(scoped, params.academicId);
  const placement: ArchivePlacement = {
    academicId: params.academicId,
    sessionLabel: academic?.year ?? "",
    classId: details.classId,
    className: details.className ?? "",
    sectionId: details.sectionId,
    sectionName: details.sectionName ?? ""
  };

  const assessment = await ctx.repos.assessments.readAssessmentRawRows(scoped, {
    studentId: params.studentId,
    academicId: params.academicId
  });
  const studentAttendance = await ctx.repos.attendance.readStudentAttendance(scoped, {
    studentId: params.studentId,
    academicId: params.academicId
  });
  const classAttendance = await ctx.repos.attendance.readClassAttendanceForStudent(scoped, {
    studentId: params.studentId,
    academicId: params.academicId
  });

  const summaries: RawSummaryRow[] = terms.flatMap((term) => {
    const marksheet = marksheets[String(term.id)];
    if (marksheet === undefined) return [];
    const total = marksheet.score?.total ?? null;
    const average = marksheet.score?.average ?? null;
    return [
      {
        id: 0,
        schoolId: scoped.tenant.schoolId,
        academicId: params.academicId,
        studentId: params.studentId,
        termId: term.id,
        sequence: term.sequence,
        total,
        average,
        grade: average === null ? null : getGrade(average, marksheet.student.category).grade,
        gpa: null,
        position: null,
        subjectCount: marksheet.records.length,
        createdAt: params.archivedAt
      }
    ];
  });

  const raw: ArchiveRaw = {
    marks: [...assessment.marks],
    results: [...assessment.results],
    ratings: [...assessment.ratings],
    remarks: [...assessment.remarks],
    studentAttendance: [...studentAttendance],
    classAttendance: [...classAttendance],
    summaries
  };

  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    meta: {
      schoolId: scoped.tenant.schoolId,
      sessionId: params.academicId,
      studentId: params.studentId,
      studentRecordId: details.studentRecordId,
      archivedAt: new Date(params.archivedAt * 1000).toISOString()
    },
    placement,
    terms: termSnapshots,
    marksheets,
    transcript,
    photoKey: details.studentPhoto,
    raw
  };
}
