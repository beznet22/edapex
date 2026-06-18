import { sql } from "drizzle-orm";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "$lib/server/mastra";
import { getDatabase } from "$lib/server/db";
import { sendMessage, type TelegramUpdate } from "./bot";
import { ConnectTokenStore } from "./connect-tokens";
import { ParentContext } from "$lib/server/mastra/tools/parent-permissions";

interface ParentRow {
  id: number;
  user_id: number;
  school_id: number;
  telegram_phone: string | null;
  telegram_chat_id: string | null;
}

interface ChildIdRow {
  id: number;
}

interface ChildNameRow {
  id: number;
  full_name: string | null;
}

const MAX_TELEGRAM_MESSAGE_CHARS = 4000;

type ParentContextWithChildren = ParentContext & { childNames: string[] };

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] }).rows;
  return rows ?? [];
}

async function findParentByChatId(chatId: string): Promise<ParentRow | null> {
  const db = await getDatabase();
  const result = await db.execute(
    sql<ParentRow>`SELECT id, user_id, school_id, telegram_phone, telegram_chat_id FROM sm_parents WHERE telegram_chat_id = ${chatId} LIMIT 1`,
  );
  return readRows<ParentRow>(result)[0] ?? null;
}

async function resolveChildIds(parentId: number): Promise<number[]> {
  const db = await getDatabase();
  const result = await db.execute(
    sql<ChildIdRow>`SELECT id FROM sm_students WHERE parent_id = ${parentId} AND active_status = 1 ORDER BY id ASC`,
  );
  return readRows<ChildIdRow>(result).map((r) => r.id);
}

async function getChildrenNames(parentId: number): Promise<string[]> {
  const db = await getDatabase();
  const result = await db.execute(
    sql<ChildNameRow>`SELECT id, full_name FROM sm_students WHERE parent_id = ${parentId} AND active_status = 1 ORDER BY id ASC`,
  );
  return readRows<ChildNameRow>(result)
    .map((r) => r.full_name)
    .filter((name): name is string => Boolean(name));
}

async function linkParentToChat(parentId: number, chatId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    sql`UPDATE sm_parents SET telegram_chat_id = ${chatId}, telegram_linked_at = NOW() WHERE id = ${parentId}`,
  );
}

function truncateForTelegram(text: string): string {
  if (text.length <= MAX_TELEGRAM_MESSAGE_CHARS) return text;
  return text.slice(0, MAX_TELEGRAM_MESSAGE_CHARS) + "…";
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (!update.message?.text) return;
  const chatId = String(update.message.chat.id);
  const text = update.message.text.trim();
  const tokenStore = ConnectTokenStore.getInstance();

  if (text.startsWith("/connect ")) {
    const token = text.slice(9).trim();
    const consumed = await tokenStore.consumeToken(token);
    if (!consumed) {
      await sendMessage(chatId, "❌ Invalid or expired link.");
      return;
    }
    await linkParentToChat(consumed.parentId, chatId);
    await sendMessage(
      chatId,
      "✅ Your Telegram account is now linked to EdApex. Send any question to chat with the assistant.",
    );
    return;
  }

  if (text === "/start") {
    await sendMessage(
      chatId,
      "👋 Welcome to EdApex! Open the school portal and click 'Connect Telegram' to link your account.",
    );
    return;
  }

  const parent = await findParentByChatId(chatId);
  if (!parent) {
    await sendMessage(chatId, "⚠️ Your account is not linked.");
    return;
  }

  const [childIds, childNames] = await Promise.all([
    resolveChildIds(parent.id),
    getChildrenNames(parent.id),
  ]);

  const parentContext: ParentContextWithChildren = {
    parentId: parent.id,
    userId: parent.user_id,
    schoolId: parent.school_id,
    childIds,
    telegramChatId: chatId,
    phoneNumber: parent.telegram_phone ?? undefined,
    verifiedAt: new Date().toISOString(),
    childNames,
  };

  const requestContext = new RequestContext();
  requestContext.set("tenantContext", parentContext);
  requestContext.set("forcedToolGroup", "parent");
  requestContext.set("lastMessage", text);
  requestContext.set("isSlashCommand", false);

  const agent = mastra.getAgent("assistant");
  const stream = await agent.stream(text, {
    requestContext: requestContext as never,
    memory: {
      thread: `telegram-parent-${parent.id}`,
      resource: `parent-${parent.id}`,
    },
    maxSteps: 30,
  });

  let buffer = "";
  for await (const chunk of stream.textStream) {
    buffer += chunk;
  }

  if (!buffer) {
    await sendMessage(chatId, "🤖 The assistant did not return a response.");
    return;
  }

  await sendMessage(chatId, truncateForTelegram(buffer));
}
