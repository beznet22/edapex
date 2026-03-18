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
  type Category,
  type MarksRecord,
  type ResultOutput,
  type School,
  type Student,
} from "$lib/schema/result-output";
import { repo, studentRepo, resultRepo, timelineRepo, staffRepo } from "$lib/server/repository";
import type { ClassAverage, ExamSetup, MarkData, ResultData, ScoreData } from "$lib/types/result-types";
import { base64url } from "jose";
import { render } from "svelte/server";
import { ensureBase64Image, pageToHtml } from "../helpers";
import { generate } from "../helpers/pdf-generator";

import type { NewExamSetup } from "$lib/types/result-types";

import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { JobWorker, type JobPayload, type JobResult } from "../worker";

import { generateContent } from "../helpers/chat-helper";
import { studentFileStorage } from "../storage/student-files";
import path from "path";
import fs from "fs";
import type { MySQLDrizzleClient } from "../db";

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

// Local type for mark processing (now distinct from result summary ScoreData)
type MarkScoreData = {
  score: number;
  fullMarks: number;
  originalName?: string;
  isAbsent?: boolean;
};

export class AssessmentService {
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
    return timelines.some((t: any) => t.type?.startsWith(`exam-${examId}`));
  }

  async assignSubjects(classId: number, sectionId: number, teacherId?: number) {
    const academicId = await repo.result.getAcademicId();
    
    // 1. Try to get subjects for this specific section first
    let assignedSubjects = await resultRepo.getAssignedSubjects(classId, sectionId);
    
    // 2. If empty, try to get subjects from any other section in the same class
    if (assignedSubjects.length === 0) {
      const allClassSections = await resultRepo.getClassSections();
      const parentSections = allClassSections.filter(s => s.classId === classId && s.sectionId !== sectionId);
      
      for (const section of parentSections) {
        if (section.sectionId) {
          const proxySubjects = await resultRepo.getAssignedSubjects(classId, section.sectionId);
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
          teacherId: teacherId ?? s.teacherId,
          subjectId: s.subjectId,
          activeStatus: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    const assigned = Array.from(subjectMap.values());
    return await resultRepo.assignSubjects(assigned);
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
    await resultRepo.upsertClassAttendance(data, tx);
  }

  /**
   * Store teacher's remark for a student
   */
  async upsertTeacherRemark(params: { studentId: number; examTypeId: number; remark: string }, tx?: MySQLDrizzleClient) {
    const { studentId, examTypeId, remark } = params;
    const academicId = await repo.result.getAcademicId();
    await resultRepo.upsertTeacherRemark({
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
        .filter((r) => r !== null) as any[],
      tx
    );
  }

  async cleanUpResultRecord(record: MarksRecord) {
    await repo.result.deleteResultStore(record.resultId, record.studentId);
    await repo.result.deleteMarkStore(record.markIds, record.studentId);
    await repo.result.deleteExamSetup(record.titleIds);
  }

  /**
   * Store exam marks for a student from validated report data
   */
  async upsertStudentResult(validatedResult: ResultInput, staffId: number): Promise<MarkResponse> {
    const { studentData, marksData, teachersRemark, studentRatings } = validatedResult;
    const { studentId, classId, sectionId, recordId, examTypeId, studentCategoryId } = studentData;
    if (!studentId || !examTypeId) throw new Error("Student ID and Exam Type ID are required");

    return await repo.result.db.transaction(async (tx: any) => {
      this.category = studentData.studentCategory as Category;
      this.studentInput = studentData;

      const academicId = await repo.result.getAcademicId();
      const schoolId = studentData.schoolId || 1;
      const sId = studentId!;
      const eTId = examTypeId!;

      // 1. Resolve approving staff member
      const approvingStaffId = staffId || 1;

      // 2. Resolve teacher to attribute the marks to (if Admin is approving)
      const assignedSubjects = await repo.result.getAssignedSubjects(classId, sectionId);
      const subjectTeacherMap = new Map<number, number>();
      assignedSubjects.forEach((s) => {
        if (s.subjectId && s.teacherId) subjectTeacherMap.set(s.subjectId, s.teacherId);
      });

      // 3. Update student category if it changed
      if (studentCategoryId) {
        await studentRepo.updateStudentCategoryId(studentId, studentCategoryId, tx);
      }

      // 4. Fetch Exam Setups
      const examSetups = await repo.result.getExamSetupsByClassSection(classId, sectionId);

      // 5. Clean existing marks for this term
      await repo.result.cleanMarks(
        {
          recordId: recordId!,
          studentId: sId,
          classId: classId!,
          sectionId: sectionId!,
          examTermId: eTId,
          schoolId,
        },
        tx
      );

      // 6. Process marks (collect data for batching)
      const batchData = await this.doProcessMarks(studentData, marksData, examSetups as ExamSetup[], tx);

      if (!batchData) {
        throw new Error("Failed to process marks.");
      }

      if (!batchData.marks.length && !batchData.results.length) {
        throw new Error("No marks or results were processed.");
      }

      // 7. Batch Upsert
      await Promise.all([
        repo.result.batchUpsertMarkRecords(batchData.marks, tx),
        repo.result.batchUpsertResultRecords(batchData.results, tx),
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
          await repo.result.upsertStudentRatings(ratingsToInsert, tx);
        }
      }

      // 9. Save teacher remark
      if (teachersRemark.comment) {
        // Fallback: use first available teacher ID if approving staff is not found (shouldn't happen for teachers)
        const remarkTeacherId = approvingStaffId || subjectTeacherMap.values().next().value || 0;
        await repo.result.upsertTeacherRemark(
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

      // 10. Upsert attendance
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

  async processMarks(
    markStore: MarksData,
    examSetups: ExamSetup[],
    tx?: MySQLDrizzleClient
  ) {
    const batchData = await this.doProcessMarks(this.studentInput!, markStore, examSetups, tx);
    return batchData?.marksInput;
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
      studentPhoto: photo,
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

    const subjects = await resultRepo.getAssignedSubjects(studentData.classId!!, studentData.sectionId!!);
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

  async getMappingData(staffId: number, classId?: number, sectionId?: number) {
    const academicId = await repo.result.getAcademicId();
    const [examTypes, studentCategories, subjects, classSection] = await Promise.all([
      repo.result.getCurrentTerm(),
      repo.result.getStudentCategories(),
      repo.result.getSubjectsAssignedToStaff(staffId),
      repo.result.getAssignedClassSection(staffId),
    ]);

    // If classId/sectionId provided (Admin view), use those, else use teacher's assigned ones
    const activeClassId = classId || classSection?.classId;
    const activeSectionId = sectionId || classSection?.sectionId;

    let examSetups: Partial<ExamSetup>[] = [];
    if (activeClassId && activeSectionId) {
      examSetups = await repo.result.getExamSetupsByClassSection(activeClassId, activeSectionId);
    } else {
      examSetups = await repo.result.getExamSetupsByStaffId(staffId);
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
    markStore: MarksData,
    examSetups: ExamSetup[],
    tx?: MySQLDrizzleClient
  ): Promise<{
    marks: any[];
    results: any[];
    marksInput: MarksInput[];
  } | null> {
    const academicId = await repo.result.getAcademicId();
    const schoolId = student.schoolId || 1;
    const { classId, sectionId, studentId, recordId, examTypeId } = student;
    if (!classId || !sectionId || !studentId || !examTypeId) return null;

    const marksToInsert: any[] = [];
    const resultsToInsert: any[] = [];
    const marksInput: MarksInput[] = [];

    const assignedSubjects = await repo.result.getAssignedSubjects(classId, sectionId);
    const subjectTeacherMap = new Map<number, number>();
    assignedSubjects.forEach((s) => {
      if (s.subjectId && s.teacherId) subjectTeacherMap.set(s.subjectId, s.teacherId);
    });

    for (const store of markStore) {
      const subjectId = store.subjectId;
      const teacherId = subjectTeacherMap.get(subjectId) || 0;

      // Ensure Exam exists
      const examId = await repo.result.createExamIfNotExist(
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
      if (this.category === "DAYCARE") {
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
          const maxMarks = EXAM_MARK_MAXIMUMS[this.category!];
          const fullMarks = maxMarks?.[title.toUpperCase()] ?? 100;

          const examSetupId = this.findExamSetupId(examSetups, subjectId, title, examId);

          let finalSetupId = examSetupId;
          if (!finalSetupId) {
            finalSetupId = await repo.result.upsertExamSetup(
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
          this.category!
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

  async getExamSetup(examId: number) {
    if (!this.studentInput) return null;
    return await repo.result.getExamSetup({
      classId: this.studentInput.classId,
      sectionId: this.studentInput.sectionId,
      examTypeId: examId,
      schoolId: 1,
    });
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

  getGrade(score: number, category: Category, remark: string | null = null): { grade: string; color?: string } {
    const ranges = category === "LOWERBASIC" || category === "MIDDLEBASIC" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS;
    const match = ranges.find((r) => score >= r.min && score <= r.max);
    return match ? { grade: match.grade, color: match.color } : { grade: "N/A", color: "bg-gray-200" };
  }

  private matchName(fullName: string, targetName?: string): boolean {
    if (!fullName || !targetName) return false;
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(Boolean);

    const fullSet = new Set(normalize(fullName));
    const targetSet = new Set(normalize(targetName));

    let matches = 0;
    for (const part of fullSet) {
      if (targetSet.has(part)) {
        matches++;
        if (matches >= 2) return true;
      }
    }
    return false;
  }

  private parseAddress(address: string) {
    const parts = address.split(",").map((p) => p.trim());
    const state = parts.pop() || null,
      city = parts.pop() || null,
      street = parts.join(", ");
    const m = /No\.\s*(\d+)\s*(.+)/i.exec(street);
    return { street_number: m?.[1] || null, street_name: m?.[2] || street || null, city, state };
  }

  async runExtraction(params: {
    file: Blob;
    classId: number;
    sectionId: number;
    studentId?: number;
    fullName?: string;
    admissionNo?: number;
    originalName?: string;
  }) {
    const { file, classId, sectionId, studentId, fullName, admissionNo } = params;

    const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
    if (!staff.teacherId) throw new Error("Class not assigned to any teacher");

    const mappingData = await this.getMappingData(staff.teacherId, classId, sectionId);
    if (studentId) {
      mappingData.studentData = { studentId, admissionNo, fullName };
    }

    const mapString = JSON.stringify(mappingData);
    const { success, content, message } = await generateContent(file, mapString);
    if (!success || !content) {
      throw new Error(message || "AI extraction failed");
    }

    const parsedResult = JSON.parse(content.trim());

    // Patch class section data
    const classSection = await resultRepo.getClassSectionById(classId, sectionId);
    const finalClassName = classSection?.className || (parsedResult.studentData as any).className || "Unknown";
    const finalSectionName = classSection?.sectionName || (parsedResult.studentData as any).sectionName || "Unknown";

    if (!parsedResult.studentData.className) parsedResult.studentData.className = finalClassName;
    if (!parsedResult.studentData.sectionName) parsedResult.studentData.sectionName = finalSectionName;
    if (!parsedResult.studentData.class) {
      parsedResult.studentData.class = `${finalClassName} ${finalSectionName}`.trim();
    }

    // Patch student data
    if (studentId) parsedResult.studentData.studentId = studentId;
    if (admissionNo) parsedResult.studentData.admissionNo = admissionNo;
    if (fullName) parsedResult.studentData.fullName = fullName;

    const validated = await resultInputSchema.safeParseAsync(parsedResult);
    if (!validated.success) {
      console.log("Extraction validation failed", validated.error.issues);
      const errors = validated.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return `${path}: ${issue.message}`;
      });
      throw new Error(`Validation failed:\n${errors.join("\n")}`);
    }

    validated.data.studentData.className = finalClassName;
    validated.data.studentData.sectionName = finalSectionName;

    const storagePath = await studentFileStorage.save(
      {
        data: validated.data,
        extractedAt: new Date(),
        verified: false,
        status: "extracted",
        originalName: params.originalName,
      },
      Buffer.from(await file.arrayBuffer())
    );

    return {
      success: true,
      studentData: validated.data.studentData,
      marks: validated.data,
      storagePath,
    };
  }

  async getExtractedAssessment(studentId: number, examId: number) {
    const student = await studentRepo.getStudentById(studentId);
    if (!student || !student.classId || !student.sectionId) return null;

    const classSection = await resultRepo.getClassSectionById(student.classId, student.sectionId);
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

export const assessment = new AssessmentService();
