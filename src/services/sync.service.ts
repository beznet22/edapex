import { db } from "../db/index.js";
import { users, aiMessages, aiSessions, accounts } from "../db/sqlite/schema.js";
import { sql, eq } from "drizzle-orm";
import { getDatabaseV2 } from "../db/index.js";

export interface SyncMutation {
  table: "users" | "ai_messages" | "ai_sessions" | "accounts";
  type: "insert" | "update" | "delete";
  key: string;
  value: any;
  timestamp: string;
}

export interface SyncPayload {
  tenantId: string;
  userId: string;
  changes: SyncMutation[];
}

export class SyncService {
  private db: any;

  constructor(env: any, dialect: string) {
    this.db = getDatabaseV2(env);
  }

  async reconcile(payload: SyncPayload) {
    const { tenantId, changes } = payload;
    const results = [];

    for (const change of changes) {
      const table = this.getTable(change.table);
      if (!table) continue;

      try {
        if (change.type === "insert" || change.type === "update") {
          // LWW: Upsert based on key and tenant_id
          await this.db
            .insert(table)
            .values({ ...change.value, tenantId, updatedAt: new Date(change.timestamp) })
            .onConflictDoUpdate({
              target: table.id,
              set: { ...change.value, updatedAt: new Date(change.timestamp) } as any,
            });
        } else if (change.type === "delete") {
          await this.db.delete(table).where(eq(table.id, change.key));
        }
        results.push({ key: change.key, status: "sync_success" });
      } catch (error: any) {
        results.push({ key: change.key, status: "sync_error", error: error.message });
      }
    }

    return {
      success: true,
      results,
      lastSyncToken: new Date().toISOString(),
    };
  }

  private getTable(tableName: string) {
    switch (tableName) {
      case "users": return users;
      case "ai_messages": return aiMessages;
      case "ai_sessions": return aiSessions;
      case "accounts": return accounts;
      default: return null;
    }
  }
}
