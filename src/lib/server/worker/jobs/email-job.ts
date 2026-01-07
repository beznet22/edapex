import { parentPort, workerData } from "worker_threads";
import { createTransport } from "nodemailer";
import type { Transporter, SendMailOptions } from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import type { Address } from "nodemailer/lib/mailer";

// Load environment variables in the worker context
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

interface EmailData {
  to: string;
  subject: string;
  html: string;
  smtpConfig: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
  };
}

interface WorkerData {
  data: SendMailOptions[];
  jobId: string;
}

interface EmailResult {
  to?: string | Address | (string | Address)[];
  messageId?: string;
  response?: string;
  studentId?: number;
}

interface SuccessMessage {
  jobId: string;
  status: "success";
  result: EmailResult;
}

interface ErrorMessage {
  jobId: string;
  status: "error";
  error: string;
}

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@edapex.com";
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Edapex";
const SMTP_TO = process.env.SMTP_TO;

const sendEmail = async (mailOptions: SendMailOptions): Promise<EmailResult> => {
  const isSSL = SMTP_PORT === 465; // true for 465, false for other ports

  const transport: Transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: isSSL,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  mailOptions.from = `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`;
  mailOptions.to = process.env.NODE_ENV === "development" ? SMTP_TO : mailOptions.to;
  const info = await transport.sendMail(mailOptions);
  return {
    messageId: info.messageId,
    to: mailOptions.to,
    response: info.response,
    studentId: (mailOptions as any).studentId,
  };
};

/**
 * Format SMTP error into a user-friendly message with technical details
 */
function formatSmtpError(err: any, recipient: string | undefined): string {
  const to = recipient || "unknown";
  const parts: string[] = [`Failed to send email to ${to}`];

  // SMTP response code (e.g., 550, 553, 421)
  if (err.responseCode) {
    parts.push(`SMTP code ${err.responseCode}`);
  }

  // Error code (e.g., ECONNREFUSED, ETIMEDOUT, EAUTH)
  if (err.code) {
    parts.push(`(${err.code})`);
  }

  // SMTP server response message
  if (err.response) {
    parts.push(`- Server response: "${err.response}"`);
  } else if (err.message) {
    parts.push(`- ${err.message}`);
  }

  return parts.join(" ");
}

(async (): Promise<void> => {
  const { data: emailJobs, jobId } = workerData as WorkerData;

  for (const job of emailJobs) {
    try {
      const result = await sendEmail(job);
      const successMessage: SuccessMessage = {
        jobId: jobId,
        status: "success",
        result,
      };
      parentPort?.postMessage(successMessage);
    } catch (err: any) {
      const errorMessage: ErrorMessage = {
        jobId,
        status: "error",
        error: formatSmtpError(err, job.to as string),
      };
      console.error("Failed to send email: ", err);
      parentPort?.postMessage(errorMessage);
    }
    // Delay between emails to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  parentPort?.close();
})();
