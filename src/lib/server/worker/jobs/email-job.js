import { parentPort, workerData } from "worker_threads";
import { createTransport } from "nodemailer";

/**
 * @typedef {Object} EmailData
 * @property {string} to - Recipient email address
 * @property {string} subject - Email subject
 * @property {string} html - HTML content of the email
 * @property {Object} smtpConfig - SMTP configuration
 * @property {string} [smtpConfig.host] - SMTP host
 * @property {number} [smtpConfig.port] - SMTP port
 * @property {boolean} [smtpConfig.secure] - Whether to use secure connection
 * @property {string} [smtpConfig.user] - SMTP username
 * @property {string} [smtpConfig.pass] - SMTP password
 * @property {string} [smtpConfig.from] - From address
 */

/**
 * @typedef {Object} WorkerData
 * @property {EmailData} emailData - Email data to send
 * @property {string} taskId - Unique task identifier
 */


const sendEmail = async /** @type {(emailData: EmailData) => Promise<any>} */(async (emailData) => {
  const { to, subject, html, smtpConfig } = emailData;
  const transporter = createTransporter(smtpConfig);

  const info = await transporter.sendMail({
    from: smtpConfig.from || process.env.SMTP_FROM || '"Edapex" <noreply@edapex.com>',
    to,
    subject,
    html
  });

  return info;
});

const createTransporter = /** @type {(smtpConfig: any) => any} */ ((smtpConfig) => {
  return createTransport({
    host: smtpConfig.host || process.env.SMTP_HOST,
    port: smtpConfig.port || parseInt(process.env.SMTP_PORT || "587"),
    secure: smtpConfig.secure ?? (process.env.SMTP_SECURE === "true"), // true for 465, false for other ports
    auth: {
      user: smtpConfig.user || process.env.SMTP_USER,
      pass: smtpConfig.pass || process.env.SMTP_PASS
    }
  });
});

// Process the email data passed to the worker
const processData = async () => {
  const { emailData, taskId } = workerData;

  try {
    const result = await sendEmail(emailData);
    parentPort?.postMessage({
      jobId: taskId,
      status: "success",
      result: { messageId: result.messageId, response: result.response }
    });
  } catch (/** @type {any} */ err) {
    parentPort?.postMessage({
      jobId: taskId,
      status: "error",
      error: err.message
    });
  } finally {
    parentPort?.close();
  }
};

processData();
