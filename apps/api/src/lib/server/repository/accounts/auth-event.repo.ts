import type { BatchItem } from "drizzle-orm/batch";

import { authEvents } from "../../db/schema";
import { batchOrThrow, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { RepositoryContext, UnscopedRepositoryContext } from "../base/repository-context";
import type { NewAuthEvent } from "./types";

export type AuthEventRow = typeof authEvents.$inferSelect;

/** Auth events are global by design: login happens before a tenant exists. */
export async function createAuthEvent(
  ctx: UnscopedRepositoryContext,
  event: NewAuthEvent
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.insert(authEvents).values(event);
    },
    "createAuthEvent"
  );
}

/** Bulk audit rows share the insert chunking rule; each batch stays atomic. */
export async function createAuthEvents(
  ctx: RepositoryContext,
  events: readonly NewAuthEvent[]
): Promise<void> {
  if (events.length === 0) return;
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = chunkedInsert(
        ctx.db,
        authEvents,
        [...events],
        8
      );
      await batchOrThrow(ctx.db, statements);
    },
    "createAuthEvents"
  );
}
