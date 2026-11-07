import type { archiveObjects } from "../../db/schema";

export type ArchiveObjectRow = typeof archiveObjects.$inferSelect;
export type NewArchiveObject = typeof archiveObjects.$inferInsert;
export type ArchiveObjectStatus = ArchiveObjectRow["status"];
