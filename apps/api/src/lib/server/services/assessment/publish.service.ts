import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { PortError, ValidationError } from "../errors";
import { buildMarksheet } from "./marksheet-query";

export interface PublishResultsInput {
  readonly studentIds: readonly number[];
  readonly examId: number;
  readonly resend?: boolean;
}

export interface PublishResultsResult {
  readonly success: boolean;
  readonly sent: number;
  readonly failed: number;
  readonly errors: readonly string[];
  readonly results: readonly {
    readonly to?: string;
    readonly messageId?: string;
    readonly studentId: number;
  }[];
}

export interface PublishTranscriptInput {
  readonly to: string;
  readonly parentName: string;
  readonly studentName: string;
  readonly academicYear: string;
  readonly html?: string;
  readonly pdfFilename?: string;
}

export interface PublishTranscriptResult {
  readonly success: boolean;
  readonly message: string;
  readonly messageId?: string;
}

export class AssessmentPublishService {
  constructor(private readonly ctx: ServiceContext) {}

  async isEmailAlreadySent(studentId: number, examId: number): Promise<boolean> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const timelines = await this.ctx.repos.profiles.listTimelinesByStudent(
      scoped,
      studentId
    );
    return timelines.some((timeline) => timeline.type?.startsWith(`exam-${examId}`) ?? false);
  }

  async publishResults(input: PublishResultsInput): Promise<PublishResultsResult> {
    if (input.examId <= 0 || input.studentIds.length === 0) {
      throw new ValidationError("An exam and at least one student are required", "studentIds");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const reportSettings = await this.ctx.ports.reportSettings.get();
    const errors: string[] = [];
    const results: Array<{ to?: string; messageId?: string; studentId: number }> = [];
    let sent = 0;

    for (const studentId of input.studentIds) {
      if (input.resend !== true && (await this.isEmailAlreadySent(studentId, input.examId))) {
        errors.push(`Student ${studentId}: Email already sent`);
        continue;
      }
      const marksheet = await buildMarksheet(this.ctx, {
        studentId,
        examId: input.examId
      });
      if (marksheet === null) {
        errors.push(`Student ${studentId}: Result validation failed`);
        continue;
      }
      const to = marksheet.student.parentEmail;
      if (to.trim().length === 0) {
        errors.push(`Student ${studentId}: Parent email is missing`);
        continue;
      }

      try {
        const message = await this.ctx.ports.email.send({
          template: "result",
          to,
          data: {
            schoolName: marksheet.school.name,
            studentName: marksheet.student.fullName,
            principal: reportSettings.principalName,
            support: reportSettings.supportEmail,
            resultEmailSubject: reportSettings.resultEmailSubject
          }
        });
        sent += 1;
        results.push({ to, messageId: message.messageId, studentId });
        await this.ctx.repos.profiles.upsertTimelines(scoped, {
          staffStudentId: studentId,
          type: `exam-${input.examId}-${message.messageId}`,
          title: "Result Notification",
          description: reportSettings.termlyReportTitle,
          visibleToStudent: 1,
          file: `result/${message.messageId}`,
          date: new Date().toISOString().slice(0, 10),
          activeStatus: 1
        });
      } catch (error) {
        if (error instanceof PortError) throw error;
        errors.push(
          `Student ${studentId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return {
      success: sent > 0,
      sent,
      failed: input.studentIds.length - sent,
      errors,
      results
    };
  }

  async publishTranscript(
    input: PublishTranscriptInput
  ): Promise<PublishTranscriptResult> {
    if (!input.to.includes("@")) {
      throw new ValidationError("A valid recipient email is required", "to");
    }
    const message = await this.ctx.ports.email.send({
      template: "transcript",
      to: input.to,
      data: {
        studentName: input.studentName,
        parentName: input.parentName,
        academicYear: input.academicYear,
        transcriptSubject: `Academic Transcript — ${input.studentName} — ${input.academicYear}`
      }
    });
    return {
      success: true,
      message: "Email sent successfully",
      messageId: message.messageId
    };
  }
}
