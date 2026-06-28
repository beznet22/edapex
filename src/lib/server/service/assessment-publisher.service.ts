/**
 * Assessment Publisher Service — EdApex
 *
 * Owns the per-request publishing pipeline that:
 *  1. Renders each student's `ResultData` into a PDF (via `bin/html2pdf`)
 *  2. Builds an HTML email body with the school logo as a CID attachment
 *  3. Sends each email via `SMTPClient` (nodemailer) directly — no worker
 *  4. Writes a `smStudentTimelines` row per successful send so the
 *     `/api/results/[token]` route can re-render the PDF later
 *
 * Concurrency: 5 students at a time (configurable). The legacy worker_thread
 * dispatch was removed; SMTP send is now in-process and the
 * `isEmailAlreadySent` check prevents duplicate timeline rows.
 *
 * Slice 10: tenant-scoped via `ScopedRepositoryProvider` (no module singletons).
 *
 * Both `publishResults` (term-by-term result PDFs) and `publishTranscript`
 * (multi-term transcript PDFs) share the same SMTP pipeline — only one
 * `nodemailer.createTransport` call site exists in the project, owned here.
 */
import path from "path";
import fs from "fs";
import { render } from "svelte/server";
import { base64url } from "jose";
import { eq } from "drizzle-orm";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { SMTPClient } from "$lib/server/helpers/smtp";
import { TimelineRepository, ResultsRepository, StudentRepository } from "$lib/server/repository";
import { smSchools } from "$lib/server/db/sms-schema";
import { getDatabase } from "$lib/server/db";
import { marksheetSchema } from "$lib/schema/marksheet";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import ResultEmail from "$lib/components/template/result-email.svelte";

export interface PublishResultsParams {
  studentIds: number[];
  examId: number;
  resend?: boolean;
}

export interface PublishResultsResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
  results: Array<{ to?: string; messageId?: string; response?: string; studentId?: number }>;
}

export interface PublishTranscriptParams {
  studentId: number;
  academicId: number;
  parentName: string;
  parentEmail: string;
  studentName: string;
  pdfFilename: string;
  pdfBytes: Buffer;
  html: string;
}

export interface PublishTranscriptResult {
  success: boolean;
  message: string;
  messageId?: string;
}

function resolveSchoolLogoAbsolutePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "static", "school-logo.png"),
    path.join(process.cwd(), "static", "logo.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export class AssessmentPublisherService {
  private readonly provider: ScopedRepositoryProvider;

  constructor(provider: ScopedRepositoryProvider) {
    this.provider = provider;
  }

  private timeline(): TimelineRepository {
    return this.provider.getRepo(TimelineRepository);
  }

  private result(): ResultsRepository {
    return this.provider.getRepo(ResultsRepository);
  }

  private student(): StudentRepository {
    return this.provider.getRepo(StudentRepository);
  }

  async resolveSchoolIdentity(schoolId: number): Promise<{
    name: string;
    email: string;
    phone: string;
  }> {
    const db = await getDatabase();
    const [row] = await db
      .select({
        name: smSchools.schoolName,
        email: smSchools.email,
        phone: smSchools.phone,
      })
      .from(smSchools)
      .where(eq(smSchools.id, schoolId))
      .limit(1);
    return {
      name: row?.name ?? "Your School",
      email: row?.email ?? "noreply@school.local",
      phone: row?.phone ?? "",
    };
  }

  private async sendViaSmtp(args: {
    fromAddress: string;
    schoolName: string;
    toAddress: string;
    subject: string;
    html: string;
    text: string;
    attachments: Array<{ filename: string; content: Buffer }>;
  }): Promise<PublishTranscriptResult> {
    const smtp = new SMTPClient({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
    });

    try {
      const info = await smtp
        .from(`"${args.schoolName}" <${args.fromAddress}>`)
        .to(args.toAddress)
        .subject(args.subject)
        .html(args.html)
        .send();
      if (!info.success) {
        return { success: false, message: info.message };
      }
      return { success: true, message: "Email sent successfully", messageId: info.messageId };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async isEmailAlreadySent(studentId: number, examId: number): Promise<boolean> {
    const timelines = await this.timeline().getTimelinesByStudentId(studentId);
    return timelines.some((t: { type?: string | null }) => t.type?.startsWith(`exam-${examId}`));
  }

  async publishResults(params: PublishResultsParams): Promise<PublishResultsResult> {
    const { studentIds, examId, resend = false } = params;
    const messages: Array<{
      from: string;
      to: string;
      subject: string;
      html: string;
      attachments: Array<{ filename: string; path: string; cid?: string }>;
      studentId: number;
      studentName: string;
    }> = [];
    const CONCURRENCY_LIMIT = 5;
    const processingErrors: string[] = [];

    const assessment = this.provider.getTenant();

    const processStudent = async (studentId: number) => {
      try {
        if (!resend) {
          const alreadySent = await this.isEmailAlreadySent(studentId, examId);
          if (alreadySent) {
            processingErrors.push(`Student ${studentId}: Email already sent`);
            return null;
          }
        }

        const resultData = await this.result().queryResultData(
          (await this.student().getStudentById(studentId)) as never,
          examId,
        );
        const validatedResult = await marksheetSchema.safeParseAsync(resultData);
        if (!validatedResult.success || !resultData) {
          processingErrors.push(`Student ${studentId}: Result validation failed`);
          return null;
        }
        const { student, school } = validatedResult.data as never as {
          student: { id: number; fullName: string; adminNo: number | null; term: string; parentName: string; parentEmail: string };
          school: { id: number; name: string; email: string; phone: string; city: string; state: string; title: string; vacation_date: string; logo?: string };
        };

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
      } catch (error) {
        processingErrors.push(`Student ${studentId}: ${(error as Error).message || "Unknown error"}`);
        return null;
      }
    };

    for (let i = 0; i < studentIds.length; i += CONCURRENCY_LIMIT) {
      const chunk = studentIds.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(chunk.map((id) => processStudent(id)));
      messages.push(...(results.filter((m): m is (typeof messages)[number] => m !== null)));
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
    const emailResults: PublishResultsResult["results"] = [];
    let sentCount = 0;

    for (const message of messages) {
      try {
        const smtp = new SMTPClient({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT || 587) === 465,
          auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
        });
        const result = await smtp.from(message.from).to(message.to).subject(message.subject).html(message.html).send();
        if (!result.success) {
          emailErrors.push(result.message);
          continue;
        }

        sentCount++;
        const messageId = result.messageId;
        emailResults.push({
          to: message.to,
          messageId,
          response: undefined,
          studentId: message.studentId,
        });

        const timeline = {
          staffStudentId: message.studentId,
          type: `exam-${examId}-${messageId}`,
          title: "Result Notification",
          description: "TERMLY SUMMARY OF PROGRESS REPORT",
          visibleToStudent: 1,
          file: `result/${base64url.encode(JSON.stringify({ studentId: message.studentId, messageId, examId }))}`,
          date: new Date().toISOString().slice(0, 10),
          activeStatus: 1,
          schoolId: assessment.schoolId,
        };
        await this.timeline().upsertTimelines(timeline);
      } catch (err) {
        emailErrors.push((err as Error).message);
      }
    }

    return {
      success: sentCount > 0,
      sent: sentCount,
      failed: studentIds.length - sentCount,
      errors: [...processingErrors, ...emailErrors],
      results: emailResults,
    };
  }

  async publishTranscript(params: PublishTranscriptParams): Promise<PublishTranscriptResult> {
    const assessment = this.provider.getTenant();
    const school = await this.resolveSchoolIdentity(assessment.schoolId);

    const attachments: Array<{ filename: string; content: Buffer }> = [
      { filename: params.pdfFilename, content: params.pdfBytes },
    ];
    const logoPath = resolveSchoolLogoAbsolutePath();
    if (logoPath) {
      attachments.push({ filename: "logo.png", content: fs.readFileSync(logoPath) });
    }

    return this.sendViaSmtp({
      fromAddress: process.env.SMTP_FROM || school.email,
      schoolName: school.name,
      toAddress: params.parentEmail,
      subject: `Academic Transcript — ${params.studentName} — Academic Year ${params.academicId}`,
      html: params.html,
      text:
        `Dear ${params.parentName},\n\n` +
        `The academic transcript for ${params.studentName} (Academic Year ${params.academicId}) is attached.\n\n` +
        `Regards,\n${school.name}`,
      attachments,
    });
  }
}

export async function createAssessmentPublisherServiceForRequest(
  tenant: TenantContext,
): Promise<AssessmentPublisherService> {
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(db, tenant);
  return new AssessmentPublisherService(provider);
}
