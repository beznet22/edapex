import { SMTPClient, type SMTPMessage, type SMTPResult } from "$lib/server/helpers/smtp";

export type JobResult = SMTPResult | any;
interface JobPayload {
  type: string;
  payload: any;
}

export const jobHandlers: { [key: string]: (job: JobPayload) => Promise<JobResult> } = {
  "send-email": async (job) => {
    const payload = job.payload;
    console.log("Processing email job:", payload);

    const { to, subject, text, html, from } = payload as SMTPMessage;
    if (!to || !subject || !text || !html) {
      throw new Error("Invalid email payload: missing required fields");
    }

    const smtpClient = new SMTPClient();
    smtpClient.from(from).to(to).subject(subject).text(text).html(html);
    const result = await smtpClient.send();
    if (!result.success) {
      throw new Error(`Failed to send email: ${result.message}`);
    }

    console.log("Email sent successfully:", result.messageId);
    return result;
  },
  "generate-pdf": async (payload) => {
    console.log("Processing PDF generation job:", payload);
    // Actual PDF generation logic would go here
    // Example: await generatePdf(payload);
  },
  "result-processing": async (payload) => {
    console.log("Processing result job:", payload);
    // Actual result processing logic would go here
    // Example: await processResult(payload);
  },
  // Add more job handlers as needed
};
