import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { BaseRepository } from "./base.repo";
import { DbInternalError, DbEntityNotFoundError, unwrapSingleQueryResult } from "$lib/server/helpers/errors";
import {
  chats,
  documents,
  messages,
  suggestions,
  votes,
  type DBChat,
  type DBMessage,
  type Document,
  type Vote,
} from "../db/schema";
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

type Suggestion = typeof suggestions.$inferSelect;

export class ChatRepository extends BaseRepository {
  constructor() {
    super();
  }

  async createChat({ userId, title, id, model }: Partial<DBChat>): Promise<string> {
    try {
      const result = await this.db
        .insert(chats)
        .values({
          id,
          createdAt: new Date(),
          userId,
          title: title || "New Chat",
          model: model || "chat-model",
        })
        .$returningId();

      return result[0].id;
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
      return unwrapSingleQueryResult(rows, id, "DBChat");
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
        role, 
        parts: parts ?? [], 
        metadata: message.metadata, 
      })
      .onDuplicateKeyUpdate({ set: { role, parts: parts ?? [], metadata: null } });
  }

  async loadMessages(chatId: string): Promise<xUIMessage[]> {
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
      return unwrapSingleQueryResult(rows, chatId, "DBChat");
    } catch (error) {
      if (error instanceof DbEntityNotFoundError) {
        return null;
      }
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
      return rows;
    } catch (error) {
      console.error("Failed to get chats by user id", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getChats(): Promise<DBChat[]> {
    try {
      return await this.db.select().from(chats);
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
        const target = await tx.select().from(messages).where(eq(messages.id, messageId)).limit(1);

        const msg = unwrapSingleQueryResult(target, messageId, "Message");

        await tx
          .delete(messages)
          .where(and(eq(messages.chatId, msg.chatId), gt(messages.createdAt, msg.createdAt)));

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
          isUpvoted: type === "up",
        })
        .onDuplicateKeyUpdate({ set: { isUpvoted: type === "up" } });
    } catch (error) {
      console.error("Failed to vote message", error);
      throw new DbInternalError({ cause: error });
    }
  }

  async getVotesByChatId({ id }: { id: string }): Promise<Vote[]> {
    return await this.db.select().from(votes).where(eq(votes.chatId, id));
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
      await this.db.insert(documents).values({
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
    return await this.db.select().from(suggestions).where(eq(suggestions.documentId, documentId));
  }

  async getDocumentsById({ id }: { id: string }): Promise<Document[]> {
    return await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .orderBy(asc(documents.createdAt));
  }

  async getDocumentById({ id }: { id: string }): Promise<Document | null> {
    const [doc] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .orderBy(desc(documents.createdAt));
    if (!doc) return null;

    return doc;
  }

  async deleteDocumentsByIdAfterTimestamp({ id, timestamp }: { id: string; timestamp: Date }): Promise<void> {
    try {
      await this.db
        .delete(suggestions)
        .where(and(eq(suggestions.documentId, id), gt(suggestions.documentCreatedAt, timestamp)));
      await this.db
        .delete(suggestions)
        .where(and(eq(suggestions.id, id), gt(suggestions.createdAt, timestamp)));
    } catch (error) {
      console.error("Failed to delete documents", error);
      throw new DbInternalError({ cause: error });
    }
  }
}

export const chat = await ChatRepository.build();
