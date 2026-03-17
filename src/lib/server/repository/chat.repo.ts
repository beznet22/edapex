import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { BaseRepository } from "./base.repo";
import { DbInternalError, DbEntityNotFoundError, unwrapSingleQueryResult } from "$lib/server/helpers/errors";
import {
  chats,
  messages,
  votes,
  aiDocuments,
  aiSuggestions,
  type MessagePart,
} from "$lib/server/db/domain-ai";
import { users, accounts } from "$lib/server/db/domain-core";
import type { xUIMessage } from "$lib/types/chat-types";
import { convertToUIMessages } from "$lib/utils";

export interface AuthUser {
  id: number;
  roleId?: number;
  staffId?: number;
  designationId?: number;
  departmentId?: number;
  activeStatus?: number;
  fullName?: string;
  username?: string;
  email?: string;
  usertype?: string;
  isRegistered?: number;
  isAdministrator?: string;
  verified?: boolean;
  deviceToken?: string;
  walletBalance?: number;
  schoolId?: number;
  academicId?: number;
}


type DBChat = typeof chats.$inferSelect;
type Vote = typeof votes.$inferSelect;
type Document = typeof aiDocuments.$inferSelect;
type Suggestion = typeof aiSuggestions.$inferSelect;

export class ChatRepository extends BaseRepository {
  constructor() {
    super();
  }

  async createChat({ userId, title, id, model }: Partial<DBChat>): Promise<string> {
    try {
      const result = await this.db
        .insert(chats)
        .values({
          id: id!,
          tenantId: this.tenant.tenantId,
          userId: userId!,
          title: title || "New Chat",
          model: model || "chat-model",
        });

      return id!;
    } catch (error) {
      console.error("Failed to create chat", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async updateChat({ id, title }: Partial<DBChat>): Promise<DBChat | null> {
    if (!id) return null;
    try {
      await this.db.update(chats).set({ title }).where(eq(chats.id, id));
      const rows = await this.db.select().from(chats).where(eq(chats.id, id));
      return (rows[0] as DBChat) || null;
    } catch (error) {
      console.error("Failed to update chat", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async upsertMessage({ chatId, message }: { chatId: string; message: xUIMessage }): Promise<void> {
    const { role, parts, id } = message;
    await this.db
      .insert(messages)
      .values({
        id,
        chatId,
        role: (role as any) ?? "user",
        parts: parts ?? [],
        metadata: message.metadata as any,
      })
      .onDuplicateKeyUpdate({ set: { role: (role as any) ?? "user", parts: parts ?? [] } });
  }

  async loadMessages(chatId: string): Promise<any[]> {
    try {
      const msgRows = await this.db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(asc(messages.createdAt));

      return convertToUIMessages(msgRows);
    } catch (error) {
      console.error("Failed to load messages", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getChatById(chatId: string): Promise<DBChat | null> {
    try {
      const rows = await this.db.select().from(chats).where(eq(chats.id, chatId));
      return (rows[0] as DBChat) || null;
    } catch (error) {
      console.error("Failed to get chat by id", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getChatsByUserId({ id }: { id: number }): Promise<DBChat[]> {
    try {
      const rows = await this.db
        .select()
        .from(chats)
        .where(eq(chats.userId, id))
        .orderBy(desc(chats.createdAt));
      return rows as DBChat[];
    } catch (error) {
      console.error("Failed to get chats by user id", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getChats(): Promise<DBChat[]> {
    try {
      return await this.db.select().from(chats) as DBChat[];
    } catch (error) {
      console.error("Failed to get chats", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async deleteChat(chatId: string): Promise<void> {
    try {
      await this.db.delete(chats).where(eq(chats.id, chatId));
    } catch (error) {
      console.error("Failed to delete chat", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const [msg] = await tx.select().from(messages).where(eq(messages.id, messageId)).limit(1);
        if (!msg) return;

        await tx
          .delete(messages)
          .where(and(eq(messages.chatId, msg.chatId), gt(messages.createdAt, msg.createdAt!)));

        await tx.delete(messages).where(eq(messages.id, messageId));
      });
    } catch (error) {
      console.error("Failed to delete message", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async voteMessage({
    chatId,
    messageId,
    type,
  }: {
    chatId: string;
    messageId: string;
    type: "up" | "down";
  }): Promise<void> {
    try {
      await this.db
        .insert(votes)
        .values({
          chatId,
          messageId,
          isUpvoted: type === "up" ? 1 : 0,
        })
        .onDuplicateKeyUpdate({ set: { isUpvoted: type === "up" ? 1 : 0 } });
    } catch (error) {
      console.error("Failed to vote message", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getVotesByChatId({ id }: { id: string }): Promise<Vote[]> {
    return await this.db.select().from(votes).where(eq(votes.chatId, id)) as Vote[];
  }

  async updateChatVisibilityById({
    chatId,
    visibility,
  }: {
    chatId: string;
    visibility: "private" | "public";
  }): Promise<void> {
    try {
      await this.db.update(chats).set({ visibility }).where(eq(chats.id, chatId));
    } catch (error) {
      console.error("Failed to update chat visibility", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async saveDocument({
    id,
    title,
    kind,
    content,
  }: {
    id: string;
    title: string;
    kind: "text" | "code" | "image" | "sheet";
    content: string;
  }): Promise<void> {
    try {
      await this.db.insert(aiDocuments).values({
        id,
        title,
        kind,
        content,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error("Failed to save document", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getSuggestionsByDocumentId({ documentId }: { documentId: string }): Promise<Suggestion[]> {
    return await this.db.select().from(aiSuggestions).where(eq(aiSuggestions.documentId, documentId)) as any[];
  }

  async getDocumentsById({ id }: { id: string }): Promise<Document[]> {
    return await this.db
      .select()
      .from(aiDocuments)
      .where(eq(aiDocuments.id, id))
      .orderBy(asc(aiDocuments.createdAt)) as Document[];
  }

  async getDocumentById({ id }: { id: string }): Promise<Document | null> {
    const [doc] = await this.db
      .select()
      .from(aiDocuments)
      .where(eq(aiDocuments.id, id))
      .orderBy(desc(aiDocuments.createdAt));
    if (!doc) return null;

    return doc as Document;
  }

  async deleteDocumentsByIdAfterTimestamp({ id, timestamp }: { id: string; timestamp: Date }): Promise<void> {
    try {
      await this.db
        .delete(aiSuggestions)
        .where(and(eq(aiSuggestions.documentId, id), gt(aiSuggestions.createdAt, timestamp)));
    } catch (error) {
      console.error("Failed to delete documents", error);
      throw new DbInternalError({ cause: error });
    }
  }
}

// export const chat = await ChatRepository.build();
