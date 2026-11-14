import { eq } from "drizzle-orm";

import { users } from "../../db/schema";
import { DbInternalError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import type { UnscopedRepositoryContext } from "../base/repository-context";
import type { NewUser, UserLookupField, UserPatch, UserRow } from "./types";

export async function findUserById(
  ctx: UnscopedRepositoryContext,
  id: number
): Promise<UserRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }, "findUserById");
}

export async function findUserByEmail(
  ctx: UnscopedRepositoryContext,
  email: string
): Promise<UserRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }, "findUserByEmail");
}

/** Used by the claim/login ambiguity guard (`04 §5`). */
export async function listUsersByEmail(
  ctx: UnscopedRepositoryContext,
  email: string
): Promise<readonly UserRow[]> {
  return withErrorHandling(
    async () => ctx.db.select().from(users).where(eq(users.email, email)),
    "listUsersByEmail"
  );
}

export async function findUserByUsername(
  ctx: UnscopedRepositoryContext,
  username: string
): Promise<UserRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return row ?? null;
  }, "findUserByUsername");
}

/** Legacy `findUser(field, value)` dispatcher, narrowed without casts. */
export async function findUser(
  ctx: UnscopedRepositoryContext,
  field: UserLookupField,
  value: string | number
): Promise<UserRow | null> {
  if (field === "id") {
    if (typeof value !== "number") return null;
    return findUserById(ctx, value);
  }
  if (typeof value !== "string") return null;
  return field === "email" ? findUserByEmail(ctx, value) : findUserByUsername(ctx, value);
}

export async function createUser(
  ctx: UnscopedRepositoryContext,
  values: NewUser
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db.insert(users).values(values).returning({ id: users.id });
    const [row] = rows;
    if (row === undefined) {
      throw new DbInternalError("Insert into users returned no id");
    }
    return row.id;
  }, "createUser");
}

export async function updateUser(
  ctx: UnscopedRepositoryContext,
  userId: number,
  patch: UserPatch
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.update(users).set(patch).where(eq(users.id, userId));
    },
    "updateUser"
  );
}
