import { relations } from "drizzle-orm";
import { chats, documents, messages, suggestions, votes } from "./schema";
// import { chats, messages, parts } from "./chat-schema";
export * from "./sms-relations";

export const chatsRelations = relations(chats, ({ many }) => ({
    messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    chat: one(chats, {
        fields: [messages.chatId],
        references: [chats.id],
    }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
    chat: one(chats, {
        fields: [votes.chatId],
        references: [chats.id],
    }),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
    suggestions: many(suggestions),
}));

export const suggestionsRelations = relations(suggestions, ({ one }) => ({
    document: one(documents, {
        fields: [suggestions.documentId, suggestions.documentCreatedAt],
        references: [documents.id, documents.createdAt],
    }),
}));
