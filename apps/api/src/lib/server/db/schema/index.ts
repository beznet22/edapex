import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { academicsTables } from "./academics";
import { assessmentTables } from "./assessment";
import { authTables } from "./auth";
import { financeTables } from "./finance";
import { homeworkTables } from "./homework";
import { lifecycleTables } from "./lifecycle";
import { peopleTables } from "./people";
import { tenancyTables } from "./tenancy";
import { timetableTables } from "./timetable";

export * from "./academics";
export * from "./assessment";
export * from "./auth";
export * from "./finance";
export * from "./homework";
export * from "./lifecycle";
export * from "./people";
export * from "./tenancy";
export * from "./timetable";

/**
 * Every table the D1 schema declares. The schema gate asserts this registry
 * equals `LEGACY_TABLES ∪ NEW_TABLES` from the generated expectations fixture.
 */
export const allTables: readonly SQLiteTable[] = [
  ...tenancyTables,
  ...academicsTables,
  ...peopleTables,
  ...timetableTables,
  ...assessmentTables,
  ...homeworkTables,
  ...financeTables,
  ...authTables,
  ...lifecycleTables
];
