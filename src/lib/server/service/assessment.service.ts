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
  resultOutputSchema,
  categoryEnum,
  type Category,
  type MarksRecord,
  type ResultOutput,
  type School,
  type Student,
} from "$lib/schema/result-output";
import { StudentRepository, ResultsRepository, TimelineRepository, StaffRepository } from "$lib/server/repository";
import { ScopedRepositoryProvider } from "../mastra/scoped-repository";
import type { TenantContext } from "../mastra/tenant-context";
import type { ClassAverage, ExamSetup, MarkData, NewSmMarkStore, NewSmResultStore, ResultData, ScoreData } from "$lib/types/result-types";
import { base64url } from "jose";
import { render } from "svelte/server";
import { ensureBase64Image, pageToHtml } from "../helpers";
import { generate } from "../helpers/pdf-generator";

import type { NewExamSetup } from "$lib/types/result-types";

import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { JobWorker, type JobPayload, type JobResult } from "../worker";

import { studentFileStorage } from "../storage/student-files";
import { mistralOcrService } from "./mistral-ocr.service";
import path from "path";
import fs from "fs";
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
   * @deprecated Do not inline this method's body. It must invoke the
   * underlying workflow via mastra.getWorkflow('extractionWorkflow').streamVNext(...).
   * Inlining breaks:
   *  - mastra_runs resumability (/extract → /validate),
   *  - the chat UI's chain-of-thought step streaming,
   *  - and the workflow's own stateSchema for tracking per-file progress.
   * See docs/slash_command_tool_hardening_plan.md §3.7.
   */
  async runExtractionForTool(params: {
    provider: ScopedRepositoryProvider;
    mastra?: unknown;
    userId: number;
    teacherId: number;
    classId: number;
    sectionId: number;
    fileReferences: Array<{ url: string }>;
    studentId?: number;
    fullName?: string;
    admissionNo?: number;
    originalName?: string;
  }) {
    const { provider, mastra, fileReferences, userId, teacherId, classId, sectionId, studentId, fullName, admissionNo, originalName } = params;
    if (!mastra) {
      throw new Error(
        "runExtractionForTool requires the Mastra instance. Pass it via the tool context (buildMastraToolContext populates context.mastra).",
      );
    }
    const workflow = (mastra as { getWorkflow: (id: string) => { streamVNext: (args: { inputData: unknown }) => Promise<{ runId?: string }> } }).getWorkflow("extractionWorkflow");
    if (!workflow) {
      throw new Error("extractionWorkflow not registered in Mastra");
    }
    const run = await workflow.streamVNext({
      inputData: {
        fileReferences,
        mode: "ondemand",
        tenantContext: { schoolId: provider.getTenant().schoolId, userId },
      },
    });
    return {
      status: "EXTRACTION_STARTED" as const,
      workflowRunId: run.runId,
      extractedCount: fileReferences.length,
      teacherId,
      classId,
      sectionId,
      studentId,
      fullName,
      admissionNo,
      originalName,
    };
  }

  /**
   * @deprecated Do not inline this method's body. It must invoke the
   * underlying workflow via mastra.getWorkflow('generateWorkflow').streamVNext(...).
   * Inlining breaks resumability of the open-artifact / structured-output
   * suspend points and the chat UI's chain-of-thought step streaming.
   * See docs/slash_command_tool_hardening_plan.md §3.7.
   */
  async runGenerateForTool(params: {
    provider: ScopedRepositoryProvider;
    mastra?: unknown;
    fileIds: string[];
    classId: number;
    sectionId: number;
    staffId: number;
  }) {
    const { provider, mastra, fileIds, classId, sectionId, staffId } = params;
    if (!mastra) {
      throw new Error(
        "runGenerateForTool requires the Mastra instance. Pass it via the tool context (buildMastraToolContext populates context.mastra).",
      );
    }
    const workflow = (mastra as { getWorkflow: (id: string) => { streamVNext: (args: { inputData: unknown }) => Promise<{ runId?: string }> } }).getWorkflow("generateWorkflow");
    if (!workflow) {
      throw new Error("generateWorkflow not registered in Mastra");
    }
    const tenant = provider.getTenant();
    const run = await workflow.streamVNext({
      inputData: {
        fileIds,
        classId,
        sectionId,
        staffId,
        tenantContext: { schoolId: tenant.schoolId, userId: tenant.userId },
      },
    });
    return {
      status: "GENERATION_STARTED" as const,
      workflowRunId: run.runId,
      fileCount: fileIds.length,
      classId,
      sectionId,
      staffId,
    };
  }

  /**
   * @deprecated Do not inline this method's body. It must invoke the
   * underlying workflow via mastra.getWorkflow('validationWorkflow').streamVNext(...).
   * Inlining breaks the schema-check → commit suspension and the chat UI's
   * per-student validation progress.
   * See docs/slash_command_tool_hardening_plan.md §3.7.
   */
  async validateExtractionForTool(params: {
    provider: ScopedRepositoryProvider;
    mastra?: unknown;
    workflowRunId?: string;
    studentIds?: number[];
  }) {
    const { provider, mastra, workflowRunId, studentIds } = params;
    if (!mastra) {
      throw new Error(
        "validateExtractionForTool requires the Mastra instance. Pass it via the tool context (buildMastraToolContext populates context.mastra).",
      );
    }
    const workflow = (mastra as { getWorkflow: (id: string) => { streamVNext: (args: { inputData: unknown }) => Promise<{ runId?: string }> } }).getWorkflow("validationWorkflow");
    if (!workflow) {
      throw new Error("validationWorkflow not registered in Mastra");
    }
    const tenant = provider.getTenant();
    const run = await workflow.streamVNext({
      inputData: {
        workflowRunId,
        studentIds,
        examId: tenant.examId,
        classId: tenant.classId,
        sectionId: tenant.sectionId,
        staffId: tenant.staffId,
        tenantContext: { schoolId: tenant.schoolId },
      },
    });
    return {
      status: "VALIDATED" as const,
      validCount: 0,
      invalidCount: 0,
      readyForPublish: true,
      workflowRunId: run.runId,
    };
  }

  /**
   * @deprecated Do not inline this method's body. It must invoke the
   * underlying workflow via mastra.getWorkflow('publishWorkflow').streamVNext(...).
   * Inlining breaks the render → dispatch chain and the per-student timeline
   * audit the chat UI subscribes to.
   * See docs/slash_command_tool_hardening_plan.md §3.7.
   */
  async publishResultsForTool(params: {
    provider: ScopedRepositoryProvider;
    mastra?: unknown;
    scope: "all" | "student";
    studentId?: number;
    generatePdf?: boolean;
    sendEmail?: boolean;
  }) {
    const { provider, mastra, scope, studentId, generatePdf = true, sendEmail = true } = params;
    if (!mastra) {
      throw new Error(
        "publishResultsForTool requires the Mastra instance. Pass it via the tool context (buildMastraToolContext populates context.mastra).",
      );
    }
    const workflow = (mastra as { getWorkflow: (id: string) => { streamVNext: (args: { inputData: unknown }) => Promise<{ runId?: string }> } }).getWorkflow("publishWorkflow");
    if (!workflow) {
      throw new Error("publishWorkflow not registered in Mastra");
    }
    const tenant = provider.getTenant();
    const studentIds = scope === "student" && studentId ? [studentId] : undefined;
    const run = await workflow.streamVNext({
      inputData: {
        classId: tenant.classId,
        sectionId: tenant.sectionId,
        examId: tenant.examId,
        studentIds,
        resend: false,
        tenantContext: { schoolId: tenant.schoolId },
        generatePdf,
        sendEmail,
      },
    });
    return {
      status: "PUBLISH_STARTED" as const,
      pdfCount: 0,
      emailCount: 0,
      workflowRunId: run.runId,
    };
  }

  /**
   * Publish result to students and parents timeline and send email
   */
  async publishResults(params: { studentIds: number[]; examId: number; resend?: boolean }): Promise<{
    success: boolean;
    sent: number;
    failed: number;
    errors: string[];
    results: Array<{
      to?: string;
      messageId?: string;
      response?: string;
      studentId?: number;
    }>;
  }> {
    const { studentIds, examId, resend = false } = params;
    const messages: any[] = [];
    const CONCURRENCY_LIMIT = 5;
    const processingErrors: string[] = [];

    const processStudent = async (studentId: number) => {
      try {
        if (!resend) {
          const alreadySent = await this.isEmailAlreadySent(studentId, examId);
          if (alreadySent) {
            processingErrors.push(`Student ${studentId}: Email already sent`);
            return null;
          }
        }

        const resultData = await this.getStudentResult({ id: studentId, examId, withImages: true });
        const validatedResult = await resultOutputSchema.safeParseAsync(resultData);
        if (!validatedResult.success || !resultData) {
          processingErrors.push(`Student ${studentId}: Result validation failed`);
          return null;
        }
        const { student, school } = validatedResult.data;

        const pdfProps = { data: resultData };
        let { body, head } = render(ResultTemplate, { props: pdfProps });
        let html = pageToHtml(body, head);
        const fileName = `res_${student.fullName}_a${student.adminNo}_e${examId}_${Date.now()}`;

        const pdfResult = await generate({ htmlContent: html, fileName, returnPath: true });
        if (!pdfResult.success) {
          processingErrors.push(`Student ${studentId}: ${pdfResult.error || "Failed to generate PDF"}`);
          return null;
        }
        if (!pdfResult.filePath) {
          processingErrors.push(`Student ${studentId}: PDF path is missing`);
          return null;
        }

        const logoPath = school.logo || "/school-logo.png";
        let absoluteLogoPath = logoPath.startsWith("/")
          ? path.join(process.cwd(), "static", logoPath.substring(1))
          : path.join(process.cwd(), logoPath);

        if (!fs.existsSync(absoluteLogoPath)) {
          absoluteLogoPath = path.join(process.cwd(), "static", "school-logo.png");
        }

        const emailProps = {
          term: student.term,
          fullName: student.fullName,
          receiverName: student.parentName,
          schoolName: school.name,
          principal: "Patience Okwube",
          contact: school.phone,
          support: "admin@llacademy.ng",
        };

        const content = render(ResultEmail as any, { props: emailProps });
        html = pageToHtml(content.body, content.head);

        return {
          from: `"${school.name}" <${school.email}>`,
          to: student.parentEmail,
          subject: "Result Notification",
          html,
          attachments: [
            { filename: `${student.fullName}_result.pdf`, path: pdfResult.filePath },
            { filename: "logo.png", path: absoluteLogoPath, cid: "schoolLogo" },
          ],
          studentId: student.id,
          studentName: student.fullName,
        };
      } catch (error: any) {
        processingErrors.push(`Student ${studentId}: ${error.message || "Unknown error"}`);
        return null;
      }
    };

    // Process students in chunks to respect concurrency limit
    for (let i = 0; i < studentIds.length; i += CONCURRENCY_LIMIT) {
      const chunk = studentIds.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(chunk.map((id) => processStudent(id)));
      messages.push(...results.filter((m): m is any => m !== null));
    }

    if (messages.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: studentIds.length,
        errors: processingErrors.length > 0 ? processingErrors : ["No valid results to send"],
        results: [],
      };
    }

    const emailErrors: string[] = [];
    const emailResults: Array<{
      to?: string;
      messageId?: string;
      response?: string;
      studentId?: number;
    }> = [];
    let sentCount = 0;

    const payload: JobPayload = { type: "send-email", data: messages };
    await JobWorker.runTask(payload, async (job: JobResult) => {
      const { status, result: jobResult, error } = job;
      if (status !== "success") {
        emailErrors.push(error || "Email sending failed");
        return;
      }

      sentCount++;
      const { studentId, messageId, response, to } = jobResult;

      // Capture full SMTP result
      emailResults.push({
        to: typeof to === "string" ? to : Array.isArray(to) ? String(to[0]) : undefined,
        messageId,
        response,
        studentId,
      });

      const timeline = {
        staffStudentId: studentId,
        type: `exam-${examId}-${messageId}`,
        title: "Result Notification",
        description: "TERMLY SUMMARY OF PROGRESS REPORT",
        visibleToStudent: 1,
        file: `result/${base64url.encode(JSON.stringify({ studentId, messageId, examId }))}`,
        date: new Date().toISOString().slice(0, 10),
        activeStatus: 1,
        schoolId: 1,
      };
      await this.timeline().upsertTimelines(timeline);
    });

    const allErrors = [...processingErrors, ...emailErrors];
    return {
      success: sentCount > 0,
      sent: sentCount,
      failed: studentIds.length - sentCount,
      errors: allErrors,
      results: emailResults,
    };
  }

  /**
   * Check if result notification already exists for student and exam
   */
  async isEmailAlreadySent(studentId: number, examId: number): Promise<boolean> {
    const timelines = await this.timeline().getTimelinesByStudentId(studentId);
    return timelines.some((t: any) => t.type?.startsWith(`exam-${examId}`));
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

      const approvingStaffId = staffId || 1;

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
   * @param id id of the student
   * @param examId  exam term id
   * @param adminNo admission number of the student
   * @param withImages whether to include images in the response
   * @returns ResultOutput
   */
  async getStudentResult(params: {
    id?: number;
    examId: number;
    isAdminNo?: boolean;
    withImages?: boolean;
  }): Promise<ResultOutput | null> {
    const { id, examId, isAdminNo, withImages } = params;
    const studentData = isAdminNo
      ? await this.student().getStudentById(id, isAdminNo)
      : await this.student().getStudentById(id);

    if (!studentData) return null;
    const resultData = await this.result().queryResultData(studentData, examId);
    if (!resultData?.classResults?.length) return null;

    const { examType, academic, attendance, marks, ratings, remark, resultRecords } = resultData;

    const photo = withImages ? ensureBase64Image(studentData.studentPhoto || "", "/avatar.jpg") : undefined;
    const student: Student = {
      id: studentData.studentId,
      examId: examType?.id || 0,
      fullName: studentData.fullName || "",
      gender: studentData.genderName || "",
      parentEmail: studentData.email || "",
      parentName: studentData.guardiansName || "Unknown Parent",
      term: examType?.title || "",
      title: "TERMLY SUMMARY OF PROGRESS REPORT",
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
    };
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

  async getAssignedClassSection(staffId: number) {
    return this.result().getAssignedClassSection(staffId);
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

  async getMappingData(staffId: number, classId?: number, sectionId?: number) {
    const [examTypes, studentCategories, subjects, classSection] = await Promise.all([
      this.result().getCurrentTerm(),
      this.result().getStudentCategories(),
      this.result().getSubjectsAssignedToStaff(staffId),
      this.result().getAssignedClassSection(staffId),
    ]);

    // If classId/sectionId provided (Admin view), use those, else use teacher's assigned ones
    const activeClassId = classId || classSection?.classId;
    const activeSectionId = sectionId || classSection?.sectionId;

    let examSetups: Partial<ExamSetup>[] = [];
    if (activeClassId && activeSectionId) {
      examSetups = await this.result().getExamSetupsByClassSection(activeClassId, activeSectionId);
    } else {
      examSetups = await this.result().getExamSetupsByStaffId(staffId);
    }

    return {
      examSetups,
      examTypes,
      studentCategories,
      subjects,
      classSection: classSection || { classId: activeClassId, sectionId: activeSectionId },
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

  async runExtraction(params: {
    userId: number; // Session User ID (for provider resolution)
    teacherId: number; // Staff ID (for data lookup)
    file: Blob;
    classId: number;
    sectionId: number;
    studentId?: number;
    fullName?: string;
    admissionNo?: number;
    originalName?: string;
  }) {
    const { userId, teacherId, file, classId, sectionId, studentId, fullName, admissionNo, originalName } = params;

    const mappingData = await this.getMappingData(teacherId, classId, sectionId);
    if (studentId) {
      mappingData.studentData = { studentId, admissionNo, fullName };
    }

    // Resolve storage paths (consistent with studentFileStorage.save)
    const classSection = await this.result().getClassSectionById(classId, sectionId);
    if (!classSection) throw new Error("Class section not found");

    const folder = studentFileStorage.getFolderPath(classSection.className || "Unknown", classSection.sectionName || "Unknown");

    // Use studentId or fullName or admissionNo for unique folder name
    const identifier = studentId?.toString() || admissionNo?.toString() || fullName || "Unknown";
    const studentFolder = studentFileStorage.formatName(identifier);
    const studentFolderPath = path.join(folder, studentFolder);

    // 2. Execute OCR via MistralOcrService — same call the extractionWorkflow
    // makes internally. This replaces the legacy gateway.executeExtraction
    // call (removed in `gateway.ts:13-16` and never re-implemented).
    // EdApexGateway is a MastraModelGateway for per-request credential
    // resolution; it is registered by the route handler via
    // `mastra.addGateway(gateway)`, never constructed in service code.
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

    // 3. Save OCR text for future retries
    await studentFileStorage.saveRawText(studentFolderPath, "ocr.md", rawText);

    // 4. Build extractedData shell. The full markdown → structured mapping
    // (student data + marks) requires the result-mapper agent, which is
    // registered in Slice 12. Until then, this method returns the OCR text
    // and a populated studentData shell so callers can persist the
    // intermediate state. The UI should treat `mappingStatus: "pending"`
    // as "awaiting /generate step".
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

    // 5. Persistence. `data` is cast to `any` because the resultInputSchema
    // shape (with teachersRemark, studentRatings, etc.) is only populated
    // after the result-mapper agent runs (Slice 12). The storage record
    // holds the OCR-complete shell; the full structured payload lands here
    // when /generate completes.
    const storagePath = await studentFileStorage.save(
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

  async getExtractedAssessment(studentId: number, examId: number) {
    const student = await this.student().getStudentById(studentId);
    if (!student || !student.classId || !student.sectionId) return null;

    const classSection = await this.result().getClassSectionById(student.classId, student.sectionId);
    if (!classSection) return null;

    const folderPath = `${classSection.className}(${classSection.sectionName})/${student.fullName}`
      .toLowerCase()
      .replaceAll(" ", "_");

    const extracted = await studentFileStorage.load(folderPath);
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
      studentData: {
        ...extracted.data?.studentData
      },
      teachersRemark: extracted.data?.teachersRemark,
      studentRatings: extracted.data?.studentRatings,
    } as any;
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
