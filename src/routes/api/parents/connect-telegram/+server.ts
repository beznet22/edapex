import { json, error, type RequestHandler } from "@sveltejs/kit";
import { eq, and } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smParents } from "$lib/server/db/sms-schema";
import { ConnectTokenStore } from "$lib/server/telegram/connect-tokens";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    error(401, "Unauthorized");
  }

  let body: { parentId?: number } = {};
  try {
    body = (await request.json()) as { parentId?: number };
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

  const token = await ConnectTokenStore.getInstance().createToken(
    parent.id,
    parent.schoolId ?? 1,
    24,
  );

  return json({
    success: true,
    token,
    url: `/telegram/connect?token=${token}`,
  });
};
