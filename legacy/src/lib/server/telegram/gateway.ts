/**
 * Telegram Gateway — EdApex parent channel
 *
 * Chat SDK Chat singleton that handles:
 * - /start (welcome)
 * - /help (command reference)
 * - /result <child> <term> [year] (deterministic PDF delivery)
 * - /connect <token> (one-time MySQL reads → libSQL telegramParentLink insert)
 * - /logs [/clear] (admin-only log dump; gated by TELEGRAM_ADMIN_CHAT_ID)
 * - onAction (inline-keyboard callbacks from /result pickers)
 * - onDirectMessage (fallback template pointing to /help)
 *
 * Hard isolation: the parentAssistantAgent remains registered in the
 * mastra graph for the *web* concierge, but the Telegram gateway does
 * NOT call it. The Telegram channel is a deterministic command bot.
 */
import { Chat, type Message, type Thread, type SlashCommandEvent, type ActionEvent } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { and, asc, eq } from "drizzle-orm";
import { telegramAdapter, TELEGRAM_BOT_USERNAME, TELEGRAM_ADMIN_CHAT_ID } from "./bot";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { telegramParentLink } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { getDatabase } from "$lib/server/db";
import { smParents, smStudents, studentRecords } from "$lib/server/db/sms-schema";
import {
  dispatchAction,
  dispatchResult,
} from "$lib/server/telegram/pdf/dispatcher";
import { genericFreeText, help, welcome } from "$lib/server/telegram/pdf/messages";
import { getAdminLogger } from "./admin-logger";
import { getLogBuffer, type LogEntry } from "./log-buffer";
import { sendReplyKeyboard } from "./reply-keyboard";
import { ensureBotCommandsRegistered } from "./register-commands";
import { SchoolRepository } from "$lib/server/repository/school.repo";

ensureBotCommandsRegistered();

// ─── Connect flow state (ephemeral, per-chat) ──────────────────────────────

interface ConnectFlow {
  step: "awaiting_email" | "awaiting_code" | "awaiting_whatsapp";
  parentId: number;
  schoolId: number;
  userId: number;
  childIds: number[];
  childNames: string[];
  childClassIds: number[];
  blockedDomain?: string;
}

const connectFlows = new Map<string, ConnectFlow>();

const BLOCKED_DOMAINS = new Set([
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "aol.com", "aim.com",
]);

function blockedDomain(email: string): string | null {
  const m = email.match(/@([^@\s]+)$/);
  if (!m) return null;
  const d = m[1].toLowerCase();
  return BLOCKED_DOMAINS.has(d) ? d : null;
}

// ─── Cached parent context shape (stored on thread.state) ──────────────────

interface CachedParentContext {
  parentId: number;
  userId: number;
  schoolId: number;
  schoolName: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  childIds: number[];
  childNames: string[];
}

// ─── HMR-safe singleton ─────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __telegramBot: Chat<{ telegram: typeof telegramAdapter }, CachedParentContext> | undefined;
}

function buildBot(): Chat<
  { telegram: typeof telegramAdapter },
  CachedParentContext
> {
  return new Chat({
    userName: TELEGRAM_BOT_USERNAME,
    adapters: { telegram: telegramAdapter },
    state: createMemoryState(),
  });
}

export const bot: Chat<
  { telegram: typeof telegramAdapter },
  CachedParentContext
> =
  globalThis.__telegramBot ?? (globalThis.__telegramBot = buildBot());

// ─── /start handler ─────────────────────────────────────────────────────────

bot.onSlashCommand("start", async (event: SlashCommandEvent<CachedParentContext>) => {
  try {
    const isLinked = await isChatLinked(event);
    let schoolName: string | undefined;
    if (isLinked) {
      const contact = await resolveContactForEvent(event);
      schoolName = contact.schoolName ?? undefined;
    }
    await event.channel.post( welcome(isLinked, schoolName));
    await sendReplyKeyboard(String(event.channel.id), isLinked ? undefined : "Send /connect to link your account");
  } catch (err) {
    await getAdminLogger().error("telegram/start", err, { chatId: String(event.channel.id) });
  }
});

// ─── /help handler ──────────────────────────────────────────────────────────

bot.onSlashCommand("help", async (event: SlashCommandEvent<CachedParentContext>) => {
  try {
    const contact = await resolveContactForEvent(event);
    const isLinked = Boolean(contact.schoolName || contact.schoolPhone || contact.schoolEmail);
    await event.channel.post( help(contact, isLinked));
    await sendReplyKeyboard(String(event.channel.id));
  } catch (err) {
    await getAdminLogger().error("telegram/help", err, { chatId: String(event.channel.id) });
  }
});

// ─── /result handler (deterministic, no LLM) ────────────────────────────────

bot.onSlashCommand("result", async (event: SlashCommandEvent<CachedParentContext>) => {
  const chatId = String(event.channel.id);
  try {
    await dispatchResult({
      thread: event.channel as unknown as Thread<unknown>,
      argsText: event.text,
      chatId,
    });
  } catch (err) {
    await getAdminLogger().error("telegram/result", err, {
      chatId,
      argsText: event.text.slice(0, 80),
    });
    await event.channel.post( "I couldn't process that request. Please try again in a moment or contact the school office.");
  }
});

// ─── Inline-keyboard callback handler ───────────────────────────────────────

bot.onAction(async (event: ActionEvent) => {
  if (!event.thread) {
    return;
  }
  const chatId = String(event.thread.channelId);
  try {
    await dispatchAction(
      event.thread as unknown as Thread<unknown>,
      chatId,
      event.actionId,
    );
  } catch (err) {
    await getAdminLogger().error("telegram/action", err, {
      chatId,
      actionId: event.actionId,
    });
  }
});

// ─── /connect handler (email → code → WhatsApp state machine) ──────────────

bot.onSlashCommand(
  "connect",
  async (event: SlashCommandEvent<CachedParentContext>) => {
    try {
      const chatId = String(event.channel.id);
      const existing = connectFlows.get(chatId);
      if (existing) {
        await event.channel.post( "You already have a connection in progress. Send the information I asked for, or send /cancel to start over.");
        return;
      }
      connectFlows.set(chatId, { step: "awaiting_email" } as ConnectFlow);
      await event.channel.post( "Enter the email address you registered with the school:");
    } catch (err) {
      await getAdminLogger().error("telegram/connect", err, { chatId: String(event.channel.id) });
    }
  },
);

bot.onSlashCommand("cancel", async (event: SlashCommandEvent<CachedParentContext>) => {
  try {
    const chatId = String(event.channel.id);
    connectFlows.delete(chatId);
    await event.channel.post( "Cancelled. Send /connect to start over.");
  } catch (err) {
    await getAdminLogger().error("telegram/cancel", err, { chatId: String(event.channel.id) });
  }
});

// ─── /logs [/clear] (admin only) ───────────────────────────────────────────

bot.onSlashCommand("logs", async (event: SlashCommandEvent<CachedParentContext>) => {
  const chatId = String(event.channel.id);
  if (!isAdminChat(chatId)) {
    await event.channel.post( "I didn't understand that. Send /help to see the list of commands I support.");
    return;
  }
  const arg = event.text.trim().toLowerCase();
  if (arg === "clear") {
    getLogBuffer().clear();
    await event.channel.post( "Log buffer cleared.");
    return;
  }
  const entries = getLogBuffer().snapshot();
  const last = entries.slice(-50);
  if (last.length === 0) {
    await event.channel.post( "(log buffer is empty)");
    return;
  }
  const lines = last.map(formatLogEntryForTelegram);
  await event.channel.post( `Last ${last.length} log entries:\n\n${lines.join("\n\n")}`);
});

// ─── Direct-message handler (routes connect flow otherwise fallback) ────────

bot.onDirectMessage(
  async (
    thread: Thread<CachedParentContext>,
    message: Message,
  ) => {
    const chatId = String(thread.channelId);
    const flow = connectFlows.get(chatId);
    if (flow) {
      await handleConnectStep(thread, message.text.trim(), chatId, flow);
      return;
    }
    await thread.post( genericFreeText());
  },
);

// ─── Connect flow state machine ────────────────────────────────────────────

async function handleConnectStep(
  thread: Thread<CachedParentContext>,
  input: string,
  chatId: string,
  flow: ConnectFlow,
): Promise<void> {
  switch (flow.step) {
    case "awaiting_email":
      return handleConnectEmail(thread, input, chatId, flow);
    case "awaiting_code":
      return handleConnectCode(thread, input, chatId, flow);
    case "awaiting_whatsapp":
      return handleConnectWhatsApp(thread, input, chatId, flow);
  }
}

async function handleConnectEmail(
  thread: Thread<CachedParentContext>,
  email: string,
  chatId: string,
  flow: ConnectFlow,
): Promise<void> {
  if (!email.includes("@") || !email.includes(".")) {
    await thread.post( "That doesn't look like a valid email. Please try again:");
    return;
  }

  const domain = blockedDomain(email);
  if (domain && !flow.parentId) {
    await thread.post( "That email provider may block our messages. Please enter a Gmail address:");
    flow.blockedDomain = domain;
    return;
  }
  if (domain && flow.parentId) {
    await updateGuardiansEmail(flow.parentId, email);
    await thread.post( "Thanks! Your email has been updated.");
    flow.step = "awaiting_code";
    await thread.post( "Enter the 6-digit code from your child's teacher:");
    return;
  }

  const db = await getDatabase();
  const [parent] = await db
    .select({
      id: smParents.id,
      schoolId: smParents.schoolId,
      userId: smParents.userId,
    })
    .from(smParents)
    .where(eq(smParents.guardiansEmail, email))
    .limit(1);

  if (!parent) {
    await thread.post( "No account found with that email. Please contact the school office.");
    connectFlows.delete(chatId);
    return;
  }

  const children = await db
    .select({
      id: smStudents.id,
      fullName: smStudents.fullName,
      classId: studentRecords.classId,
    })
    .from(smStudents)
    .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
    .where(
      and(
        eq(smStudents.parentId, parent.id),
        eq(smStudents.activeStatus, 1),
        eq(studentRecords.activeStatus, 1),
        eq(studentRecords.isDefault, 1),
        eq(studentRecords.isGraduate, 0),
      ),
    )
    .orderBy(asc(smStudents.fullName));

  if (children.length === 0) {
    await thread.post( "No active children found for this account. Please contact the school office.");
    connectFlows.delete(chatId);
    return;
  }

  flow.parentId = parent.id;
  flow.schoolId = parent.schoolId ?? 1;
  flow.userId = parent.userId ?? 0;
  flow.childIds = children.map((c) => c.id);
  flow.childNames = children.map((c) => c.fullName).filter((n): n is string => n !== null);
  flow.childClassIds = [...new Set(children.map((c) => c.classId).filter((n): n is number => n !== null))];

  const blockedD = blockedDomain(email);
  if (blockedD) {
    flow.blockedDomain = blockedD;
    await thread.post( "That email provider may block our messages. Please enter a Gmail address:");
    return;
  }

  flow.step = "awaiting_code";
  await thread.post( "Enter the 6-digit code from your child's teacher:");
}

async function handleConnectCode(
  thread: Thread<CachedParentContext>,
  code: string,
  chatId: string,
  flow: ConnectFlow,
): Promise<void> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    await thread.post( "The code must be exactly 6 digits. Please try again:");
    return;
  }

  const db = await getDatabase();
  const [match] = await db
    .select({ id: smStudents.id })
    .from(smStudents)
    .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
    .where(
      and(
        eq(smStudents.parentId, flow.parentId),
        eq(smStudents.activeStatus, 1),
        eq(studentRecords.activeStatus, 1),
        eq(studentRecords.isDefault, 1),
        eq(studentRecords.isGraduate, 0),
      ),
    )
    .limit(1);

  if (!match) {
    await thread.post( "Invalid or expired code. Please ask your teacher for the current code.");
    return;
  }

  flow.step = "awaiting_whatsapp";
  await thread.post( "Enter your WhatsApp number with country code (e.g., +2348012345678):");
}

async function handleConnectWhatsApp(
  thread: Thread<CachedParentContext>,
  phone: string,
  chatId: string,
  flow: ConnectFlow,
): Promise<void> {
  const trimmed = phone.trim();
  if (!/^\+?\d{7,15}$/.test(trimmed)) {
    await thread.post( "Invalid number. Enter a valid WhatsApp number with country code (e.g., +2348012345678):");
    return;
  }

  const db = await getDatabase();
  try {
    await db
      .update(smParents)
      .set({ guardiansMobile: trimmed })
      .where(eq(smParents.id, flow.parentId));
  } catch (err) {
    await getAdminLogger().error("telegram/connect", "failed to update phone", {
      parentId: flow.parentId,
      error: String(err),
    });
  }

  const schoolRepo = await SchoolRepository.build();
  const schoolInfo = await schoolRepo.getSchoolInfo(flow.schoolId);

  const appDb = getAppDb();
  await appDb.insert(telegramParentLink).values({
    chatId,
    parentId: flow.parentId,
    userId: flow.userId,
    schoolId: flow.schoolId,
    schoolName: schoolInfo?.schoolName ?? null,
    schoolPhone: schoolInfo?.phone ?? null,
    schoolEmail: schoolInfo?.email ?? null,
    childIds: JSON.stringify(flow.childIds),
    childNames: JSON.stringify(flow.childNames),
  });

  await getAdminLogger().info("telegram/connect", "account linked", {
    parentId: flow.parentId,
    schoolId: flow.schoolId,
    childCount: flow.childIds.length,
    chatId,
  });

  connectFlows.delete(chatId);

  await thread.post( "✅ Your Telegram account is now linked! Send /result to get your child's latest report.");
  await sendReplyKeyboard(chatId);
}

async function updateGuardiansEmail(parentId: number, email: string): Promise<void> {
  const db = await getDatabase();
  try {
    await db
      .update(smParents)
      .set({ guardiansEmail: email })
      .where(eq(smParents.id, parentId));
  } catch (err) {
    await getAdminLogger().error("telegram/connect", "failed to update email", {
      parentId,
      error: String(err),
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isAdminChat(chatId: string): boolean {
  return TELEGRAM_ADMIN_CHAT_ID !== "" && chatId === TELEGRAM_ADMIN_CHAT_ID;
}

function formatLogEntryForTelegram(entry: LogEntry): string {
  const ts = new Date(entry.ts).toISOString();
  const ctx = entry.context
    ? " " + Object.entries(entry.context)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ")
    : "";
  return `[${entry.level}] ${ts} ${entry.source}: ${entry.message}${ctx}`;
}

async function isChatLinked(
  event: SlashCommandEvent<CachedParentContext>,
): Promise<boolean> {
  const chatId = String(event.channel.id);
  const appDb = getAppDb();
  const [link] = await appDb
    .select({ chatId: telegramParentLink.chatId })
    .from(telegramParentLink)
    .where(eq(telegramParentLink.chatId, chatId))
    .limit(1);
  return link !== undefined;
}

async function resolveContactForEvent(
  event: SlashCommandEvent<CachedParentContext>,
): Promise<{
  schoolName: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
}> {
  const chatId = String(event.channel.id);
  const appDb = getAppDb();
  const [link] = await appDb
    .select()
    .from(telegramParentLink)
    .where(eq(telegramParentLink.chatId, chatId))
    .limit(1);
  if (!link) {
    return { schoolName: null, schoolPhone: null, schoolEmail: null };
  }
  return {
    schoolName: link.schoolName,
    schoolPhone: link.schoolPhone,
    schoolEmail: link.schoolEmail,
  };
}
