import { createCollection, localOnlyCollectionOptions } from "@tanstack/db";
import { users, aiMessages, aiSessions, accounts } from "./sqlite/schema.js";
import { syncEngine } from "../services/core/SyncEngine.js";

/**
 * ARCHITECTURE: Local-First Data Layer
 * 
 * Purpose:
 * Syncs domain data between IndexedDB (Browser) and Cloudflare D1.
 * Mutations are enqueued to the SyncEngine for background reconciliation.
 */

const baseOptions = (tableName: string) => ({
  getKey: (item: any) => item.id,
  onInsert: async ({ transaction }: any) => {
    syncEngine.enqueue({
      table: tableName,
      type: "insert",
      key: transaction.mutations[0].key,
      value: transaction.mutations[0].modified,
      timestamp: new Date().toISOString(),
    });
  },
  onUpdate: async ({ transaction }: any) => {
    syncEngine.enqueue({
      table: tableName,
      type: "update",
      key: transaction.mutations[0].key,
      value: transaction.mutations[0].modified,
      timestamp: new Date().toISOString(),
    });
  },
  onDelete: async ({ transaction }: any) => {
    syncEngine.enqueue({
      table: tableName,
      type: "delete",
      key: transaction.mutations[0].key,
      value: transaction.mutations[0].initial,
      timestamp: new Date().toISOString(),
    });
  },
});

export const usersCollection = createCollection(
  localOnlyCollectionOptions(baseOptions("users"))
);

export const aiSessionsCollection = createCollection(
  localOnlyCollectionOptions(baseOptions("ai_sessions"))
);

export const aiMessagesCollection = createCollection(
  localOnlyCollectionOptions(baseOptions("ai_messages"))
);

export const accountsCollection = createCollection(
  localOnlyCollectionOptions(baseOptions("accounts"))
);
