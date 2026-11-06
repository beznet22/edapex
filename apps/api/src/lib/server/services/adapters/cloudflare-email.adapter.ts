import { PortError } from "../errors";
import type {
  EmailBindingLike,
  EmailMessage,
  EmailSender,
  EmailTemplateData
} from "../ports";

export interface CloudflareEmailOptions {
  readonly binding: unknown;
  readonly from: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isEmailBinding = (value: unknown): value is EmailBindingLike => {
  if (!isRecord(value)) return false;
  const send = value["send"];
  return typeof send === "function";
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const textValue = (
  data: EmailTemplateData,
  key: string,
  fallback: string
): string => {
  const value = data[key];
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number") return String(value);
  return fallback;
};

const render = (message: EmailMessage): { subject: string; text: string; html: string } => {
  if (message.template === "transcript") {
    const studentName = textValue(message.data, "studentName", "the student");
    const schoolName = textValue(message.data, "schoolName", "EdApex");
    const academicYear = textValue(message.data, "academicYear", "");
    const subject = textValue(
      message.data,
      "transcriptSubject",
      `Academic Transcript — ${studentName}${academicYear.length > 0 ? ` — ${academicYear}` : ""}`
    );
    const text = `${schoolName}\n\nAcademic transcript for ${studentName} is attached.`;
    return {
      subject,
      text,
      html: `<p>${escapeHtml(schoolName)}</p><p>Academic transcript for ${escapeHtml(studentName)} is attached.</p>`
    };
  }

  const schoolName = textValue(message.data, "schoolName", "EdApex");
  const studentName = textValue(message.data, "studentName", "the student");
  const principal = textValue(message.data, "principal", "");
  const support = textValue(message.data, "support", "");
  const subject = textValue(message.data, "resultEmailSubject", "Result Notification");
  const text = `${schoolName}\n\nResult for ${studentName} is ready.${principal.length > 0 ? `\n\nPrincipal: ${principal}` : ""}${support.length > 0 ? `\nSupport: ${support}` : ""}`;
  return {
    subject,
    text,
    html: `<p>${escapeHtml(schoolName)}</p><p>Result for ${escapeHtml(studentName)} is ready.</p>${principal.length > 0 ? `<p>Principal: ${escapeHtml(principal)}</p>` : ""}${support.length > 0 ? `<p>Support: ${escapeHtml(support)}</p>` : ""}`
  };
};

const messageIdOf = (result: unknown): string => {
  if (!isRecord(result)) return "";
  const messageId = result["messageId"];
  return typeof messageId === "string" ? messageId : "";
};

export class CloudflareEmailAdapter implements EmailSender {
  constructor(private readonly options: CloudflareEmailOptions) {}

  async send(message: EmailMessage): Promise<{ readonly messageId: string }> {
    if (!isEmailBinding(this.options.binding)) {
      throw new PortError("email", "Email binding is not configured", false);
    }

    const rendered = render(message);
    try {
      const result = await this.options.binding.send({
        from: this.options.from,
        to: message.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
      return { messageId: messageIdOf(result) };
    } catch (error) {
      throw new PortError("email", "Email send failed", true, { cause: error });
    }
  }
}
