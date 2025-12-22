import { parentPort, workerData } from "worker_threads";
import { createTransport } from "nodemailer";
import type { Transporter, SendMailOptions } from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import type { Address } from "nodemailer/lib/mailer";

// Load environment variables in the worker context
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

// Try to get from worker data first, then fall back to environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"Edapex" <noreply@edapex.com>';

const sendEmail = async (mailOptions: SendMailOptions): Promise<EmailResult> => {
  // Determine if we should use SSL (port 465) or TLS (port 587, 25, etc.)
  const isSSL = SMTP_PORT === 465;
  
  const transport: Transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: isSSL, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  mailOptions.from = SMTP_FROM;
  const info = await transport.sendMail(mailOptions);
  return { messageId: info.messageId, to: mailOptions.to, response: info.response };
};

// Process the email data passed to the worker
const processData = async (): Promise<void> => {
  const { data: emailJobs, jobId } = workerData as WorkerData;

  for (const job of emailJobs) {
    const { to, subject, html } = job;
    try {
      const result = await sendEmail({ to, subject, html });
      const successMessage: SuccessMessage = {
        jobId: jobId,
        status: "success",
        result,
      };
      await new Promise((resolve) => setTimeout(resolve, 10000));
      parentPort?.postMessage(successMessage);
    } catch (err: any) {
      const errorMessage: ErrorMessage = {
        jobId,
        status: "error",
        error: `Failed to send email to ${to}: ${err.message}`,
      };
      console.error("Failed to send email: ", err);
      parentPort?.postMessage(errorMessage);
    }
    // Delay between emails to respect rate limits (e.g., Gmail's 300 per day limit)
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay between emails
  }
  parentPort?.close();
};

processData();

