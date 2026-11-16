import { error, fail } from "@sveltejs/kit";
import { and, eq, asc, inArray, desc } from "drizzle-orm";
import { hash } from "bcrypt-ts";
import { getDatabase } from "$lib/server/db";
import { smClassTeachers, smAssignClassTeachers, smClasses, smSections } from "$lib/server/db/sms-schema";
import { parentAuthCodes } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import type { PageServerLoad, Actions } from "./$types";

export interface ClassWithCode {
  classId: number;
  className: string | null;
  sectionName: string | null;
  activeCode: string | null;
  codeExpiresAt: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.user.staffId) throw error(401);
  const staffId = locals.user.staffId;
  const schoolId = locals.user.schoolId ?? 1;

  const db = await getDatabase();
  const appDb = getAppDb();

  const assignments = await db
    .select({
      classId: smAssignClassTeachers.classId,
      className: smClasses.className,
      sectionName: smSections.sectionName,
    })
    .from(smClassTeachers)
    .innerJoin(smAssignClassTeachers, eq(smClassTeachers.assignClassTeacherId, smAssignClassTeachers.id))
    .innerJoin(smClasses, eq(smAssignClassTeachers.classId, smClasses.id))
    .leftJoin(smSections, eq(smAssignClassTeachers.sectionId, smSections.id))
    .where(
      and(
        eq(smClassTeachers.teacherId, staffId),
        eq(smClassTeachers.activeStatus, 1),
        eq(smAssignClassTeachers.schoolId, schoolId),
      ),
    )
    .orderBy(asc(smClasses.className));

  const classIds = assignments.map((a) => a.classId).filter((id): id is number => id !== null);
  const uniqueIds = [...new Set(classIds)];

  const appDbNow = new Date().toISOString();
  const activeCodes: Record<number, { hash: string; expiresAt: string }> = {};

  if (uniqueIds.length > 0) {
    const codeRows = await appDb
      .select({
        classId: parentAuthCodes.classId,
        codeHash: parentAuthCodes.codeHash,
        expiresAt: parentAuthCodes.expiresAt,
        createdAt: parentAuthCodes.createdAt,
      })
      .from(parentAuthCodes)
      .where(
        and(
          inArray(parentAuthCodes.classId, uniqueIds),
        ),
      )
      .orderBy(desc(parentAuthCodes.createdAt));

    const seen = new Set<number>();
    for (const row of codeRows) {
      if (seen.has(row.classId)) continue;
      seen.add(row.classId);
      if (row.expiresAt > appDbNow) {
        activeCodes[row.classId] = { hash: row.codeHash, expiresAt: row.expiresAt };
      }
    }
  }

  const classes: ClassWithCode[] = assignments.map((a) => {
    const id = a.classId ?? 0;
    const code = activeCodes[id];
    return {
      classId: id,
      className: a.className,
      sectionName: a.sectionName,
      activeCode: code ? code.hash.slice(-4) : null,
      codeExpiresAt: code?.expiresAt ?? null,
    };
  });

  return { classes };
};

export const actions: Actions = {
  generate: async ({ request, locals }) => {
    if (!locals.user || !locals.user.staffId) throw error(401);

    const formData = await request.formData();
    const classId = Number(formData.get("classId"));

    if (!classId || isNaN(classId)) {
      return fail(400, { error: "Invalid class ID" });
    }

    const rawCode = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hash(rawCode, 10);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const appDb = getAppDb();
    await appDb.insert(parentAuthCodes).values({
      classId,
      codeHash,
      generatedBy: locals.user.staffId,
      expiresAt,
    });

    return { success: true, code: rawCode, expiresAt, classId };
  },
};
