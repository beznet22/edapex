/**
 * Dispatcher for the parent `/result` slash command and its inline-button
 * callbacks. Pure, deterministic, LLM-free.
 *
 * Flow:
 *   1. Load the parent link from libSQL.
 *   2. Resolve child (admissionNo / fullName / substring / ambiguous picker).
 *   3. Resolve term (sm_exam_types ⨝ sm_result_stores, filtered by hints).
 *   4. Render PDF via `renderResultPdfCore`.
 *   5. Post a `PostableMarkdown` with caption + file upload.
 *
 * Errors map to a single typed `pdfError()` template + the school
 * contact block. No exception escapes this module.
 */
import { eq } from "drizzle-orm";
import type { Thread } from "chat";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { telegramParentLink } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { getDatabase } from "$lib/server/db";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import {
  renderResultPdfCore,
  type RenderResultPdfFailureCode,
} from "$lib/server/mastra/tools/operations/reporting/generate-result-pdf-core";
import { buildCaption } from "./caption";
import {
  childKeyboard,
  decodeActionId,
  termKeyboard,
  yearKeyboard,
  type ChildOption,
  type TermOption,
  type YearOption,
} from "./keyboards";
import {
  childPickerPrompt,
  expiredPicker,
  genericFreeText,
  invalidArgs,
  noChildrenOnFile,
  noResultFound,
  notLinked,
  pdfError,
  termPickerPrompt,
  yearPickerPrompt,
  type SchoolContact,
} from "./messages";
import { filterOwned, resolveChild, type ChildCandidate } from "./resolveChild";
import { resolveTerm, type ExamTypeRow } from "./resolveTerm";
import { loadChildCandidates } from "./load-children";
import type { MySQLDrizzleClient } from "$lib/server/db";

export interface DispatcherContext {
  /** The chat thread (used for `post` and `setState`). */
  thread: Thread<unknown>;
  /** Slash command raw text, e.g. "Alice CA2 2024-2025". */
  argsText: string;
  /** The Telegram chat id (string form). */
  chatId: string;
}

interface ResolvedRequest {
  studentId: number;
  childName: string;
  examType: ExamTypeRow;
}

interface CachedButtonState {
  /** ISO datetime after which this state is stale. */
  expiresAt: string;
  /** Resolved student + child label (set after child disambiguation). */
  studentId?: number;
  childName?: string;
  /** Original term hint (set after child disambiguation). */
  termHint?: string | null;
  /** Original year hint (set after child disambiguation). */
  yearHint?: string | null;
}

const PICKER_TTL_MS = 5 * 60 * 1000;

function isExpired(state: CachedButtonState | null | undefined): boolean {
  if (!state?.expiresAt) return true;
  return Date.parse(state.expiresAt) < Date.now();
}

function makeState(): CachedButtonState {
  return { expiresAt: new Date(Date.now() + PICKER_TTL_MS).toISOString() };
}

function schoolContactFromLink(link: {
  schoolName: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
}): SchoolContact {
  return {
    schoolName: link.schoolName ?? null,
    schoolPhone: link.schoolPhone ?? null,
    schoolEmail: link.schoolEmail ?? null,
  };
}

async function loadParentLink(chatId: string): Promise<{
  parentId: number;
  schoolId: number;
  childIds: number[];
  childNames: string[];
  contact: SchoolContact;
} | null> {
  const appDb = getAppDb();
  const [link] = await appDb
    .select()
    .from(telegramParentLink)
    .where(eq(telegramParentLink.chatId, chatId))
    .limit(1);
  if (!link) return null;
  const childIds = JSON.parse(link.childIds) as number[];
  const childNames = JSON.parse(link.childNames) as string[];
  return {
    parentId: link.parentId,
    schoolId: link.schoolId,
    childIds,
    childNames,
    contact: schoolContactFromLink(link),
  };
}

function splitArgs(raw: string): {
  childHint: string | null;
  termHint: string | null;
  yearHint: string | null;
} {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { childHint: null, termHint: null, yearHint: null };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const only = parts[0];
    if (only === undefined) return { childHint: null, termHint: null, yearHint: null };
    return { childHint: only, termHint: null, yearHint: null };
  }
  if (parts.length === 2) {
    const [c, t] = parts;
    if (c === undefined || t === undefined) return { childHint: null, termHint: null, yearHint: null };
    return { childHint: c, termHint: t, yearHint: null };
  }
  const [c, t, ...yearParts] = parts;
  if (c === undefined || t === undefined) return { childHint: null, termHint: null, yearHint: null };
  return { childHint: c, termHint: t, yearHint: yearParts.join(" ") };
}

async function deliverPdf(
  thread: Thread<unknown>,
  contact: SchoolContact,
  request: ResolvedRequest,
  schoolId: number,
): Promise<void> {
  const tenant = createTenantContext({
    schoolId,
    userId: 0,
    staffId: 0,
    designationId: 0,
    examTypeId: request.examType.examTypeId,
    academicId: request.examType.academicId,
  });
  const rendered = await renderResultPdfCore({
    tenant,
    studentId: request.studentId,
    examTypeId: request.examType.examTypeId,
    academicId: request.examType.academicId,
  });

  if (!rendered.ok) {
    await postError(thread, contact, rendered.code, {
      childName: request.childName,
      termHint: request.examType.title,
      yearHint: request.examType.academicYear,
    });
    return;
  }

  const caption = buildCaption({
    marksheet: rendered.marksheet,
    termTitle: request.examType.title,
    academicYearLabel: request.examType.academicYear,
  });
  await thread.post({
    markdown: caption,
    files: [
      {
        data: rendered.pdfBuffer,
        filename: rendered.filename,
        mimeType: "application/pdf",
      },
    ],
  });
}

async function postError(
  thread: Thread<unknown>,
  contact: SchoolContact,
  code: RenderResultPdfFailureCode,
  context: { childName?: string; query?: string; termHint?: string; yearHint?: string | null },
): Promise<void> {
  await thread.post(pdfError(code, context, contact));
}

async function childPickerPost(
  thread: Thread<unknown>,
  children: ChildCandidate[],
): Promise<void> {
  const options: ChildOption[] = children.slice(0, 8).map((c) => ({
    studentId: c.studentId,
    label: `${c.fullName ?? "?"}${c.admissionNo !== null ? ` (#${c.admissionNo})` : ""}`,
  }));
  await thread.post({
    card: childKeyboard(options),
    fallbackText: childPickerPrompt(),
  });
}

async function termPickerPost(
  thread: Thread<unknown>,
  childName: string,
  examTypes: ExamTypeRow[],
): Promise<void> {
  const options: TermOption[] = examTypes.slice(0, 8).map((e) => ({
    examTypeId: e.examTypeId,
    label: `${e.title} — ${e.academicYear}`,
  }));
  await thread.post({
    card: termKeyboard(options),
    fallbackText: termPickerPrompt(childName),
  });
}

async function yearPickerPost(
  thread: Thread<unknown>,
  childName: string,
  termTitle: string,
  examTypes: ExamTypeRow[],
): Promise<void> {
  const options: YearOption[] = examTypes.slice(0, 8).map((e) => ({
    academicId: e.academicId,
    label: e.academicYear,
  }));
  await thread.post({
    card: yearKeyboard(options),
    fallbackText: yearPickerPrompt(childName, termTitle),
  });
}

async function proceedWithChild(
  thread: Thread<unknown>,
  contact: SchoolContact,
  schoolId: number,
  child: ChildCandidate,
  termHint: string | null,
  yearHint: string | null,
): Promise<void> {
  if (!child.fullName) {
    await thread.post(pdfError("STUDENT_NOT_FOUND", { childName: "(unknown)" }, contact));
    return;
  }
  const db: MySQLDrizzleClient = await getDatabase();
  const r = await resolveTerm({
    db,
    schoolId,
    studentId: child.studentId,
    termHint,
    yearHint,
  });
  if (r.kind === "not_found") {
    await thread.post(
      pdfError("MARKSHEET_NOT_FOUND", {
        childName: child.fullName,
        termHint: termHint ?? "(latest)",
        yearHint,
      }, contact),
    );
    return;
  }
  if (r.kind === "exact") {
    await deliverPdf(
      thread,
      contact,
      {
        studentId: child.studentId,
        childName: child.fullName,
        examType: r.examType,
      },
      schoolId,
    );
    return;
  }
  if (r.kind === "ambiguous_years") {
    await thread.setState({
      ...makeState(),
      studentId: child.studentId,
      childName: child.fullName,
      termHint,
      yearHint: null,
    } as unknown as Partial<Record<string, unknown>>);
    await yearPickerPost(thread, child.fullName, r.termTitle, r.examTypes);
    return;
  }
  // ambiguous_terms
  await thread.setState({
    ...makeState(),
    studentId: child.studentId,
    childName: child.fullName,
    termHint: null,
    yearHint,
  } as unknown as Partial<Record<string, unknown>>);
  await termPickerPost(thread, child.fullName, r.examTypes);
}

/**
 * Public entry point: dispatch a `/result` slash command. The caller
 * passes the raw args text (everything after `/result`).
 */
export async function dispatchResult(ctx: DispatcherContext): Promise<void> {
  const link = await loadParentLink(ctx.chatId);
  if (!link) {
    await ctx.thread.post(notLinked());
    return;
  }

  const { childHint, termHint, yearHint } = splitArgs(ctx.argsText);
  if (childHint === null) {
    const candidates = await loadChildCandidates(link.parentId, null, link.schoolId);
    const owned = filterOwned(link.childIds, candidates);
    if (owned.length === 0) {
      await ctx.thread.post(noChildrenOnFile());
      return;
    }
    if (owned.length === 1) {
      const only = owned[0];
      if (only) {
        await proceedWithChild(ctx.thread, link.contact, link.schoolId, only, null, null);
        return;
      }
    }
    await childPickerPost(ctx.thread, owned);
    return;
  }

  const candidates = await loadChildCandidates(link.parentId, null, link.schoolId);
  const owned = filterOwned(link.childIds, candidates);
  const resolution = resolveChild(childHint, owned);

  if (resolution.kind === "not_found") {
    await ctx.thread.post(pdfError("STUDENT_NOT_FOUND", { query: childHint }, link.contact));
    return;
  }
  if (resolution.kind === "ambiguous") {
    await childPickerPost(ctx.thread, resolution.matches);
    return;
  }
  await proceedWithChild(
    ctx.thread,
    link.contact,
    link.schoolId,
    resolution.matched,
    termHint,
    yearHint,
  );
}

/**
 * Action callback entry point. The caller passes the `actionId` from
 * the Chat SDK `ActionEvent`.
 */
export async function dispatchAction(
  thread: Thread<unknown>,
  chatId: string,
  actionId: string,
): Promise<void> {
  const decoded = decodeActionId(actionId);
  if (!decoded) {
    await thread.post(genericFreeText());
    return;
  }

  if (decoded.kind === "child" && decoded.args[0] === "cancel") {
    await thread.post(genericFreeText());
    return;
  }

  const link = await loadParentLink(chatId);
  if (!link) {
    await thread.post(notLinked());
    return;
  }

  if (decoded.kind === "child") {
    const studentId = Number(decoded.args[0]);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      await thread.post(invalidArgs());
      return;
    }
    const candidates = await loadChildCandidates(link.parentId, null, link.schoolId);
    const child = candidates.find((c) => c.studentId === studentId);
    if (!child) {
      await thread.post(pdfError("STUDENT_NOT_FOUND", { query: String(studentId) }, link.contact));
      return;
    }
    await proceedWithChild(thread, link.contact, link.schoolId, child, null, null);
    return;
  }

  if (decoded.kind === "term") {
    const examTypeId = Number(decoded.args[0]);
    if (!Number.isInteger(examTypeId) || examTypeId <= 0) {
      await thread.post(invalidArgs());
      return;
    }
    const state = (await thread.state) as CachedButtonState | null;
    if (isExpired(state) || !state?.studentId || !state?.childName) {
      await thread.post(expiredPicker());
      return;
    }
    const db: MySQLDrizzleClient = await getDatabase();
    const r = await resolveTerm({
      db,
      schoolId: link.schoolId,
      studentId: state.studentId,
      termHint: String(examTypeId),
      yearHint: state.yearHint ?? null,
    });
    if (r.kind !== "exact") {
      await thread.post(noResultFound(state.childName, String(examTypeId), state.yearHint ?? null));
      return;
    }
    await deliverPdf(thread, link.contact, {
      studentId: state.studentId,
      childName: state.childName,
      examType: r.examType,
    }, link.schoolId);
    return;
  }

  if (decoded.kind === "year") {
    const academicId = Number(decoded.args[0]);
    if (!Number.isInteger(academicId) || academicId <= 0) {
      await thread.post(invalidArgs());
      return;
    }
    const state = (await thread.state) as CachedButtonState | null;
    if (isExpired(state) || !state?.studentId || !state?.childName || !state.termHint) {
      await thread.post(expiredPicker());
      return;
    }
    const db: MySQLDrizzleClient = await getDatabase();
    const r = await resolveTerm({
      db,
      schoolId: link.schoolId,
      studentId: state.studentId,
      termHint: state.termHint,
      yearHint: String(academicId),
    });
    if (r.kind !== "exact") {
      await thread.post(noResultFound(state.childName, state.termHint, String(academicId)));
      return;
    }
    await deliverPdf(thread, link.contact, {
      studentId: state.studentId,
      childName: state.childName,
      examType: r.examType,
    }, link.schoolId);
    return;
  }

  await thread.post(genericFreeText());
}
