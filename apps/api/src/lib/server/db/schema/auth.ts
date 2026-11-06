import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { statusCheck } from "./common";
import { users } from "./tenancy";

const SUBJECT_TYPE = ["student", "staff", "parent"] as const;

export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    emailAtProvider: text("email_at_provider"),
    emailVerified: integer("email_verified").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at")
  },
  (table) => [
    uniqueIndex("auth_identities_provider_provider_user_id_unique").on(
      table.provider,
      table.providerUserId
    ),
    index("auth_identities_user_id_index").on(table.userId)
  ]
);

export const authMagicLinks = sqliteTable(
  "auth_magic_links",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    requestedIp: text("requested_ip"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    uniqueIndex("auth_magic_links_token_hash_unique").on(table.tokenHash),
    index("auth_magic_links_email_created_at_index").on(table.email, table.createdAt)
  ]
);

export const authCodes = sqliteTable(
  "auth_codes",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type", { enum: SUBJECT_TYPE }).notNull(),
    subjectId: integer("subject_id").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at"),
    revokedAt: integer("revoked_at"),
    lastUsedAt: integer("last_used_at"),
    issuedBy: integer("issued_by"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    uniqueIndex("auth_codes_code_hash_unique").on(table.codeHash),
    index("auth_codes_subject_type_subject_id_index").on(table.subjectType, table.subjectId),
    statusCheck("auth_codes_subject_type_check", table.subjectType, SUBJECT_TYPE)
  ]
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    deviceFingerprint: text("device_fingerprint"),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at"),
    revokedAt: integer("revoked_at")
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_id_expires_at_index").on(table.userId, table.expiresAt)
  ]
);

export const authEvents = sqliteTable(
  "auth_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    email: text("email"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    index("auth_events_user_id_created_at_index").on(table.userId, table.createdAt),
    index("auth_events_type_created_at_index").on(table.type, table.createdAt)
  ]
);

export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    key: text("key").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0)
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })]
);

export const authTables = [
  authIdentities,
  authMagicLinks,
  authCodes,
  authSessions,
  authEvents,
  authRateLimits
];
