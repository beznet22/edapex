import {
  resultInputSchema,
  type Attendance,
  type MarkResponse,
  type MarksData,
  type MarksInput,
  type ResultInput,
  type StudentInput,
  type StudentRatings,
} from "$lib/schema/result-input";
import { AttributeRemark, EXAM_MARK_MAXIMUMS } from "$lib/constants/assessment";
import {
  categoryEnum,
  type Category,
  type MarksRecord,
  type School,
  type Student,
} from "$lib/schema/marksheet";
import type { Marksheet } from "$lib/schema/marksheet";
import { transcriptSchema, type Transcript } from "$lib/schema/transcript";
import { StudentRepository, ResultsRepository, TimelineRepository, StaffRepository } from "$lib/server/repository";
import { SettingsService } from "./settings.service";
import { ScopedRepositoryProvider } from "../mastra/scoped-repository";
import type { TenantContext } from "../mastra/tenant-context";
import type { ClassAverage, ExamSetup, MarkData, NewSmMarkStore, NewSmResultStore, ResultData, ScoreData } from "$lib/types/result-types";
import { base64url } from "jose";
import { ensureBase64Image } from "../helpers";

import type { NewExamSetup } from "$lib/types/result-types";

import { getDatabase, type MySQLDrizzleClient } from "../db";

export const GRADE_RANGES = {
  EYFS: [
    { min: 0, max: 80, grade: "EMERGING", color: "bg-purple-200" },
    { min: 81, max: 90, grade: "EXPECTED", color: "bg-blue-200" },
    { min: 91, max: 100, grade: "EXCEEDING", color: "bg-red-200" },
  ],
  GRADERS: [
    { min: 0, max: 69, grade: "E", color: "bg-red-200" },
    { min: 70, max: 76, grade: "D", color: "bg-orange-200" },
    { min: 77, max: 85, grade: "C", color: "bg-yellow-200" },
    { min: 86, max: 93, grade: "B", color: "bg-blue-200" },
    { min: 94, max: 100, grade: "A", color: "bg-purple-200" },
  ],
} as const;

type StudentData = {
  category: Category;
  studentId: number;
  recordId: number;
  classId: number;
  sectionId: number;
  schoolId: number;
  examTypeId: number;
};

// Local type for mark processing (now distinct from result summary ScoreData)
type MarkScoreData = {
  score: number;
  fullMarks: number;
  originalName?: string;
  isAbsent?: boolean;
};

export class AssessmentService {

  /**
   * SMTP Email Result matching email-job.ts EmailResult interface
   */
  static EmailResultSchema = {
    to: "" as string | undefined,
    messageId: "" as string | undefined,
    response: "" as string | undefined,
    studentId: 0 as number | undefined,
  };

  private readonly provider: ScopedRepositoryProvider;

  /**
   * Slice 10: the provider is required. Every callsite (API routes, page
   * server, remote functions, workflow Steps) must construct a per-request
   * AssessmentService via `createAssessmentServiceForRequest(tenant)`. The
   * legacy module-level `assessment` singleton is removed; the global
   * `studentRepo`/`resultRepo`/`timelineRepo`/`staffRepo` fallbacks are
   * also gone, because they leaked the first-seen TenantContext across
   * every subsequent request.
   */
  constructor(provider: ScopedRepositoryProvider) {
    if (!provider) {
      throw new Error(
        "AssessmentService requires a ScopedRepositoryProvider. " +
        "Use createAssessmentServiceForRequest(tenant) from API routes, page server, " +
        "remote functions, and workflow Steps.",
      );
    }
    this.provider = provider;
  }

  /**
   * Resolve a tenant-bound StudentRepository. Throws if the provider is
   * somehow unbound (defense in depth — constructor already enforces this).
   */
  protected student(): StudentRepository {
    return this.provider.getRepo(StudentRepository);
  }

  protected result(): ResultsRepository {
    return this.provider.getRepo(ResultsRepository);
  }

  protected timeline(): TimelineRepository {
    return this.provider.getRepo(TimelineRepository);
  }

  protected staff(): StaffRepository {
    return this.provider.getRepo(StaffRepository);
  }

  /** The active tenant's schoolId. Used to drop the hard-coded `schoolId: 1` from B1. */
  protected activeSchoolId(): number {
    return this.provider.getTenant().schoolId;
  }

  /**
   * Publish result to students and parents timeline and send email.
   * Now delegates to AssessmentPublisherService.
   */
  async publishResults(params: { studentIds: number[]; examId: number; resend?: boolean }) {
    const { createAssessmentPublisherServiceForRequest } = await import("./assessment-publisher.service");
    const publisher = await createAssessmentPublisherServiceForRequest(this.provider.getTenant());
    return publisher.publishResults(params);
  }

  /**
   * Check if result notification already exists for student and exam.
   * Now delegates to AssessmentPublisherService.
   */
  async isEmailAlreadySent(studentId: number, examId: number): Promise<boolean> {
    const { createAssessmentPublisherServiceForRequest } = await import("./assessment-publisher.service");
    const publisher = await createAssessmentPublisherServiceForRequest(this.provider.getTenant());
    return publisher.isEmailAlreadySent(studentId, examId);
  }

  async assignSubjects(classId: number, sectionId: number, teacherId?: number) {
    const academicId = await this.result().getAcademicId();

    // 1. Try to get subjects for this specific section first
    let assignedSubjects = await this.result().getAssignedSubjects(classId, sectionId);

    // 2. If empty, try to get subjects from any other section in the same class
    if (assignedSubjects.length === 0) {
      const allClassSections = await this.result().getClassSections();
      const parentSections = allClassSections.filter(s => s.classId === classId && s.sectionId !== sectionId);

      for (const section of parentSections) {
        if (section.sectionId) {
          const proxySubjects = await this.result().getAssignedSubjects(classId, section.sectionId);
          if (proxySubjects.length > 0) {
            assignedSubjects = proxySubjects;
            break;
          }
        }
      }
    }

    if (assignedSubjects.length === 0) return null;

    // 3. Prepare unique assignments to avoid duplicates
    const subjectMap = new Map<number, any>();
    assignedSubjects.forEach(s => {
      if (s.subjectId && !subjectMap.has(s.subjectId)) {
        subjectMap.set(s.subjectId, {
          classId,
          sectionId,
          academicId,
          teacherId: teacherId || s.teacherId,
          subjectId: s.subjectId,
          activeStatus: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    const assigned = Array.from(subjectMap.values());
    return await this.result().assignSubjects(assigned);
  }

  /**
   * Store student attendance for an exam
   */
  async upsertAttendance(params: { attendance: Attendance; studentId: number; examTypeId: number }, tx?: MySQLDrizzleClient) {
    const { attendance, studentId, examTypeId } = params;
    const data = {
      ...attendance,
      studentId,
      examTypeId,
    };
    await this.result().upsertClassAttendance(data, tx);
  }

  /**
   * Store teacher's remark for a student
   */
  async upsertTeacherRemark(params: { studentId: number; examTypeId: number; remark: string }, tx?: MySQLDrizzleClient) {
    const { studentId, examTypeId, remark } = params;
    const academicId = await this.result().getAcademicId();
    await this.result().upsertTeacherRemark({
      studentId,
      examTypeId,
      remark,
      academicId,
    }, tx);
  }

  /**
   * Store student ratings for a student
   */
  async upsertStudentRatings(params: { studentId: number; examTypeId: number; ratings: StudentRatings }, tx?: MySQLDrizzleClient) {
    const { studentId, examTypeId, ratings } = params;
    const academicId = await this.result().getAcademicId();
    await this.result().upsertStudentRatings(
      Object.entries(ratings)
        .map(([attribute, rating]) => {
          if (!rating) return null;
          return {
            studentId,
            examTypeId,
            attribute,
            rate: rating,
            remark: AttributeRemark[rating as keyof typeof AttributeRemark],
            academicId,
          };
        })
        .filter((r) => r !== null) as any[],
      tx
    );
  }

  /**
   * Store exam marks for a student from validated report data
   */
  async upsertStudentResult(validatedResult: ResultInput, staffId: number): Promise<MarkResponse> {
    const { studentData, marksData, teachersRemark, studentRatings } = validatedResult;
    const { studentId, classId, sectionId, recordId, examTypeId, studentCategoryId } = studentData;
    if (!studentId || !examTypeId) throw new Error("Student ID and Exam Type ID are required");

    return await this.result().db.transaction(async (tx: MySQLDrizzleClient) => {
      const category = categoryEnum.parse(studentData.studentCategory);

      const academicId = await this.result().getAcademicId();
      const schoolId = studentData.schoolId || 1;
      const sId = studentId || 0;
      const eTId = examTypeId || 0;

      if (!Number.isInteger(staffId) || staffId <= 0) {


        throw new Error("STAFF_ID_REQUIRED: requires a positive staffId (got " + String(staffId) + ")");


      }


      const approvingStaffId = staffId;

      const assignedSubjects = await this.result().getAssignedSubjects(classId, sectionId);
      const subjectTeacherMap = new Map<number, number>();
      assignedSubjects.forEach((s) => {
        if (s.subjectId && s.teacherId) subjectTeacherMap.set(s.subjectId, s.teacherId);
      });

      if (studentCategoryId) {
        await this.student().updateStudentCategoryId(studentId, studentCategoryId, tx);
      }

      const examSetups = await this.result().getExamSetupsByClassSection(classId, sectionId);

      await this.result().cleanMarks(
        {
          recordId: recordId || 0,
          studentId: sId,
          classId: classId,
          sectionId: sectionId,
          examTermId: eTId,
          schoolId,
        },
        tx
      );

      const batchData = await this.doProcessMarks(studentData, category, marksData, examSetups as ExamSetup[], tx);

      if (!batchData) {
        throw new Error("Failed to process marks.");
      }

      if (!batchData.marks.length && !batchData.results.length) {
        throw new Error("No marks or results were processed.");
      }

      await Promise.all([
        this.result().batchUpsertMarkRecords(batchData.marks, tx),
        this.result().batchUpsertResultRecords(batchData.results, tx),
      ]);

      if (studentRatings) {
        const ratingsToInsert = Object.entries(studentRatings)
          .filter(([_, value]) => value !== null)
          .map(([key, value]) => ({
            studentId: sId,
            examTypeId: eTId,
            attribute: key,
            rate: value as number,
            schoolId,
            academicId,
            activeStatus: 1,
          }));

        if (ratingsToInsert.length > 0) {
          await this.result().upsertStudentRatings(ratingsToInsert, tx);
        }
      }

      if (teachersRemark.comment) {
        const remarkTeacherId = approvingStaffId || subjectTeacherMap.values().next().value || 0;
        await this.result().upsertTeacherRemark(
          {
            teacherId: remarkTeacherId,
            studentId,
            examTypeId,
            remark: teachersRemark.comment,
            academicId,
          },
          tx
        );
      }

      if (studentData.attendance) {
        await this.upsertAttendance({
          attendance: studentData.attendance,
          studentId,
          examTypeId,
        }, tx);
      }

      return { studentId, examTypeId, results: batchData.marksInput };
    });
  }

  /**
   * Persist a fully-validated Marksheet artifact to the academic record. The
   * marksheet shape (school/student/records/ratings/remark) is unwrapped into
   * the same primitive write-set that {@link upsertStudentResult} produces:
   * cleanMarks → doProcessMarks → batchUpsertMarkRecords/Results, plus
   * ratings, teacher remark, attendance, and an sm_student_timelines audit.
   * The input `marksheet` is mutated so callers can read the resolved
   * `recordId` directly off the response.
   */
  async upsertMarksheet(marksheet: Marksheet, staffId: number): Promise<Marksheet> {
    const studentId = marksheet.student.id;
    const examTypeId = marksheet.examType?.id ?? marksheet.student.examTypeId;
    if (!studentId || !examTypeId) {
      throw new Error("Student ID and Exam Type ID are required");
    }

    const studentRecord = await this.student().getStudentById(studentId);
    if (!studentRecord) {
      throw new Error(`Student ${studentId} not found`);
    }

    const recordId = studentRecord.studentRecordId ?? 0;
    const classId = studentRecord.classId ?? 0;
    const sectionId = studentRecord.sectionId ?? 0;
    const schoolId = studentRecord.schoolId ?? this.activeSchoolId();
    const studentCategoryId = studentRecord.studentCategoryId ?? 0;

    if (!recordId || !classId || !sectionId || !studentCategoryId) {
      throw new Error(
        `Student ${studentId} is missing required class/section/record/category linkage`,
      );
    }

    return await this.result().db.transaction(async (tx: MySQLDrizzleClient) => {
      const category = categoryEnum.parse(marksheet.student.category);
      const academicId = await this.result().getAcademicId();
      if (!Number.isInteger(staffId) || staffId <= 0) {

        throw new Error("STAFF_ID_REQUIRED: requires a positive staffId (got " + String(staffId) + ")");

      }

      const approvingStaffId = staffId;

      const examSetups = await this.result().getExamSetupsByClassSection(classId, sectionId);

      await this.result().cleanMarks(
        {
          recordId,
          studentId,
          classId,
          sectionId,
          examTermId: examTypeId,
          schoolId,
        },
        tx,
      );

      const marksData: MarksData = marksheet.records.map((r) => ({
        subjectCode: r.subjectCode,
        subjectName: r.subject,
        subjectId: r.subjectId,
        learningOutcome: r.learningOutcome ?? null,
        examTitles: r.titles,
        marks: r.marks,
        total: r.totalScore,
        grade: r.grade,
      }));

      const studentData: StudentInput = {
        studentId,
        recordId,
        schoolId,
        admissionNo: studentRecord.admissionNo ?? marksheet.student.adminNo,
        fullName: marksheet.student.fullName,
        class: marksheet.student.className,
        classId,
        className: studentRecord.className ?? marksheet.student.className,
        sectionId,
        sectionName: studentRecord.sectionName ?? marksheet.student.sectionName,
        studentCategory: marksheet.student.category,
        studentCategoryId,
        term: marksheet.student.term,
        examTypeId,
        attendance: {
          daysOpened: marksheet.student.daysOpened,
          daysAbsent: marksheet.student.daysAbsent,
          daysPresent: marksheet.student.daysPresent,
        },
      };

      const batchData = await this.doProcessMarks(
        studentData,
        category,
        marksData,
        examSetups as ExamSetup[],
        tx,
      );

      if (!batchData) {
        throw new Error("Failed to process marks.");
      }

      if (!batchData.marks.length && !batchData.results.length) {
        throw new Error("No marks or results were processed.");
      }

      await Promise.all([
        this.result().batchUpsertMarkRecords(batchData.marks, tx),
        this.result().batchUpsertResultRecords(batchData.results, tx),
      ]);

      const ratingsToInsert = marksheet.ratings
        .filter(
          (r): r is { attribute: string; rate: number; remark: string | null; color: string | null } =>
            r.attribute !== null && r.rate !== null,
        )
        .map((r) => ({
          studentId,
          examTypeId,
          attribute: r.attribute,
          rate: r.rate,
          remark: r.remark,
          color: r.color,
          academicId,
        }));

      if (ratingsToInsert.length > 0) {
        await this.result().upsertStudentRatings(ratingsToInsert, tx);
      }

      if (marksheet.remark?.remark) {
        await this.result().upsertTeacherRemark(
          {
            teacherId: approvingStaffId,
            studentId,
            examTypeId,
            remark: marksheet.remark.remark,
            academicId,
          },
          tx,
        );
      }

      await this.result().upsertClassAttendance(
        {
          studentId,
          examTypeId,
          daysOpened: marksheet.student.daysOpened,
          daysAbsent: marksheet.student.daysAbsent,
          daysPresent: marksheet.student.daysPresent,
          schoolId,
          academicId,
        },
        tx,
      );

      await this.timeline().createTimelineIfNotExist({
        staffStudentId: studentId,
        title: "Marksheet committed",
        description: `Marksheet for ${marksheet.student.fullName} committed`,
        type: `exam-${examTypeId}`,
        visibleToStudent: 0,
        activeStatus: 1,
        createdBy: approvingStaffId,
        updatedBy: approvingStaffId,
        schoolId,
        date: new Date().toISOString().slice(0, 10),
      });

      marksheet.recordId = recordId;
      return marksheet;
    });
  }

  /**
   * @param id id of the student
   * @param examId  exam term id
   * @param adminNo admission number of the student
   * @param withImages whether to include images in the response
   * @returns Marksheet
   */
  async getStudentResult(params: {
    id?: number;
    examId: number;
    isAdminNo?: boolean;
    withImages?: boolean;
  }): Promise<Marksheet | null> {
    const { id, examId, isAdminNo, withImages } = params;
    const studentData = isAdminNo
      ? await this.student().getStudentById(id, isAdminNo)
      : await this.student().getStudentById(id);

    if (!studentData) return null;
    const resultData = await this.result().queryResultData(studentData, examId);
    if (!resultData?.classResults?.length) return null;

    const { examType, academic, attendance, marks, ratings, remark, resultRecords } = resultData;

    const photo = withImages ? ensureBase64Image(studentData.studentPhoto || "", "/avatar.jpg") : undefined;
    const termlySettings = await new SettingsService(studentData.schoolId ?? this.activeSchoolId()).getReportSettings();
    const student: Student = {
      id: studentData.studentId,
      examTypeId: examType?.id || 0,
      fullName: studentData.fullName || "",
      gender: studentData.genderName || "",
      parentEmail: studentData.email || "",
      parentName: studentData.guardiansName || "Unknown Parent",
      term: examType?.title || "",
      title: termlySettings.termlyReportTitle,
      category: (studentData.categoryName as Category) || "MIDDLEBASIC",
      className: studentData.className || "",
      sectionName: studentData.sectionName || "",
      adminNo: studentData.admissionNo || 0,
      sessionYear: academic ? `${academic.year}-[${academic.title}]` : "",
      daysOpened: attendance?.daysOpened || 0,
      daysAbsent: attendance?.daysAbsent || 0,
      daysPresent: attendance?.daysPresent || 0,
      studentPhoto: photo,
      token: base64url.encode(JSON.stringify({ studentId: id, examId })),
    };
    const schoolData = (await this.result().getGeneralSettings())?.[0] || {};
    const address = this.parseAddress(schoolData?.address || "");
    const school: School = {
      id: schoolData?.id || 1,
      name: schoolData?.siteTitle || "School Name",
      phone: schoolData?.phone || "",
      logo: withImages
        ? ensureBase64Image(schoolData?.favicon || schoolData?.logo || "", "/school-logo.png")
        : undefined,
      email: schoolData?.email || "",
      city: address.city || "",
      state: address.state || "",
      title: examType?.title || "",
      vacation_date: new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };

    const objectives = await this.getObjectives(student);
    const { records, overAll } = this.buildMarksRecords(marks, objectives, student.category, resultRecords);
    const score: ScoreData = {
      total: overAll,
      average: records.length ? Math.floor(overAll / records.length) : 0,
      classAverage: await this.getClassAverages(resultData.classResults),
      maxScores: records.length * 100,
    };

    const subjects = await this.result().getAssignedSubjects(studentData.classId || 0, studentData.sectionId || 0);
    return {
      subjects,
      school,
      student,
      records,
      score,
      ratings,
      remark,
      examType,
      recordId: studentData.studentRecordId ?? null,
    };
  }

  /**
   * Compute a multi-term academic transcript for a student across every active,
   * non-averaged term of the given academic year. The result is a Zod-validated
   * Transcript payload that the Svelte template renders.
   */
  async getTranscript(params: {
    studentId: number;
    academicId: number;
    withImages?: boolean;
  }): Promise<Transcript | null> {
    const student = await this.student().getStudentById(params.studentId);
    if (!student) return null;

    const data = await this.result().getTranscriptData({
      student,
      academicId: params.academicId,
    });
    if (!data) return null;

    if (data.terms.length === 0) return null;

    const category = categoryEnum.parse(student.categoryName ?? "MIDDLEBASIC");

    type RawRecord = {
      studentId: number | null;
      examTypeId: number | null;
      subjectId: number | null;
      subjectName: string | null;
      subjectCode: string | null;
      totalMarks: number | null;
      totalGpaGrade: string | null;
    };

    const subjectMap = new Map<number, {
      subjectId: number;
      subject: string;
      subjectCode: string;
      marks: Array<number | null>;
      total: number;
      percentage: number;
    }>();

    for (const rec of data.records as RawRecord[]) {
      if (rec.subjectId === null) continue;
      const slot = subjectMap.get(rec.subjectId) ?? {
        subjectId: rec.subjectId,
        subject: rec.subjectName ?? "Unknown",
        subjectCode: rec.subjectCode ?? "",
        marks: data.terms.map(() => null as number | null),
        total: 0,
        percentage: 0,
      };
      const termIndex = data.terms.findIndex((t) => t.id === rec.examTypeId);
      if (termIndex >= 0) {
        slot.marks[termIndex] = rec.totalMarks !== null ? Number(rec.totalMarks) : null;
      }
      subjectMap.set(rec.subjectId, slot);
    }

    const subjects = Array.from(subjectMap.values()).map((s) => {
      const numericMarks = s.marks.filter((m): m is number => m !== null);
      const total = numericMarks.reduce((sum, m) => sum + m, 0);
      const termCount = numericMarks.length;
      const percentage = termCount > 0 ? Math.round((total / termCount) * 100) / 100 : 0;
      const grade = this.getGrade(percentage, category);
      return {
        subjectId: s.subjectId,
        subject: s.subject,
        subjectCode: s.subjectCode,
        marks: s.marks,
        total: Math.round(total * 100) / 100,
        percentage: Math.round(percentage * 100) / 100,
        grade: grade.grade,
        color: grade.color,
      };
    });

    const yearlyTotal = subjects.reduce((sum, s) => sum + s.total, 0);
    const yearlyAverage = subjects.length > 0 ? yearlyTotal / subjects.length : 0;
    const maxPossibleTotal = subjects.length * 100 * data.terms.length;

    const studentAverage = subjects.length > 0
      ? subjects.reduce((sum, s) => sum + s.percentage, 0) / subjects.length
      : 0;

    const termMeans: number[] = [];
    for (const term of data.terms) {
      const perTermAverages = await this.result().getClassAverages({
        classId: student.classId ?? 0,
        sectionId: student.sectionId ?? 0,
        examId: term.id,
      });
      if (perTermAverages.length > 0) {
        const sum = perTermAverages.reduce((s, r) => s + Number(r.average ?? 0), 0);
        termMeans.push(sum / perTermAverages.length);
      }
    }
    const classAverage = termMeans.length > 0
      ? Math.round((termMeans.reduce((a, b) => a + b, 0) / termMeans.length) * 100) / 100
      : 0;

    const generalSettings = await this.result().getGeneralSettings();
    const schoolRow = generalSettings[0];
    const school = {
      id: schoolRow?.id ?? 1,
      name: schoolRow?.siteTitle ?? "School Name",
      email: schoolRow?.email ?? "",
      phone: schoolRow?.phone ?? "",
      logo: params.withImages
        ? ensureBase64Image(schoolRow?.favicon ?? schoolRow?.logo ?? "", "/school-logo.png")
        : undefined,
      city: "",
      state: "",
      title: data.academicYear?.title ?? "",
      vacation_date: new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };

    const studentPayload = {
      id: student.studentId,
      examTypeId: data.terms[0]?.id ?? 0,
      fullName: student.fullName ?? "",
      gender: student.genderName ?? "",
      parentEmail: student.email ?? "",
      parentName: student.guardiansName ?? "Unknown Parent",
      term: data.terms.map((t) => t.title).join(" / "),
      title: (await new SettingsService(student.schoolId ?? this.activeSchoolId()).getReportSettings()).annualReportTitle,
      category: student.categoryName ?? "MIDDLEBASIC",
      className: student.className ?? "",
      sectionName: student.sectionName ?? "",
      adminNo: student.admissionNo ?? 0,
      sessionYear: data.academicYear ? `${data.academicYear.year}-[${data.academicYear.title}]` : "",
      daysOpened: 0,
      daysAbsent: 0,
      daysPresent: 0,
      studentPhoto: params.withImages
        ? ensureBase64Image(student.studentPhoto ?? "", "/avatar.jpg")
        : undefined,
      token: base64url.encode(JSON.stringify({ studentId: student.studentId, academicId: params.academicId })),
    };

    const transcript = transcriptSchema.parse({
      school,
      student: studentPayload,
      academicYear: data.academicYear ?? { id: params.academicId, title: "", year: "" },
      terms: data.terms.map((t) => ({ examTypeId: t.id, title: t.title ?? "", isAverage: Boolean(t.isAverage) })),
      subjects,
      classAverage,
      studentAverage: Math.round(studentAverage * 100) / 100,
      yearlyTotal: Math.round(yearlyTotal * 100) / 100,
      yearlyAverage: Math.round(yearlyAverage * 100) / 100,
      maxPossibleTotal,
    });

    return transcript;
  }

  private buildMarksRecords(
    marks: MarkData[],
    objectives: any[],
    category: Category,
    resultRecords?: Array<{
      studentId: number | null;
      resultId: number;
      subjectId: number | null;
      subjectName: string | null;
      subjectCode: string | null;
      teacherRemarks: string | null;
    }>
  ): { records: MarksRecord[]; overAll: number } {
    // Special handling for DAYCARE when marks is empty
    if (category === "DAYCARE" && resultRecords && resultRecords.length > 0) {
      const records = resultRecords.map((result) => ({
        studentId: result.studentId || 0,
        subject: result.subjectName || "Learning Outcome",
        totalScore: 0,
        category,
        resultId: result.resultId,
        subjectId: result.subjectId || 0,
        markIds: [],
        titleIds: [],
        fullMarks: [],
        subjectCode: result.subjectCode || "",
        objectives: [],
        titles: [],
        marks: [],
        grade: "",
        color: undefined,
        learningOutcome: result.teacherRemarks,
      }));
      return { records, overAll: 0 };
    }

    const bySubject: Record<string, MarkData[]> = {};
    for (const m of marks) {
      const key = m.subjectName || "Unknown";
      if (!bySubject[key]) bySubject[key] = [];
      bySubject[key].push(m);
    }

    let overAll = 0;
    const records = Object.entries(bySubject).map(([subject, sMarks]) => {
      const totalScore = Math.ceil(sMarks.reduce((s: number, m: MarkData) => s + (m.totalMarks || 0), 0));
      const marksObj: Record<string, number> = {};
      for (const m of sMarks) marksObj[m.examTitle || "Unknown"] = m.totalMarks;
      const first = sMarks[0];
      const obj = objectives?.find((o) => o.subjectCode === first?.subjectCode);
      const matchingResult = resultRecords?.find((r) => r.subjectId === first?.subjectId);
      const grade = this.getGrade(totalScore, category);
      overAll += totalScore;
      return {
        studentId: first?.studentId || 0,
        subject,
        totalScore,
        category,
        resultId: matchingResult?.resultId || 0,
        subjectId: first?.subjectId || 0,
        markIds: sMarks.map((m: MarkData) => m.markId || 0),
        titleIds: sMarks.map((m: MarkData) => m.titleId || 0),
        fullMarks: sMarks.map((m: MarkData) => m.examMark || 0),
        subjectCode: first?.subjectCode || "",
        objectives: obj?.text?.split("|").map((s: string) => s.trim()) || ([] as string[]),
        titles: Object.keys(marksObj),
        marks: Object.values(marksObj),
        grade: grade.grade,
        color: grade.color,
      };
    });
    return { records, overAll };
  }

  /**
   * Slice 13c: tenant-scoped passthroughs for the read-only accessors
   * the layout server, remote functions, and publish workflow need.
   * These are thin wrappers around the protected repo accessors so
   * callers do not have to import the legacy `studentRepo`/`resultRepo`/
   * `staffRepo` module-level singletons.
   */
  async getClassSections() {
    return this.result().getClassSections();
  }

  async getAssignedClassSection(
    params: { staffId?: number; classId?: number; sectionId?: number } = {}
  ) {
    return this.result().getAssignedClassSection(params);
  }

  async getStaffByClassSection(params: { classId: number; sectionId: number }) {
    return this.staff().getStaffByClassSection(params);
  }

  async getStudentsByStaffId(staffId?: number) {
    return this.student().getStudentsByStaffId(staffId);
  }

  async getStudentsByClassSection(params: { classId: number; sectionId: number }) {
    return this.student().getStudentsByClassSection(params);
  }

  async getMappingData(classId: number, sectionId: number) {
    const [examTypes, studentCategories, subjects, classSection] = await Promise.all([
      this.result().getCurrentTerm(),
      this.result().getStudentCategories(),
      this.result().getSubjectsByClass(classId, sectionId),
      this.result().getAssignedClassSection({ classId, sectionId }),
    ]);

    const examSetups = await this.result().getExamSetupsByClassSection(classId, sectionId);

    return {
      examSetups,
      examTypes,
      studentCategories,
      subjects,
      classSection,
      studentData: {},
    };
  }

  async doProcessMarks(
    student: StudentInput,
    category: Category,
    markStore: MarksData,
    examSetups: ExamSetup[],
    tx?: MySQLDrizzleClient
  ): Promise<{
    marks: NewSmMarkStore[];
    results: NewSmResultStore[];
    marksInput: MarksInput[];
  } | null> {
    const academicId = await this.result().getAcademicId();
    const schoolId = student.schoolId || 1;
    const { classId, sectionId, studentId, recordId, examTypeId } = student;
    if (!classId || !sectionId || !studentId || !examTypeId) return null;

    const marksToInsert = [];
    const resultsToInsert = [];
    const marksInput: MarksInput[] = [];

    const assignedSubjects = await this.result().getAssignedSubjects(classId, sectionId);
    const subjectTeacherMap = new Map<number, number>();
    assignedSubjects.forEach((s) => {
      if (s.subjectId && s.teacherId) subjectTeacherMap.set(s.subjectId, s.teacherId);
    });

    for (const store of markStore) {
      const subjectId = store.subjectId;
      const teacherId = subjectTeacherMap.get(subjectId) || 0;

      // Ensure Exam exists
      const examId = await this.result().createExamIfNotExist(
        {
          classId,
          sectionId,
          subjectId,
          examTypeId,
          academicId,
          schoolId,
          activeStatus: 1,
        },
        tx
      );

      if (!examId) continue;

      let totalSubjectMarks = 0;
      let totalSubjectFullMarks = 0;

      // DAYCARE Handling
      if (category === "DAYCARE") {
        resultsToInsert.push({
          studentRecordId: recordId,
          studentId,
          classId,
          sectionId,
          subjectId,
          examId,
          examTypeId,
          totalMarks: 0,
          teacherRemarks: store.learningOutcome || null,
          academicId,
          schoolId,
          activeStatus: 1,
        });

        marksInput.push({
          subjectId,
          examTypeId,
          marks: 0,
          fullMarks: 0,
          totalMarks: 0,
          percentage: 0,
          grade: "",
          gpa: 0,
          isAbsent: false,
          teacherRemarks: store.learningOutcome || undefined
        });

        continue;
      }

      // Graded Assessment Handling
      if (store.examTitles && store.marks) {
        for (let i = 0; i < store.examTitles.length; i++) {
          const title = store.examTitles[i];
          const score = store.marks[i] || 0;
          const maxMarks = EXAM_MARK_MAXIMUMS[category];
          const fullMarks = maxMarks?.[title.toUpperCase()] ?? 100;

          const examSetupId = this.findExamSetupId(examSetups, subjectId, title, examId);

          let finalSetupId = examSetupId;
          if (!finalSetupId) {
            finalSetupId = await this.result().upsertExamSetup(
              {
                examTitle: title,
                examId,
                examTermId: examTypeId,
                subjectId,
                classId,
                sectionId,
                examMark: fullMarks,
                academicId,
                schoolId,
                activeStatus: 1,
              },
              tx
            );
          }

          marksToInsert.push({
            studentRecordId: recordId,
            studentId,
            classId,
            sectionId,
            subjectId,
            examTermId: examTypeId,
            examSetupId: finalSetupId,
            totalMarks: score,
            isAbsent: 0,
            academicId,
            schoolId,
            teacherId,
            activeStatus: 1,
          });

          totalSubjectMarks += score;
          totalSubjectFullMarks += fullMarks;
        }
      }

      resultsToInsert.push({
        studentRecordId: recordId,
        studentId,
        classId,
        sectionId,
        subjectId,
        examId,
        examTypeId,
        totalMarks: totalSubjectMarks,
        academicId,
        schoolId,
        activeStatus: 1,
      });

      marksInput.push({
        subjectId,
        examTypeId,
        marks: totalSubjectMarks,
        fullMarks: totalSubjectFullMarks,
        totalMarks: totalSubjectMarks,
        percentage: this.subjectPercentageMark(totalSubjectMarks, totalSubjectFullMarks),
        grade: this.getGrade(
          this.subjectPercentageMark(totalSubjectMarks, totalSubjectFullMarks),
          category
        ).grade,
        gpa: 0,
        isAbsent: false
      });
    }

    return { marks: marksToInsert, results: resultsToInsert, marksInput };
  }

  async getClassAverages(classResults: ResultData[]): Promise<ClassAverage> {
    const resultByStudent = classResults.reduce((acc: Record<string, ResultData[]>, result: ResultData) => {
      const studentId = String(result.studentId || "0");
      if (!acc[studentId]) {
        acc[studentId] = [];
      }
      acc[studentId].push(result);
      return acc;
    }, {} as Record<string, ResultData[]>);

    const studentAverages = Object.entries(resultByStudent).map(([studentId, results]) => {
      const totalMarks = results.reduce((sum: number, r: ResultData) => sum + (r.totalMarks || 0), 0);
      const avg = results.length ? Math.fround(totalMarks / results.length) : 0;
      return { studentId: parseInt(studentId), average: avg };
    });

    if (studentAverages.length === 0) {
      return { min: { studentId: 0, value: "0.00" }, max: { studentId: 0, value: "0.00" } };
    }

    const minAvg = Math.min(...studentAverages.map((s) => s.average));
    const maxAvg = Math.max(...studentAverages.map((s) => s.average));

    const minStudent = studentAverages.find((s) => s.average === minAvg) || studentAverages[0];
    const maxStudent = studentAverages.find((s) => s.average === maxAvg) || studentAverages[0];

    return {
      min: { studentId: minStudent.studentId, value: minAvg.toFixed(0) },
      max: { studentId: maxStudent.studentId, value: maxAvg.toFixed(0) },
    };
  }

  async getObjectives(student: Student) {
    if (student.category !== "NURSERY") return [];
    return await this.result().getObjectives(student);
  }

  findExamSetupId(
    examSetups: ExamSetup[],
    subjectId: number,
    examTitle: string,
    examId?: number
  ): number | null {
    const subjectSetups = examSetups.filter(
      (setup) =>
        setup.subjectId === subjectId &&
        (examId === undefined || setup.examId === examId)
    );

    if (subjectSetups.length === 0) return null;
    if (!examTitle) return subjectSetups[0].id;

    const normalizedTitle = examTitle.trim().toLowerCase();

    // 1. Exact match
    let match = subjectSetups.find(
      (s) => s.examTitle?.trim().toLowerCase() === normalizedTitle
    );

    // 2. Fallback to includes
    if (!match) {
      match = subjectSetups.find(
        (s) => s.examTitle?.trim().toLowerCase().includes(normalizedTitle)
      );
    }

    return match?.id || null;
  }

  subjectPercentageMark(obtainedMark: number, fullMark: number): number {
    if (fullMark === 0) return 0;
    return Math.round((obtainedMark / fullMark) * 10000) / 100;
  }

  getGrade(score: number, category: Category): { grade: string; color?: string } {
    const ranges = (category === "LOWERBASIC" || category === "MIDDLEBASIC" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS) as any;
    const match = ranges.find((r: any) => score >= r.min && score <= r.max);
    return match ? { grade: match.grade, color: match.color } : { grade: "N/A", color: "bg-gray-200" };
  }

  private parseAddress(address: string) {
    const parts = address.split(",").map((p) => p.trim());
    const state = parts.pop() || null;
    const city = parts.pop() || null;
    const street = parts.join(", ");
    const m = /No\.\s*(\d+)\s*(.+)/i.exec(street);
    return { street_number: m?.[1] || null, street_name: m?.[2] || street || null, city, state };
  }
}

/**
 * Slice 10: per-request factory. Use this from any caller that previously
 * imported the module-level `assessment` singleton. The factory builds a
 * fresh ScopedRepositoryProvider bound to the supplied tenant, then hands
 * it to a new AssessmentService. The provider — and the cache it owns
 * (see Slice 9) — dies with the request.
 *
 * Pass a fully-formed TenantContext (e.g. from createTenantContext or the
 * `tenantContext` value already on a workflow Step input). If you have
 * raw fields (schoolId, userId, ...), construct the tenant first.
 */
export async function createAssessmentServiceForRequest(
  tenant: TenantContext,
): Promise<AssessmentService> {
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(db, tenant);
  return new AssessmentService(provider);
}
