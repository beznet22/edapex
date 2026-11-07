import { and, asc, eq } from "drizzle-orm";

import { smClasses } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import {
  CLASS_LADDER,
  UPPER_BASIC_CLASSES,
  normalizeClassName
} from "../base/ladder";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface SourceClassRow {
  readonly id: number;
  readonly className: string;
  readonly passMark: number | null;
  readonly stage: string | null;
  readonly sortOrder: number | null;
}

export interface TargetClassRow {
  readonly id: number;
  readonly className: string;
  readonly stage: string | null;
  readonly sortOrder: number | null;
  readonly nextClassId: number | null;
}

export interface CopyClassesResult {
  readonly classMap: ReadonlyMap<number, number>;
  readonly targetClasses: readonly TargetClassRow[];
  readonly created: number;
  readonly added: number;
}

export async function listSourceClasses(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly SourceClassRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        id: smClasses.id,
        className: smClasses.className,
        passMark: smClasses.passMark,
        stage: smClasses.stage,
        sortOrder: smClasses.sortOrder
      })
      .from(smClasses)
      .where(
        and(
          eq(smClasses.schoolId, ctx.tenant.schoolId),
          eq(smClasses.academicId, academicId),
          eq(smClasses.activeStatus, 1)
        )
      )
      .orderBy(asc(smClasses.sortOrder), asc(smClasses.id));
  }, "listSourceClasses");
}

export async function listTargetClasses(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly TargetClassRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        id: smClasses.id,
        className: smClasses.className,
        stage: smClasses.stage,
        sortOrder: smClasses.sortOrder,
        nextClassId: smClasses.nextClassId
      })
      .from(smClasses)
      .where(
        and(
          eq(smClasses.schoolId, ctx.tenant.schoolId),
          eq(smClasses.academicId, academicId),
          eq(smClasses.activeStatus, 1)
        )
      )
      .orderBy(asc(smClasses.sortOrder), asc(smClasses.id));
  }, "listTargetClasses");
}

async function findClassByName(
  ctx: ScopedRepositoryContext,
  academicId: number,
  className: string
): Promise<TargetClassRow | null> {
  const [row] = await ctx.db
    .select({
      id: smClasses.id,
      className: smClasses.className,
      stage: smClasses.stage,
      sortOrder: smClasses.sortOrder,
      nextClassId: smClasses.nextClassId
    })
    .from(smClasses)
    .where(
      and(
        eq(smClasses.schoolId, ctx.tenant.schoolId),
        eq(smClasses.academicId, academicId),
        eq(smClasses.className, normalizeClassName(className))
      )
    )
    .limit(1);
  return row ?? null;
}

async function createClass(
  ctx: ScopedRepositoryContext,
  input: {
    readonly academicId: number;
    readonly className: string;
    readonly passMark: number | null;
    readonly stage: string | null;
    readonly sortOrder: number | null;
    readonly actorId: number;
  }
): Promise<TargetClassRow> {
  const stage =
    input.stage === "EARLY_YEARS" ||
    input.stage === "LOWER_BASIC" ||
    input.stage === "MIDDLE_BASIC" ||
    input.stage === "UPPER_BASIC"
      ? input.stage
      : null;
  const [row] = await ctx.db
    .insert(smClasses)
    .values({
      className: normalizeClassName(input.className),
      passMark: input.passMark,
      activeStatus: 1,
      schoolId: ctx.tenant.schoolId,
      academicId: input.academicId,
      stage,
      sortOrder: input.sortOrder,
      nextClassId: null,
      createdBy: input.actorId,
      updatedBy: input.actorId
    })
    .returning({
      id: smClasses.id,
      className: smClasses.className,
      stage: smClasses.stage,
      sortOrder: smClasses.sortOrder,
      nextClassId: smClasses.nextClassId
    });
  if (row === undefined) throw new Error("Insert into sm_classes returned no row");
  return row;
}

async function setClassNext(
  ctx: ScopedRepositoryContext,
  classId: number,
  nextClassId: number | null
): Promise<void> {
  await ctx.db
    .update(smClasses)
    .set({ nextClassId, updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(smClasses.id, classId), eq(smClasses.schoolId, ctx.tenant.schoolId)));
}

export async function copyClasses(
  ctx: ScopedRepositoryContext,
  input: {
    readonly sourceAcademicId: number;
    readonly targetAcademicId: number;
    readonly actorId: number;
  }
): Promise<CopyClassesResult> {
  return withErrorHandling(async () => {
    const source = await listSourceClasses(ctx, input.sourceAcademicId);
    const classMap = new Map<number, number>();
    let created = 0;

    for (const row of source) {
      let target = await findClassByName(ctx, input.targetAcademicId, row.className);
      if (target === null) {
        target = await createClass(ctx, {
          academicId: input.targetAcademicId,
          className: row.className,
          passMark: row.passMark,
          stage: row.stage,
          sortOrder: row.sortOrder,
          actorId: input.actorId
        });
        created += 1;
      }
      classMap.set(row.id, target.id);
    }

    let added = 0;
    for (const entry of UPPER_BASIC_CLASSES) {
      let target = await findClassByName(ctx, input.targetAcademicId, entry.name);
      if (target === null) {
        target = await createClass(ctx, {
          academicId: input.targetAcademicId,
          className: entry.name,
          passMark: null,
          stage: entry.stage,
          sortOrder: entry.sortOrder,
          actorId: input.actorId
        });
        added += 1;
      }
      const sourceMatch = source.find(
        (row) => normalizeClassName(row.className) === normalizeClassName(entry.name)
      );
      if (sourceMatch !== undefined) classMap.set(sourceMatch.id, target.id);
    }

    const targetClasses = await listTargetClasses(ctx, input.targetAcademicId);
    const byName = new Map(
      targetClasses.map((row) => [normalizeClassName(row.className), row])
    );
    for (let index = 0; index < CLASS_LADDER.length; index += 1) {
      const entry = CLASS_LADDER[index];
      if (entry === undefined) continue;
      const target = byName.get(entry.name);
      if (target === undefined) continue;
      const nextName =
        entry.name === "DAYCARE"
          ? "DAYCARE"
          : entry.name === "MIDDLE BASIC 6"
            ? "UPPER BASIC 1"
            : CLASS_LADDER[index + 1]?.name;
      const nextTarget = nextName === undefined ? null : byName.get(nextName) ?? null;
      const targetNext = entry.name === "DAYCARE" ? null : nextTarget?.id ?? null;
      await setClassNext(ctx, target.id, targetNext);
      const sourceRow = source.find(
        (row) => normalizeClassName(row.className) === entry.name
      );
      if (sourceRow !== undefined) {
        const sourceNext = entry.name === "DAYCARE" ? target.id : nextTarget?.id ?? null;
        await setClassNext(ctx, sourceRow.id, sourceNext);
      }
    }

    const ub1 = byName.get("UPPER BASIC 1");
    const ub2 = byName.get("UPPER BASIC 2");
    const ub3 = byName.get("UPPER BASIC 3");
    if (ub1 !== undefined && ub2 !== undefined) await setClassNext(ctx, ub1.id, ub2.id);
    if (ub2 !== undefined && ub3 !== undefined) await setClassNext(ctx, ub2.id, ub3.id);
    if (ub3 !== undefined) await setClassNext(ctx, ub3.id, null);

    return {
      classMap,
      targetClasses: await listTargetClasses(ctx, input.targetAcademicId),
      created,
      added
    };
  }, "copyClasses");
}
