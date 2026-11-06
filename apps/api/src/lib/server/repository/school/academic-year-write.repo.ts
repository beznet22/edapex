import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smAcademicYears } from "../../db/schema";
import { batchOrThrow } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface NewAcademicYearInput {
  readonly year: string;
  readonly title: string;
  readonly startingDate: string;
  readonly endingDate: string;
  readonly status?: "planned" | "active" | "closing" | "archived" | "restoring" | "archived_readable";
}

export async function createAcademicYear(
  ctx: ScopedRepositoryContext,
  input: NewAcademicYearInput,
  now: number = Math.floor(Date.now() / 1000)
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .insert(smAcademicYears)
      .values({
        year: input.year,
        title: input.title,
        startingDate: input.startingDate,
        endingDate: input.endingDate,
        status: input.status ?? "planned",
        activeStatus: 0,
        schoolId: ctx.tenant.schoolId,
        createdAt: now,
        updatedAt: now
      })
      .returning({ id: smAcademicYears.id });

    if (row === undefined) {
      throw new Error("Insert into sm_academic_years returned no id");
    }
    return row.id;
  }, "createAcademicYear");
}

/**
 * Deactivates every year for the school, then activates the target. The caller
 * has already verified that the target belongs to the tenant; D1 batches cannot
 * read a result mid-flight, so the two updates are the whole operation.
 */
export async function setActiveAcademicYear(
  ctx: ScopedRepositoryContext,
  academicId: number,
  now: number = Math.floor(Date.now() / 1000)
): Promise<void> {
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = [
        ctx.db
          .update(smAcademicYears)
          .set({ activeStatus: 0, updatedAt: now })
          .where(eq(smAcademicYears.schoolId, ctx.tenant.schoolId)),
        ctx.db
          .update(smAcademicYears)
          .set({ activeStatus: 1, status: "active", updatedAt: now })
          .where(
            and(
              eq(smAcademicYears.id, academicId),
              eq(smAcademicYears.schoolId, ctx.tenant.schoolId)
            )
          )
      ];
      await batchOrThrow(ctx.db, statements);
    },
    "setActiveAcademicYear"
  );
}
