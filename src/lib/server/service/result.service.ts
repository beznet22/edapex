import {
  type Attendance,
  type MarksData,
  type MarksInput,
  type MarkResponse,
  type ResultInput,
  type StudentRatings,
  type TeacherRemark,
  AttributeRemark,
  type StudentInput,
} from "$lib/schema/result-input";
import type {
  ClassAverage,
  ExamSetup,
  MarkData,
  NewSmMarkStore,
  ResultData,
  ScoreData,
  StudentRecord,
} from "$lib/types/result-types";
import { studentRepo } from "$lib/server/repository/student.repo";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { base, repo } from "$lib/server/repository";
import { ensureBase64Image, pageToHtml } from "../helpers";
import { base64url } from "jose";
import { timelineRepo } from "../repository/timeline.repo";
import { SMTPClient, type SMTPMessage } from "../helpers/smtp";
import { render } from "svelte/server";
import { resultRepo } from "../repository/result.repo";
import { id } from "zod/v4/locales";
import { resultOutputSchema, type Category, type MarksRecord, type ResultOutput, type Student } from "$lib/schema/result-output";

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

export class ResultService {
  category?: Category
  studentInput?: StudentInput
  /**
   * Publish result to students and parents timeline and send email
   */
  async publishResult(params: { studentId: number; examId: number }) {
    const { studentId, examId } = params;
    const resultData = await result.getStudentResult({ id: studentId, examId, withImages: true });
    const validatedResult = await resultOutputSchema.safeParseAsync(resultData);
    if (!validatedResult.success) {
      return null;
    }
    this.sendResultEmail({ examTypeId: examId });
    const timeline = {
      staffStudentId: studentId,
      type: `exam-${examId}`,
      title: "TERMLY SUMMARY OF PROGRESS REPORT",
      description: "TERMLY SUMMARY OF PROGRESS REPORT",
      visibleToStudent: 1,
      file: `result/${base64url.encode(JSON.stringify({ studentId, examId }))}`,
      date: new Date().toISOString().slice(0, 10),
      activeStatus: 1,
      schoolId: 1,
      academicId: 1,
    };

    await timelineRepo.upsertTimeline(timeline);
    return true;
  }

  /**
   * Send result email to parent
   */
  async sendResultEmail(params: { examTypeId: number }) {
    const { examTypeId } = params;
    const siblings = await studentRepo.getStudentBySiblings();
    const examType = await base.getCurrentTerm(examTypeId);
    const settings = await base.getGeneralSettingBySchoolId(1);

    if (!siblings) return false;
    Promise.all(
      siblings.map(async (s) => {
        if (!s.guardiansEmail) return false;

        const props = {
          term: examType.title,
          title: "TERMLY SUMMARY OF PROGRESS REPORT",
          fullName: s.fullName,
          receiverName: s.guardiansName,
          schoolName: settings?.siteTitle || "School Name",
          logo: ensureBase64Image(settings?.logo || "", "/school-logo.png"),
          principal: "Principal Name",
          contact: "1234567890",
          support: "support@sms.com",
        };

        const { body, head } = render(ResultEmail as any, { props });
        const html = pageToHtml(body, head);
        const payload: SMTPMessage = {
          from: "School Management System <no-reply@sms.com>",
          to: s.guardiansEmail,
          subject: "Result Notification",
          text: "Result Notification",
          html,
        };

        await new SMTPClient().sendMessage(payload);
      })
    );
    return true;
  }

  async assignSubjects(classId: number, sectionId: number, teacherId?: number) {
    // clones existing subjects from other sections of the same class
    const assignedSubjects = await resultRepo.getAssignedSubjects(classId, classId);
    const assigned = assignedSubjects.map((s) => ({
      classId,
      sectionId,
      teacherId: teacherId ?? s.teacherId,
      subjectId: s.subjectId,
      academicId: s.academicId,
      schoolId: s.schoolId,
      activeStatus: s.activeStatus,
      parentId: s.parentId,
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
        throw new Error(
          `Student record not found for admission number ${studentData.admissionNo}`
        );
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

    const { examType, academic, attendance, marks, ratings, remark, resultRecord } = resultData;

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
    const school = {
      name: schoolData?.siteTitle || "School Name",
      logo: withImages
        ? ensureBase64Image(schoolData?.favicon || schoolData?.logo || "", "/school-logo.png")
        : undefined,
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
    const { records, overAll } = this.buildMarksRecords(marks, objectives, student.category, resultRecord);
    const score: ScoreData = {
      total: overAll,
      average: records.length ? Math.floor(overAll / records.length) : 0,
      classAverage: await this.getClassAverages(resultData.classResults),
      maxScores: records.length * 100,
    };

    const subjects = await resultRepo.getAssignedSubjects(studentData.classId!, studentData.sectionId!)
    return {
      subjectlen: subjects.length,
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
      teacherRemarks: string | null
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
      const matchingResult = resultRecords?.find(r => r.subjectId === first?.subjectId);
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
    return { examSetups, examTypes, studentCategories, subjects, classSection };
  }

  /**
   * Process marks and store in database
   */
  private async processMarks(markStore: MarksData, examSetups: ExamSetup[]): Promise<MarksInput[] | null> {
    if (!this.studentInput) return null;
    const { studentId, recordId, classId, sectionId, schoolId, examTypeId } = this.studentInput;
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

      if (this.category !== "DAYCARE") {

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
      min: { studentId: minStudent.studentId, value: minAvg.toFixed(2) },
      max: { studentId: maxStudent.studentId, value: maxAvg.toFixed(2) },
    };
  }

  async getObjectives(student: Student) {
    if (student.category !== "NURSERY") return [];
    return await repo.result.getObjectives(student);
  }

  /**
   * Get exam setup data for a student and exam
   */
  private async getExamSetup(examId: number) {
    if (!this.studentInput) return null;
    const academicId = await repo.result.getAcademicId();
    return await repo.result.getExamSetup({
      studentClassId: this.studentInput.classId,
      studentSectionId: this.studentInput.sectionId,
      examTypeId: examId,
      academicId,
      schoolId: 1,
    });
    // ⚠️ Note: `studentId` was in params but unused in repo — removed
  }

  /**
   * Find exam setup ID for subject and exam type
   */
  private findExamSetupId(examSetups: ExamSetup[], subjectId: number, examType: string): number | null {
    const subjectSetups = examSetups.filter((setup) => setup.subjectId === subjectId);

    if (!examType) {
      return subjectSetups[0].id;
    }

    const matchedSetup = subjectSetups.find(
      (setup) => setup.examTitle && setup.examTitle.toLowerCase().includes(examType.toLowerCase())
    );

    return matchedSetup?.id || null;
  }

  private subjectPercentageMark(obtainedMark: number, fullMark: number): number {
    if (fullMark === 0) return 0;
    return Math.round((obtainedMark / fullMark) * 10000) / 100; // 2 decimal places
  }

  getGrade(score: number, category: Category, remark: string | null): { grade: string; color?: string } {
    if (remark) return { grade: remark };
    const ranges = category === "LOWERBASIC" || "MIDDLEBASIC" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS;
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
