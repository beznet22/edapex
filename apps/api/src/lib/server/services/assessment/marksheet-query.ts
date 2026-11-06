import {
  categoryEnum,
  type Category,
  type Marksheet
} from "../../../schema/marksheet";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { computeClassAverages, getGrade } from "../domain";

export interface BuildMarksheetParams {
  readonly studentId: number;
  readonly examId: number;
  readonly byAdmissionNumber?: boolean;
  readonly withImages?: boolean;
}

export const toCategory = (value: string | null): Category => {
  const parsed = categoryEnum.safeParse(value ?? "");
  return parsed.success ? parsed.data : "MIDDLEBASIC";
};

export const parseAddress = (address: string | null): { city: string; state: string } => {
  if (address === null || address.trim().length === 0) return { city: "", state: "" };
  const parts = address.split(",").map((part) => part.trim());
  const state = parts.pop() ?? "";
  const city = parts.pop() ?? "";
  return { city, state };
};

type ResultData = Awaited<ReturnType<ServiceContext["repos"]["queries"]["queryResultData"]>>;

const buildRecords = (
  data: ResultData,
  category: Category,
  objectives: readonly { readonly name: string | null }[]
): { records: Marksheet["records"]; overAll: number } => {
  if (category === "DAYCARE" && data.resultRecords.length > 0) {
    const records = data.resultRecords.map((result) => ({
      studentId: result.studentId ?? 0,
      subject: result.subjectName ?? "Learning Outcome",
      totalScore: 0,
      category,
      resultId: result.resultId,
      subjectId: result.subjectId ?? 0,
      markIds: [],
      titleIds: [],
      fullMarks: [],
      subjectCode: result.subjectCode ?? "",
      objectives: [],
      titles: [],
      marks: [],
      absent: [],
      grade: "",
      learningOutcome: result.teacherRemarks
    }));
    return { records, overAll: 0 };
  }

  const bySubject = new Map<string, ResultData["marks"]>();
  for (const mark of data.marks) {
    const key = mark.subjectName ?? "Unknown";
    const group = bySubject.get(key) ?? [];
    bySubject.set(key, [...group, mark]);
  }

  let overAll = 0;
  const records: Marksheet["records"] = [];
  for (const [subject, subjectMarks] of bySubject) {
    const totalScore = Math.ceil(
      subjectMarks.reduce((sum, mark) => sum + (mark.totalMarks || 0), 0)
    );
    const marksByName: Record<string, number> = {};
    const absentByName: Record<string, boolean> = {};
    for (const mark of subjectMarks) {
      const title = mark.examTitle ?? "Unknown";
      marksByName[title] = mark.totalMarks;
      absentByName[title] = mark.isAbsent === 1;
    }
    const first = subjectMarks[0];
    const objective = objectives.find((entry) => entry.name === first?.subjectCode);
    const matchingResult = data.resultRecords.find(
      (record) => record.subjectId === first?.subjectId
    );
    const grade = getGrade(totalScore, category);
    overAll += totalScore;
    records.push({
      studentId: first?.studentId ?? 0,
      subject,
      totalScore,
      category,
      resultId: matchingResult?.resultId ?? 0,
      subjectId: first?.subjectId ?? 0,
      markIds: subjectMarks.map((mark) => mark.markId),
      titleIds: subjectMarks.map(() => 0),
      fullMarks: subjectMarks.map((mark) => mark.examMark ?? 0),
      subjectCode: first?.subjectCode ?? "",
      objectives: [],
      titles: Object.keys(marksByName),
      marks: Object.values(marksByName),
      absent: Object.values(absentByName),
      grade: grade.grade,
      color: grade.color,
      ...(objective === undefined ? {} : { learningOutcome: null })
    });
  }
  return { records, overAll };
};

/** The shared read used by both the query service and the publisher. */
export async function buildMarksheet(
  ctx: ServiceContext,
  params: BuildMarksheetParams
): Promise<Marksheet | null> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const details = await ctx.repos.queries.findStudentDetails(
    scoped,
    params.studentId,
    params.byAdmissionNumber ?? false
  );
  if (details === null) return null;

  const data = await ctx.repos.queries.queryResultData(
    scoped,
    details.studentId,
    params.examId
  );
  if (data.classResults.length === 0) return null;

  const category = toCategory(details.categoryName);
  const objectives = await ctx.repos.queries.findObjectives(scoped, details.studentId);
  const { records, overAll } = buildRecords(data, category, objectives);
  const subjects = await ctx.repos.academics.listSubjectsByClass(
    scoped,
    details.classId ?? 0,
    details.sectionId ?? 0
  );
  const settings = (await ctx.repos.school.selectGeneralSettings(scoped))[0] ?? null;
  const reportSettings = await ctx.ports.reportSettings.get();
  const address = parseAddress(settings?.address ?? null);
  const attendance = data.attendance;

  return {
    school: {
      id: settings?.id ?? scoped.tenant.schoolId,
      name: settings?.schoolName ?? "School Name",
      phone: settings?.phone ?? "",
      email: settings?.email ?? "",
      city: address.city,
      state: address.state,
      title: data.examType?.name ?? "",
      vacation_date: new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
      })
    },
    student: {
      id: details.studentId,
      examTypeId: data.examType?.id ?? params.examId,
      fullName: details.fullName ?? "",
      gender: details.genderName ?? "",
      parentEmail: details.email ?? "",
      parentName: details.guardiansName ?? "Unknown Parent",
      term: data.examType?.name ?? "",
      title: reportSettings.termlyReportTitle,
      category,
      className: details.className ?? "",
      sectionName: details.sectionName ?? "",
      adminNo: details.admissionNo ?? 0,
      sessionYear:
        data.academic === null ? "" : `${data.academic.year}-[${data.academic.title}]`,
      daysOpened: attendance?.daysOpened ?? 0,
      daysAbsent: attendance?.daysAbsent ?? 0,
      daysPresent: attendance?.daysPresent ?? 0,
      token: `token-${details.studentId}-${params.examId}`
    },
    subjects: subjects.map((subject) => ({
      subjectId: subject.id,
      subjectCode: subject.subjectCode,
      teacherId: subject.teacherId
    })),
    records,
    score: {
      total: overAll,
      average: records.length > 0 ? Math.floor(overAll / records.length) : 0,
      classAverage: computeClassAverages(
        data.classResults.map((row) => ({
          studentId: row.studentId ?? 0,
          totalMarks: row.totalMarks
        }))
      ),
      maxScores: records.length * 100
    },
    ratings: data.ratings.map((rating) => ({
      attribute: rating.attribute,
      rate: rating.rate,
      remark: rating.remark,
      color: rating.color
    })),
    remark: { remark: data.remark?.remark ?? null },
    ...(data.examType === null
      ? {}
      : { examType: { id: data.examType.id, title: data.examType.name } }),
    recordId: details.studentRecordId
  };
}
