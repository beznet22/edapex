/**
 * Telegram Gateway — EdApex parent channel
 *
 * Chat SDK Chat singleton that handles:
 * - /start (welcome)
 * - /connect <token> (one-time MySQL reads → libSQL telegramParentLink insert)
 * - onDirectMessage (thread-state cache → libSQL fallback → parentAssistantAgent.stream → PDF detection)
 *
 * Hard isolation: this is the only consumer of parentAssistantAgent.
 * No webapp chat plumbing imports this module or the agent.
 */
import { Chat, type Message, type Thread, type SlashCommandEvent } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { eq, and } from "drizzle-orm";
import { RequestContext } from "@mastra/core/request-context";
import { telegramAdapter, TELEGRAM_BOT_USERNAME } from "./bot";
import { ConnectTokenStore } from "./connect-tokens";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { telegramParentLink } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { getDatabase } from "$lib/server/db";
import { smParents, smSchools, smStudents } from "$lib/server/db/sms-schema";
import { mastra } from "$lib/server/mastra";
import { ParentContext } from "$lib/server/mastra/tools/internal/parent-permissions";

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
  await event.channel.post(
    "👋 Welcome to EdApex! Open the school portal and click 'Connect Telegram' to link your account.",
  );
});

// ─── /connect <token> handler ────────────────────────────────────────────────

bot.onSlashCommand(
  "connect",
  async (event: SlashCommandEvent<CachedParentContext>) => {
    const token = event.text.trim().split(/\s+/)[0];
    if (!token) {
      await event.channel.post(
        "❌ Missing connect token. Please use the link from the school portal.",
      );
      return;
    }

    const consumed = await ConnectTokenStore.getInstance().consumeToken(token);
    if (!consumed) {
      await event.channel.post(
        "❌ Invalid or expired link. Please request a new one from the school portal.",
      );
      return;
    }

    const db = await getDatabase();
    const [parentRows, schoolRows, childRows] = await Promise.all([
      db
        .select({
          userId: smParents.userId,
          schoolId: smParents.schoolId,
        })
        .from(smParents)
        .where(eq(smParents.id, consumed.parentId))
        .limit(1),
      db
        .select({
          schoolName: smSchools.schoolName,
          phone: smSchools.phone,
          email: smSchools.email,
        })
        .from(smSchools)
        .where(eq(smSchools.id, consumed.schoolId))
        .limit(1),
      db
        .select({
          id: smStudents.id,
          fullName: smStudents.fullName,
        })
        .from(smStudents)
        .where(
          and(
            eq(smStudents.parentId, consumed.parentId),
            eq(smStudents.activeStatus, 1),
          ),
        )
        .orderBy(smStudents.id),
    ]);

    const parent = parentRows[0];
    if (!parent) {
      await event.channel.post(
        "❌ Parent record not found. Please contact the school office.",
      );
      return;
    }

    const school = schoolRows[0];
    const childIds = childRows.map((r) => r.id);
    const childNames = childRows
      .map((r) => r.fullName)
      .filter((name): name is string => Boolean(name));

    const appDb = getAppDb();
    const chatId = String(event.channel.id);
    await appDb.insert(telegramParentLink).values({
      chatId,
      parentId: consumed.parentId,
      userId: parent.userId ?? 0,
      schoolId: consumed.schoolId,
      schoolName: school?.schoolName ?? null,
      schoolPhone: school?.phone ?? null,
      schoolEmail: school?.email ?? null,
      childIds: JSON.stringify(childIds),
      childNames: JSON.stringify(childNames),
    });

    await event.channel.post(
      "✅ Your Telegram account is now linked to EdApex. Send any question to chat with the School Concierge.",
    );
  },
);

// ─── Direct-message handler ─────────────────────────────────────────────────

type PdfCapture = { base64: string; filename: string };

function isToolResultEvent(
  event: unknown,
): event is { toolName: string; result: unknown } {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  return (
    e.type === "tool-result" &&
    typeof e.toolName === "string" &&
    "result" in e
  );
}

bot.onDirectMessage(
  async (
    thread: Thread<CachedParentContext>,
    message: Message,
  ) => {
    const cached = (await thread.state) as CachedParentContext | null;

    let ctx: CachedParentContext;
    if (cached && typeof cached.parentId === "number") {
      ctx = cached;
    } else {
      const appDb = getAppDb();
      const chatId = String(thread.channelId);
      const [link] = await appDb
        .select()
        .from(telegramParentLink)
        .where(eq(telegramParentLink.chatId, chatId))
        .limit(1);

      if (!link) {
        await thread.post(
          "⚠️ Your account is not linked. Open the school portal and click 'Connect Telegram' to link it.",
        );
        return;
      }

      ctx = {
        parentId: link.parentId,
        userId: link.userId,
        schoolId: link.schoolId,
        schoolName: link.schoolName,
        schoolPhone: link.schoolPhone,
        schoolEmail: link.schoolEmail,
        childIds: JSON.parse(link.childIds) as number[],
        childNames: JSON.parse(link.childNames) as string[],
      };

      await thread.setState(ctx);
    }

    const parentContext = new ParentContext();
    parentContext.parentId = ctx.parentId;
    parentContext.userId = ctx.userId;
    parentContext.schoolId = ctx.schoolId;
    parentContext.schoolName = ctx.schoolName ?? undefined;
    parentContext.schoolPhone = ctx.schoolPhone ?? undefined;
    parentContext.schoolEmail = ctx.schoolEmail ?? undefined;
    parentContext.childIds = ctx.childIds;
    parentContext.telegramChatId = String(thread.channelId);
    parentContext.verifiedAt = new Date().toISOString();

    const requestContext = new RequestContext();
    requestContext.set("tenantContext", parentContext);
    requestContext.set("lastMessage", message.text);
    requestContext.set("isSlashCommand", false);

    const agent = mastra.getAgent("parent-assistant");
    try {
      const result = await agent.stream(message.text, {
        requestContext,
        memory: {
          thread: `telegram-parent-${ctx.parentId}`,
          resource: `parent-${ctx.parentId}`,
        },
        maxSteps: 30,
      });

      let captured: PdfCapture | null = null;
      for await (const event of result.fullStream) {
        if (!isToolResultEvent(event)) continue;
        if (event.toolName !== "generate-result-pdf") continue;
        const r = event.result;
        if (!r || typeof r !== "object") continue;
        const resultObj = r as Record<string, unknown>;
        const base64 = resultObj.pdfBase64;
        if (typeof base64 === "string" && base64.length > 0) {
          captured = {
            base64,
            filename:
              typeof resultObj.filename === "string"
                ? resultObj.filename
                : "report-card.pdf",
          };
        }
      }

      await thread.post(result.fullStream);

      if (captured) {
        await thread.post({
          markdown: `📎 ${captured.filename}`,
          files: [
            {
              data: Buffer.from(captured.base64, "base64"),
              filename: captured.filename,
              mimeType: "application/pdf",
            },
          ],
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram/gateway] agent error: ${msg}`);

      const contactLines = [
        ctx.schoolName ?? "the school",
        ctx.schoolPhone ? `📞 ${ctx.schoolPhone}` : null,
        ctx.schoolEmail ? `📧 ${ctx.schoolEmail}` : null,
      ].filter(Boolean);
      await thread.post(
        `I'm sorry, I can't process that request. Please contact ${contactLines.join("\n")}`,
      );
    }
  },
);
