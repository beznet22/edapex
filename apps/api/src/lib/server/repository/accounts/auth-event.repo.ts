import { authEvents } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";

export type AuthEventRow = typeof authEvents.$inferSelect;
export type NewAuthEvent = typeof authEvents.$inferInsert;

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
