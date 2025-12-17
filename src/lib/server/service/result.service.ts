import {
  AttributeRemark,
  type MarksData,
  type MarksInput,
  type MarksOutput,
  type ResultInput,
  type ResultOutput,
} from "$lib/schema/result";
import type { ClassAverage, ExamSetup, ResultData, ScoreData, StudentDetail } from "$lib/types/result-types";
import { studentRepo, type StudentRecord } from "$lib/server/repository/student.repo";
import ResultEmail from "$lib/components/template/result-email.svelte";
import { base, repo } from "$lib/server/repository";
import { ensureBase64Image, pageToHtml } from "../helpers";
import { base64url } from "jose";
import { timelineRepo } from "../repository/timeline.repo";
import { SMTPClient, type SMTPMessage } from "../helpers/smtp";
import { render } from "svelte/server";

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
  /**
   * Publish result to students and parents timeline and send email
   */
  async publishResult(studentId: number, examId: number) {
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
  async sendResultEmail(examTypeId: number) {
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

        const { body, head } = render(ResultEmail, { props });
        const html = pageToHtml(body, head);
        const payload: SMTPMessage = {
          from: "School Management System <no-reply@sms.com>",
          to: s.guardiansEmail,
          subject: "Result Notification",
          text: "Result Notification",
          html
        };
        
        await new SMTPClient().sendMessage(payload);
      })
    );
    return true;
  }
  /**
   * Store exam marks for a student from validated report data
   */
  async upsertStudentResult(validatedReport: ResultInput, teacherId: number): Promise<MarksOutput> {
    try {
      const { studentData, marksData, teachersRemark, studentRatings } = validatedReport;
      const stdRec = await studentRepo.getStudentRecordByAdmissionNo(studentData.admissionNo);
      if (!stdRec) {
        return {
          success: false,
          message: "Student not found",
        };
      }

      // Fetch exam setup and process/store marks
      const examSetup = await this.getExamSetup(stdRec, studentData.examTypeId);
      const results = await this.processMarks(marksData, stdRec, examSetup, studentData.examTypeId);
      if (!results?.length) {
        return {
          success: false,
          message: "Failed to process marks",
        };
      }

      // Update student ratings if present
      if (studentRatings) {
        const academicId = await repo.result.getAcademicId();
        await repo.result.upsertStudentRatings(
          Object.entries(studentRatings)
            .map(([attribute, rating]) => {
              if (!rating) return null;
              return {
                studentId: stdRec.studentId!,
                examTypeId: studentData.examTypeId,
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
          studentId: stdRec.studentId!,
          examTypeId: studentData.examTypeId,
          remark: teachersRemark.comment,
          academicId,
        });
      }

      return {
        success: true,
        message: "Marks processed successfully",
        data: {
          studentId: stdRec.studentId!,
          examId: studentData.examTypeId,
          results,
        },
      };
    } catch (error) {
      console.error("MarksService::store - Operation failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        message: `Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   *
   * @param id id of the student
   * @param examId  exam term id
   * @returns
   */
  async getStudentResult(id: number, examId: number, withImages = false): Promise<ResultOutput | null> {
    const studentData = await studentRepo.getStudentById(id);
    if (!studentData) return null;
    const resultData = await repo.result.queryResultData(studentData, examId);
    if (!resultData?.classResults?.length) return null;

    const { examType, academic, attendance, marks, ratings, remark } = resultData;

    const student: StudentDetail = {
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
      opened: attendance?.daysOpened || 0,
      absent: attendance?.daysAbsent || 0,
      present: attendance?.daysPresent || 0,
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
    const { records, overAll } = this.buildMarksRecords(marks, objectives, student.category);

    const score: ScoreData = {
      total: overAll,
      average: records.length ? Math.floor(overAll / records.length) : 0,
      classAverage: await this.getClassAverages(resultData.classResults),
      maxScores: records.length * 100,
    };

    return {
      school,
      student,
      records,
      score,
      ratings,
      remark,
      examType,
    };
  }

  private buildMarksRecords(marks: any[], objectives: any[], category: string) {
    const bySubject: Record<string, any[]> = {};
    for (const m of marks) (bySubject[m.subjectName || "Unknown"] ??= []).push(m);

    let overAll = 0;
    const records = Object.entries(bySubject).map(([subject, sMarks]) => {
      const totalScore = Math.ceil(sMarks.reduce((s: number, m: any) => s + (m.totalMarks || 0), 0));
      const marksObj: Record<string, number> = {};
      for (const m of sMarks) marksObj[m.examTitle] = m.totalMarks;
      const first = sMarks[0];
      const obj = objectives?.find((o: any) => o.subjectCode === first?.subjectCode);
      const grade = this.getGrade(totalScore, category, first?.teacherRemarks);
      overAll += totalScore;
      return {
        subjectId: first?.subjectId || 0,
        subject,
        subjectCode: first?.subjectCode || "",
        objectives: obj?.text?.split("|").map((s: string) => s.trim()) || ([] as string[]),
        titles: Object.keys(marksObj),
        marks: Object.values(marksObj) as number[],
        totalScore,
        grade: grade.grade,
        color: grade.color,
      };
    });
    return { records, overAll };
  }

  async getMappingData(staffId: number) {
    const [examSetups, examTypes, studentCategories, subjects] = await Promise.all([
      repo.result.getExamSetupsByStaffId(staffId),
      repo.result.getCurrentTerm(),
      repo.result.getStudentCategories(),
      repo.result.getAssignedSubjects(staffId),
    ]);
    return { examSetups, examTypes, studentCategories, subjects };
  }

  /**
   * Process marks and store in database
   */
  private async processMarks(
    markStore: MarksData,
    studentRecord: StudentRecord,
    examSetups: ExamSetup[],
    examTermId: number
  ): Promise<MarksInput[] | null> {
    const { studentId, id, classId, sectionId, schoolId } = studentRecord;
    if (!classId || !sectionId || !schoolId || !studentId) {
      return null;
    }
    const studentRecordId = id;

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
        examTypeId: examTermId,
        academicId,
        schoolId,
      });

      if (!marks || !record.examTitles) continue;
      if (marks.length === 0) continue;
      if (marks.length !== record.examTitles.length) continue;

      // Process each mark part (e.g., FA1, FA2, SA)
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
          examTermId,
          classId,
          sectionId,
          academicId,
          schoolId,
        });

        if (!examSetupId) {
          continue;
        }

        const markData = {
          examTermId,
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
        };
        await repo.result.upsertMarkRecord(markData);
      }

      // Compute subject-level result
      const subjectFullMark = await repo.result.getSubjectFullMark({
        examTypeId: examTermId,
        subjectId,
        classId,
        sectionId,
        academicId,
        schoolId,
      });

      const percentage = this.subjectPercentageMark(totalMarksPerSubject, subjectFullMark);
      const [grade] = await repo.result.getMarkGrade({ percentage, academicId, schoolId });

      const resultData = {
        classId,
        sectionId,
        subjectId,
        examTypeId: examTermId,
        studentId,
        studentRecordId,
        isAbsent: isAbsent ? 1 : 0,
        totalMarks: totalMarksPerSubject || 0,
        totalGpaPoint: grade?.gpa ?? null,
        totalGpaGrade: grade?.gradeName ?? null,
        teacherRemarks: record.grade ?? record.learningOutcome,
        schoolId,
        academicId,
      };
      await repo.result.upsertResultRecord(resultData);
      if (record.learningOutcome) await repo.result.upsertMarkRecord(resultData);

      results.push({
        subjectId,
        examId: examTermId,
        totalMarks: totalMarksPerSubject,
        grade: grade?.gradeName ?? null,
        gpa: grade?.gpa ?? null,
        isAbsent,
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

  async getObjectives(student: StudentDetail) {
    if (student.category !== "NURSERY") return [];
    return await repo.result.getObjectives(student);
  }

  /**
   * Get exam setup data for a student and exam
   */
  private async getExamSetup(student: StudentRecord, examId: number) {
    const academicId = await repo.result.getAcademicId();
    return await repo.result.getExamSetup({
      studentClassId: student.classId || 0,
      studentSectionId: student.sectionId || 0,
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

  getGrade(score: number, category: string, remark: string | null): { grade: string; color?: string } {
    if (remark) return { grade: remark };
    const ranges = category === "GRADERS" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS;
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
