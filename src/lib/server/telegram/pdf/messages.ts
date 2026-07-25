import type { RenderResultPdfFailureCode } from "$lib/server/mastra/tools/operations/reporting/generate-result-pdf-core";

export interface SchoolContact {
  schoolName: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
}

export function escape(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input);
}

function contactBlock(contact: SchoolContact): string {
  const lines: string[] = [];
  if (contact.schoolName) lines.push(contact.schoolName);
  if (contact.schoolPhone) lines.push(`📞 ${escape(contact.schoolPhone)}`);
  if (contact.schoolEmail) lines.push(`📧 ${escape(contact.schoolEmail)}`);
  return lines.length === 0 ? "" : lines.join("\n");
}

export function welcome(isLinked: boolean, schoolName?: string): string {
  const greeting = schoolName
    ? `👋 Welcome to ${escape(schoolName)}!`
    : "👋 Welcome!";
  if (isLinked) {
    return [
      greeting,
      "",
      "Send /result to get your child's latest report, or /help to see all commands.",
    ].join("\n");
  }
  return [
    greeting,
    "",
    "To get started, send /connect to link your Telegram account.",
  ].join("\n");
}

export function help(contact: SchoolContact, isLinked: boolean): string {
  const title = contact.schoolName
    ? `📚 ${escape(contact.schoolName)} - Parent Bot`
    : "📚 Parent Bot";
  const lines: string[] = [
    title,
    "",
    "Here are the commands I understand:",
    "",
    "/result <child> <term> [year]",
    "   Sends your child's result as a PDF.",
    "   <child>  - full or partial name, or admission number",
    "   <term>   - exam title (e.g. CA1, CA2, Mid-Term, Final)",
    "   [year]   - academic year (optional; defaults to the latest)",
    "",
    "/connect",
    "   Link this Telegram chat to your school portal account.",
    "",
    "/help",
    "   Show this message.",
  ];
  if (!isLinked) {
    lines.splice(1, 0, "", "⚠️ Your account isn't linked yet - send /connect to get started.");
  }
  const cb = contactBlock(contact);
  if (cb) {
    lines.push("", "Need help? Contact:", cb);
  }
  return lines.join("\n");
}

export function notLinked(): string {
  return [
    "⚠️ Your account is not linked",
    "",
    "Send /connect to link this chat to your school account.",
  ].join("\n");
}

export function unrecognizedCommand(): string {
  return "I didn't understand that. Send /help to see the list of commands I support.";
}

export function genericFreeText(): string {
  return [
    "I'm a focused command bot - I don't have a free-form chat mode on Telegram.",
    "",
    "Send /help to see the commands I understand.",
  ].join("\n");
}

export function childPickerPrompt(): string {
  return [
    "I found more than one child matching your request.",
    "Please pick the right one:",
  ].join("\n");
}

export function noChildrenOnFile(): string {
  return "I couldn't find any children linked to your account. Please contact the school office.";
}

export function termPickerPrompt(childName: string): string {
  return `Pick the term for ${escape(childName)}:`;
}

export function yearPickerPrompt(childName: string, termTitle: string): string {
  return `Pick the academic year for ${escape(childName)} - ${escape(termTitle)}:`;
}

export function noResultFound(childName: string, termHint: string, yearHint: string | null): string {
  const yh = yearHint ? ` (${escape(yearHint)})` : "";
  return `No result has been published yet for ${escape(childName)} - ${escape(termHint)}${yh}.`;
}

export function studentNotFound(query: string): string {
  return `I couldn't find a child matching ${escape(query)} on your account. Use the admission number or try a different spelling.`;
}

export function noStudentSession(childName: string): string {
  return `No class is currently assigned to ${escape(childName)} for this year. Please contact the school office.`;
}

export function pdfRenderFailed(): string {
  return "I couldn't generate the PDF right now. Please try again in a minute or contact the school office.";
}

export function invalidArgs(): string {
  return [
    "Usage: /result <child> <term> [year]",
    "",
    "Example: /result Alice CA2 2024-2025",
    "Send /help for more information.",
  ].join("\n");
}

export function schoolContact(contact: SchoolContact): string {
  return contactBlock(contact);
}

export function pdfError(
  code: RenderResultPdfFailureCode,
  context: { childName?: string; query?: string; termHint?: string; yearHint?: string | null },
  contact: SchoolContact,
): string {
  let primary: string;
  switch (code) {
    case "STUDENT_NOT_FOUND":
      primary = studentNotFound(context.query ?? context.childName ?? "(unknown)");
      break;
    case "NO_STUDENT_SESSION":
      primary = noStudentSession(context.childName ?? "(unknown)");
      break;
    case "MARKSHEET_NOT_FOUND":
      primary = noResultFound(
        context.childName ?? "(unknown)",
        context.termHint ?? "(unknown)",
        context.yearHint ?? null,
      );
      break;
    case "PDF_RENDER_FAILED":
      primary = pdfRenderFailed();
      break;
    case "INVALID_INPUT":
      primary = invalidArgs();
      break;
  }
  const cb = contactBlock(contact);
  return cb ? `${primary}\n\n${cb}` : primary;
}

export function expiredPicker(): string {
  return "That option has expired. Please send your request again.";
}

// ─── Connect flow templates ──────────────────────────────────────────────

export function connectEmailPrompt(): string {
  return "Enter the email address you registered with the school:";
}

export function connectEmailBlocked(domain: string): string {
  return `That email provider (${escape(domain)}) may block our messages. Please enter a Gmail address instead:`;
}

export function connectEmailNotFound(email: string): string {
  return `No account found with the email ${escape(email)}. Please contact the school office.`;
}

export function connectEmailUpdated(): string {
  return "Thanks! Your email has been updated.";
}

export function connectCodePrompt(): string {
  return "Enter the 6-digit code from your child's teacher:";
}

export function connectCodeInvalid(): string {
  return "Invalid or expired code. Please ask your teacher for the current code.";
}

export function connectWhatsAppPrompt(): string {
  return "Enter your WhatsApp number with country code (e.g., +2348012345678):";
}

export function connectWhatsAppInvalid(): string {
  return "Invalid number. Enter a valid WhatsApp number with country code (e.g., +2348012345678).";
}

export function connectSuccess(schoolName?: string): string {
  const school = schoolName ? ` to ${escape(schoolName)}` : "";
  return `✅ Your Telegram account is now linked${school}! Send /result to get your child's latest report.`;
}
