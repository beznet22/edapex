import type { InferInsertModel } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { RepositoryDb } from "./repository-context";

/**
 * Typed replacement for the old `create({ table: any, values })` helper
 * (`01 §5.1`): a misspelled table or column is now a compile error.
 */
export async function insertOne<TTable extends SQLiteTable>(
  db: RepositoryDb,
  table: TTable,
  values: InferInsertModel<TTable>
): Promise<void> {
  await db.insert(table).values(values);
}
