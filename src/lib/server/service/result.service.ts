import {
  AttributeRemark,
  type Attendance,
  type MarkResponse,
  type MarksData,
  type MarksInput,
  type ResultInput,
  type StudentInput,
  type StudentRatings,
} from "$lib/schema/result-input";
import {
  resultOutputSchema,
  type Category,
  type MarksRecord,
  type ResultOutput,
  type School,
  type Student,
} from "$lib/schema/result-output";
import { repo } from "$lib/server/repository";
import { studentRepo } from "$lib/server/repository/student.repo";
import type { ClassAverage, ExamSetup, MarkData, ResultData, ScoreData } from "$lib/types/result-types";
import { base64url } from "jose";
import { render } from "svelte/server";
import { ensureBase64Image, pageToHtml } from "../helpers";
import { generate } from "../helpers/pdf-generator";
import { resultRepo } from "../repository/result.repo";
import { timelineRepo } from "../repository/timeline.repo";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { JobWorker, type JobPayload, type JobResult } from "../worker";
import path from "path";
import fs from "fs";

const GRADE_RANGES = {
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

export class ResultService {
  category?: Category;
  studentInput?: StudentInput;

  /**
   * SMTP Email Result matching email-job.ts EmailResult interface
   */
  static EmailResultSchema = {
    to: "" as string | undefined,
    messageId: "" as string | undefined,
    response: "" as string | undefined,
    studentId: 0 as number | undefined,
  };

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

        const resultData = await result.getStudentResult({ id: studentId, examId, withImages: true });
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
      await timelineRepo.upsertTimelines(timeline);
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
    const timelines = await timelineRepo.getTimelinesByStudentId(studentId);
    return timelines.some((t) => t.type?.startsWith(`exam-${examId}`));
  }

  async assignSubjects(classId: number, sectionId: number, teacherId?: number) {
    // clones existing subjects from other sections of the same class
    const academicId = await repo.result.getAcademicId();
    const assignedSubjects = await resultRepo.getAssignedSubjects(classId, sectionId);
    const assigned = assignedSubjects.map((s) => ({
      classId,
      sectionId,
      academicId,
      teacherId: teacherId ?? s.teacherId,
      subjectId: s.subjectId,
      activeStatus: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    return await resultRepo.assignSubjects(assigned);
  }

  /**
   * Store student attendance for an exam
   */
  async upsertAttendance(params: { attendance: Attendance; studentId: number; examTypeId: number }) {
    const { attendance, studentId, examTypeId } = params;
    const data = {
      ...attendance,
      studentId,
      examTypeId,
    };
    await resultRepo.upsertClassAttendance(data);
  }

  /**
   * Store teacher's remark for a student
   */
  async upsertTeacherRemark(params: { studentId: number; examTypeId: number; remark: string }) {
    const { studentId, examTypeId, remark } = params;
    const academicId = await repo.result.getAcademicId();
    await resultRepo.upsertTeacherRemark({
      studentId,
      examTypeId,
      remark,
      academicId,
    });
  }

  /**
   * Store student ratings for a student
   */
  async upsertStudentRatings(params: { studentId: number; examTypeId: number; ratings: StudentRatings }) {
    const { studentId, examTypeId, ratings } = params;
    const academicId = await repo.result.getAcademicId();
    await resultRepo.upsertStudentRatings(
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
        .filter((r) => r !== null) as any[]
    );
  }

  async cleanUpResultRecord(record: MarksRecord) {
    await repo.result.deleteResultStore(record.resultId);
    await repo.result.deleteMarkStore(record.markIds);
    await repo.result.deleteExamSetup(record.titleIds);
  }

  /**
   * Store exam marks for a student from validated report data
   */
  async upsertStudentResult(validatedResult: ResultInput, teacherId: number): Promise<MarkResponse> {
    const { studentData, marksData, teachersRemark, studentRatings } = validatedResult;
    const { studentId, classId, sectionId, recordId, examTypeId } = studentData;

    try {
      if (!studentId || !classId || !sectionId || !recordId || !examTypeId) {
        throw new Error(`Student record not found for admission number ${studentData.admissionNo}`);
      }
      this.category = studentData.studentCategory as Category;
      this.studentInput = studentData;

      const examSetup = await this.getExamSetup(examTypeId);
      if (!examSetup) {
        throw new Error("Failed to fetch exam setup");
      }
      const results = await this.processMarks(marksData, examSetup);
      if (!results?.length) {
        throw new Error(
          "Failed to process marks. Ensure you have uploaded the marks data for the student before proceeding."
        );
      }

      // Update student ratings if present
      if (studentRatings) {
        const academicId = await repo.result.getAcademicId();
        await repo.result.upsertStudentRatings(
          Object.entries(studentRatings)
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
            .filter((r) => r !== null) as any[]
        );
      }

      // Save teacher remark if present
      if (teachersRemark.comment) {
        const academicId = await repo.result.getAcademicId(); // Reuse repo’s helper
        await repo.result.upsertTeacherRemark({
          teacherId,
          studentId,
          examTypeId,
          remark: teachersRemark.comment,
          academicId,
        });
      }

      // upsert attendance
      if (studentData.attendance) {
        await this.upsertAttendance({
          attendance: studentData.attendance,
          studentId,
          examTypeId,
        });
      }

      return { studentId, examTypeId, results };
    } catch (error) {
      console.error("MarksService::store - Operation failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
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
    let { id, examId, isAdminNo, withImages } = params;
    const studentData = isAdminNo
      ? await studentRepo.getStudentById(id, isAdminNo)
      : await studentRepo.getStudentById(id);

    if (!studentData) return null;
    const resultData = await repo.result.queryResultData(studentData, examId);
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
      category: (studentData.categoryName as any) || "MIDDLEBASIC",
      className: studentData.className || "",
      sectionName: studentData.sectionName || "",
      adminNo: studentData.admissionNo || 0,
      sessionYear: academic ? `${academic.year}-[${academic.title}]` : "",
      daysOpened: attendance?.daysOpened || 0,
      daysAbsent: attendance?.daysAbsent || 0,
      daysPresent: attendance?.daysPresent || 0,
      studentPhoto: withImages ? ensureBase64Image(studentData.studentPhoto || "", "/avatar.jpg") : undefined,
      token: base64url.encode(JSON.stringify({ studentId: id, examId })),
    };
    const schoolData = (await repo.result.getGeneralSettings())?.[0] || {};
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

    const subjects = await resultRepo.getAssignedSubjects(studentData.classId!!);
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
        subject: result.subjectName || "Learning Outcome",
        totalScore: 0,
        category,
        resultId: result.resultId,
        subjectId: result.subjectId || 0,
        markIds: [],
        titleIds: [],
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
    for (const m of marks) (bySubject[m.subjectName || "Unknown"] ??= []).push(m);

    let overAll = 0;
    const records = Object.entries(bySubject).map(([subject, sMarks]) => {
      const totalScore = Math.ceil(sMarks.reduce((s: number, m: any) => s + (m.totalMarks || 0), 0));
      const marksObj: Record<string, number> = {};
      for (const m of sMarks) marksObj[m.examTitle || "Unknown"] = m.totalMarks;
      const first = sMarks[0];
      const obj = objectives?.find((o: any) => o.subjectCode === first?.subjectCode);
      const matchingResult = resultRecords?.find((r) => r.subjectId === first?.subjectId);
      const grade = this.getGrade(totalScore, category, matchingResult?.teacherRemarks ?? null);
      overAll += totalScore;
      return {
        subject,
        totalScore,
        category,
        resultId: matchingResult?.resultId || 0,
        subjectId: first?.subjectId || 0,
        markIds: sMarks.map((m: MarkData) => m.markId || 0),
        titleIds: sMarks.map((m: MarkData) => m.titleId || 0),
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

  async getMappingData(staffId: number) {
    const [examSetups, examTypes, studentCategories, subjects, classSection] = await Promise.all([
      repo.result.getExamSetupsByStaffId(staffId),
      repo.result.getCurrentTerm(),
      repo.result.getStudentCategories(),
      repo.result.getSubjectsAssignedToStaff(staffId),
      repo.result.getAssignedClassSection(staffId),
    ]);
    return { examSetups, examTypes, studentCategories, subjects, classSection, studentData: {} };
  }

  /**
   * Process marks and store in database
   */
  private async processMarks(markStore: MarksData, examSetups: ExamSetup[]): Promise<MarksInput[] | null> {
    if (!this.studentInput) return null;

    // Update student category before processing marks
    await studentRepo.updateStudentCategoryId(
      this.studentInput.studentId!,
      this.studentInput.studentCategoryId!
    );

    await resultRepo.cleanMarks({
      recordId: this.studentInput.recordId!,
      studentId: this.studentInput.studentId!,
      classId: this.studentInput.classId!,
      sectionId: this.studentInput.sectionId!,
      examTermId: this.studentInput.examTypeId!,
      schoolId: this.studentInput.schoolId!,
    });

    return this.doProcessMarks(
      {
        category: this.studentInput.studentCategory! as Category,
        studentId: this.studentInput.studentId!,
        recordId: this.studentInput.recordId!,
        classId: this.studentInput.classId!,
        sectionId: this.studentInput.sectionId!,
        schoolId: this.studentInput.schoolId!,
        examTypeId: this.studentInput.examTypeId!,
      },
      markStore,
      examSetups
    );
  }

  /**
   * Process marks and store in database
   */
  async doProcessMarks(
    student: StudentData,
    markStore: MarksData,
    examSetups: ExamSetup[]
  ): Promise<MarksInput[] | null> {
    if (!student) return null;
    const { studentId, recordId, classId, sectionId, schoolId, examTypeId } = student;
    if (!classId || !sectionId || !schoolId || !studentId) {
      return null;
    }
    const studentRecordId = recordId;

    const academicId = await repo.result.getAcademicId();
    const results: MarksInput[] = [];

    for (const record of markStore) {
      const subjectId = record.subjectId;
      const marks = record.marks;
      const totalMarksPerSubject = record.total || 0; // already summed in input
      let isAbsent = false;

      const examId = await repo.result.createExamIfNotExist({
        examMark: 100,
        passMark: 70,
        classId,
        sectionId,
        subjectId,
        examTypeId,
        academicId,
        schoolId,
      });

      if (student.category !== "DAYCARE") {
        if (!marks || !record.examTitles) continue;
        if (marks.length === 0) continue;
        if (marks.length !== record.examTitles.length) continue;
        // Process each mark part (e.g., FA1, FA2, SA)
        let markIds: number[] = [];
        for (let i = 0; i < marks.length; i++) {
          const partMark = marks[i] ?? 0;
          const examTitle = record.examTitles[i] || "";
          let examSetupId = this.findExamSetupId(examSetups, subjectId, examTitle);
          isAbsent = isAbsent || partMark === 0;

          examSetupId = await repo.result.upsertExamSetup({
            id: examSetupId || undefined,
            examTitle,
            examMark: partMark,
            subjectId,
            examId,
            examTermId: examTypeId,
            classId,
            sectionId,
            academicId,
            schoolId,
          });

          if (!examSetupId) {
            continue;
          }

          await repo.result.upsertMarkRecord({
            examTermId: examTypeId,
            classId,
            sectionId,
            subjectId,
            studentId,
            studentRecordId,
            totalMarks: partMark,
            examSetupId,
            isAbsent: isAbsent ? 1 : 0,
            teacherRemarks: record.grade,
            schoolId,
            academicId,
          });
        }
      }
      // Compute subject-level result
      const subjectFullMark = await repo.result.getSubjectFullMark({
        examTypeId,
        subjectId,
        classId,
        sectionId,
        academicId,
        schoolId,
      });

      const percentage = this.subjectPercentageMark(totalMarksPerSubject, subjectFullMark);
      const [grade] = await repo.result.getMarkGrade({ percentage, academicId, schoolId });
      await repo.result.upsertResultRecord({
        classId,
        sectionId,
        subjectId,
        examTypeId,
        studentId,
        studentRecordId,
        isAbsent: isAbsent ? 1 : 0,
        totalMarks: totalMarksPerSubject || 0,
        totalGpaPoint: grade?.gpa ?? null,
        totalGpaGrade: grade?.gradeName ?? null,
        teacherRemarks: record.grade ?? record.learningOutcome,
        schoolId,
        academicId,
      });

      results.push({
        subjectId,
        examTypeId,
        totalMarks: totalMarksPerSubject,
        grade: grade?.gradeName ?? null,
        gpa: grade?.gpa ?? null,
        isAbsent,
        teacherRemarks: record.grade ?? record.learningOutcome ?? undefined,
      });
    }

    return results;
  }

  async getClassAverages(classResults: ResultData[]): Promise<ClassAverage> {
    // Group by studentId
    const resultByStudent = classResults.reduce((acc: Record<string, ResultData[]>, result: ResultData) => {
      const studentId = String(result.studentId || "0");
      (acc[studentId] = acc[studentId] || []).push(result);
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
    return await repo.result.getObjectives(student);
  }

  /**
   * Get exam setup data for a student and exam
   */
  async getExamSetup(examId: number) {
    if (!this.studentInput) return null;
    return await repo.result.getExamSetup({
      classId: this.studentInput.classId,
      sectionId: this.studentInput.sectionId,
      examTypeId: examId,
      schoolId: 1,
    });
    // ⚠️ Note: `studentId` was in params but unused in repo — removed
  }

  /**
   * Find exam setup ID for subject and exam type
   */
  findExamSetupId(examSetups: ExamSetup[], subjectId: number, examType: string): number | null {
    const subjectSetups = examSetups.filter((setup) => setup.subjectId === subjectId);

    if (!examType) {
      return subjectSetups[0].id;
    }

    const matchedSetup = subjectSetups.find(
      (setup) => setup.examTitle && setup.examTitle.toLowerCase().includes(examType.toLowerCase())
    );

    return matchedSetup?.id || null;
  }

  subjectPercentageMark(obtainedMark: number, fullMark: number): number {
    if (fullMark === 0) return 0;
    return Math.round((obtainedMark / fullMark) * 10000) / 100; // 2 decimal places
  }

  getGrade(score: number, category: Category, remark: string | null): { grade: string; color?: string } {
    const ranges = category === "LOWERBASIC" || category === "MIDDLEBASIC" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS;
    const match = ranges.find((r) => score >= r.min && score <= r.max);
    return match ? { grade: match.grade, color: match.color } : { grade: "N/A", color: "bg-gray-200" };
  }

  private parseAddress(address: string) {
    const parts = address.split(",").map((p) => p.trim());
    const state = parts.pop() || null,
      city = parts.pop() || null,
      street = parts.join(", ");
    const m = /No\.\s*(\d+)\s*(.+)/i.exec(street);
    return { street_number: m?.[1] || null, street_name: m?.[2] || street || null, city, state };
  }
}

export const result = new ResultService();
