import { and, eq } from "drizzle-orm";

import { smDesignations } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ReferenceOption } from "./types";

const normalizeDesignation = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, "_");

/** The legacy lookup normalized the caller's name and compared it to `title`. */
export async function resolveDesignationId(
  ctx: ScopedRepositoryContext,
  name: string
): Promise<number | null> {
  if (name.length === 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: smDesignations.id })
      .from(smDesignations)
      .where(
        and(
          eq(smDesignations.activeStatus, 1),
          eq(smDesignations.schoolId, ctx.tenant.schoolId),
          eq(smDesignations.title, normalizeDesignation(name))
        )
      )
      .limit(1);
    return row?.id ?? null;
  }, "resolveDesignationId");
}

export async function listDesignations(
  ctx: ScopedRepositoryContext
): Promise<readonly ReferenceOption[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ id: smDesignations.id, name: smDesignations.title })
        .from(smDesignations)
        .where(
          and(
            eq(smDesignations.activeStatus, 1),
            eq(smDesignations.schoolId, ctx.tenant.schoolId)
          )
        )
        .orderBy(smDesignations.id),
    "listDesignations"
  );
}
