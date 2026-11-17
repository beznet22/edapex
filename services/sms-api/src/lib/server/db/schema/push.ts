import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { statusCheck } from "./common";
import { smSchools } from "./tenancy";

const PLATFORM = ["android", "web", "ios"] as const;
const JOB_STATUS = ["queued", "sent", "failed", "skipped"] as const;

/**
 * One row per install, not per person.
 *
 * A teacher with a phone and a laptop has two rows and can revoke either without
 * signing out of the other. The token is the delivery address; `install_id` is
 * what the app uses to re-register, so a reinstall updates its row instead of
 * leaving the old token to fail silently forever.
 */
export const pushDevices = sqliteTable(
  "push_devices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    userId: integer("user_id").notNull(),
    platform: text("platform", { enum: PLATFORM }).notNull(),
    token: text("token").notNull(),
    installId: text("install_id").notNull(),
    /** Web Push only: `{ p256dh, auth }`. FCM and APNs carry their own credentials. */
    keysJson: text("keys_json"),
    prefsJson: text("prefs_json"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    revokedAt: integer("revoked_at")
  },
  (table) => [
    // Two people may not claim the same address, and a token belongs to one install.
    uniqueIndex("push_devices_platform_token_unique").on(table.platform, table.token),
    uniqueIndex("push_devices_user_install_unique").on(table.userId, table.installId),
    index("push_devices_user_id_index").on(table.userId),
    statusCheck("push_devices_platform_check", table.platform, PLATFORM)
  ]
);

/**
 * One delivery attempt per event per person.
 *
 * `idempotency_key` is the guard: a queue retry, a duplicate producer call and a
 * redelivered event all collapse onto the same row, so the second attempt is a
 * no-op rather than a second buzz.
 */
export const pushJobs = sqliteTable(
  "push_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id").notNull(),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    userId: integer("user_id").notNull(),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: JOB_STATUS }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    sentAt: integer("sent_at")
  },
  (table) => [
    uniqueIndex("push_jobs_idempotency_key_unique").on(table.idempotencyKey),
    index("push_jobs_user_created_index").on(table.userId, table.createdAt),
    statusCheck("push_jobs_status_check", table.status, JOB_STATUS)
  ]
);

export const pushTables = [pushDevices, pushJobs] as const;
