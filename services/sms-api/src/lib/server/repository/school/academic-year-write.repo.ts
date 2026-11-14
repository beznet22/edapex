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

export interface UpsertAcademicYearInput {
  readonly id: number;
  readonly year: string;
  readonly title: string;
  readonly startingDate: string;
  readonly endingDate: string;
  readonly status?: "planned" | "active" | "closing" | "archived" | "restoring" | "archived_readable";
}

export async function findAcademicYearByYear(
  ctx: ScopedRepositoryContext,
  year: string
): Promise<{ readonly id: number; readonly year: string } | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: smAcademicYears.id, year: smAcademicYears.year })
      .from(smAcademicYears)
      .where(
        and(
          eq(smAcademicYears.schoolId, ctx.tenant.schoolId),
          eq(smAcademicYears.year, year)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findAcademicYearByYear");
}

/** Idempotent `(school, year)` upsert; the requested id is used on first create. */
export async function upsertAcademicYearWithId(
  ctx: ScopedRepositoryContext,
  input: UpsertAcademicYearInput,
  now: number = Math.floor(Date.now() / 1000)
): Promise<number> {
  return withErrorHandling(async () => {
    const existing = await findAcademicYearByYear(ctx, input.year);
    if (existing !== null) {
      await ctx.db
        .update(smAcademicYears)
        .set({
          title: input.title,
          startingDate: input.startingDate,
          endingDate: input.endingDate,
          status: input.status ?? "planned",
          updatedAt: now
        })
        .where(
          and(
            eq(smAcademicYears.id, existing.id),
            eq(smAcademicYears.schoolId, ctx.tenant.schoolId)
          )
        );
      return existing.id;
    }
    const [byId] = await ctx.db
      .select({ id: smAcademicYears.id })
      .from(smAcademicYears)
      .where(
        and(
          eq(smAcademicYears.id, input.id),
          eq(smAcademicYears.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    if (byId !== undefined) {
      throw new Error(`Academic year id ${input.id} is already used by another year`);
    }
    await ctx.db.insert(smAcademicYears).values({
      id: input.id,
      year: input.year,
      title: input.title,
      startingDate: input.startingDate,
      endingDate: input.endingDate,
      status: input.status ?? "planned",
      activeStatus: 0,
      schoolId: ctx.tenant.schoolId,
      createdAt: now,
      updatedAt: now
    });
    return input.id;
  }, "upsertAcademicYearWithId");
}

export async function setAcademicYearStatus(
  ctx: ScopedRepositoryContext,
  academicId: number,
  status: "planned" | "active" | "closing" | "archived" | "restoring" | "archived_readable",
  now: number = Math.floor(Date.now() / 1000)
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(smAcademicYears)
      .set({ status, updatedAt: now })
      .where(
        and(
          eq(smAcademicYears.id, academicId),
          eq(smAcademicYears.schoolId, ctx.tenant.schoolId)
        )
      );
  }, "setAcademicYearStatus");
}
