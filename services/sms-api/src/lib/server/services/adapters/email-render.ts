import type { EmailMessage, EmailTemplateData } from "../ports";

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const textValue = (data: EmailTemplateData, key: string, fallback: string): string => {
  const value = data[key];
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number") return String(value);
  return fallback;
};

export function renderEmail(message: EmailMessage): RenderedEmail {
  if (message.template === "magic_link") {
    const url = textValue(message.data, "url", "");
    const minutes = textValue(message.data, "expiresMinutes", "15");
    return {
      subject: "Sign in to EdApex",
      text: `Use this link to sign in to EdApex:\n\n${url}\n\nThis link expires in ${minutes} minutes. If you did not request it, ignore this email.`,
      html: `<p>Use this link to sign in to EdApex:</p><p><a href="${escapeHtml(url)}">Sign in</a></p><p>This link expires in ${escapeHtml(minutes)} minutes. If you did not request it, ignore this email.</p>`
    };
  }

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
}
