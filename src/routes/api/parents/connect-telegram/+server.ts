import { json, error, type RequestHandler } from "@sveltejs/kit";
import { eq, and } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smParents } from "$lib/server/db/sms-schema";
import { ConnectTokenStore } from "$lib/server/telegram/connect-tokens";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    error(401, "Unauthorized");
  }

  let body: { parentId?: number; schoolId?: number } = {};
  try {
    body = (await request.json()) as { parentId?: number; schoolId?: number };
  } catch {
    body = {};
  }

  const db = await getDatabase();
  const parent = body.parentId
    ? await db
      .select({ id: smParents.id, schoolId: smParents.schoolId })
      .from(smParents)
      .where(and(eq(smParents.id, body.parentId), eq(smParents.activeStatus, 1)))
      .limit(1)
      .then((rows) => rows[0] ?? null)
    : await db
      .select({ id: smParents.id, schoolId: smParents.schoolId })
      .from(smParents)
      .where(and(eq(smParents.userId, locals.user.id), eq(smParents.activeStatus, 1)))
      .limit(1)
      .then((rows) => rows[0] ?? null);

  if (!parent) {
    error(404, "Parent record not found");
  }

  // schoolId defaults to 1 (single-school deployment). When the body
  // includes a schoolId, it MUST match the parent's record — this
  // prevents a request issued for school A from being honored for a
  // parent whose data lives in school B.
  const expectedSchoolId = body.schoolId ?? parent.schoolId ?? 1;
  if (parent.schoolId !== null && parent.schoolId !== expectedSchoolId) {
    error(403, "Parent belongs to a different school");
  }

  const token = await ConnectTokenStore.getInstance().createToken(
    parent.id,
    expectedSchoolId,
    24,
  );

  return json({
    success: true,
    token,
    url: `/telegram/connect?token=${token}`,
  });
};
