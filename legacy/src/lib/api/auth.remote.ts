/**
 * `authRepo` is intentionally a module-level singleton. Auth is GLOBAL
 * session data (refresh tokens, user accounts, password hashes) and is
 * not tenant-scoped: the user is logging IN here, before any active
 * TenantContext is established, and `updateUserPassword` must work
 * regardless of which school the caller is switching to. Migrating auth
 * to a per-request provider would introduce a chicken-and-egg dependency
 * between `createTenantContext` and `auth.findUser` with no isolation
 * benefit. Keep it as-is. — Slice 13c.
 */
import { command, form, getRequestEvent, query } from "$app/server";
import { authUserSchema, signupSchema } from "$lib/schema/auth";
import { auth } from "$lib/server/service/auth.service";
import { authRepo } from "$lib/server/repository";
import { hashPwd } from "$lib/server/helpers/utils";
import { redirect } from "@sveltejs/kit";

export const signup = form(signupSchema, async (user) => {
  await auth.signup(user);
  redirect(307, `/`);
});

export const login = form(authUserSchema, async ({ email, password }) => {
  await auth.login({ identifier: email, password });
  redirect(303, "/");
});

export const signout = command(async () => {
  await auth.logout();
  return true;
});

export const updatePassword = command(
  z.object({
    password: z.string().min(6),
  }),
  async ({ password }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false, message: "User not authenticated" };
    }
    try {
      await authRepo.updateUserPassword(locals.user.id, hashPwd(password));
      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      return { success: false, message: "Failed to update password" };
    }
  }
);

export const getUser = query(async () => {
  const { locals } = getRequestEvent();
  if (!locals.user) {
    redirect(307, "/signin");
  }
  return locals.user;
});

import { z } from "zod";
export const requestReset = form(z.object({ email: z.string().email() }), async ({ email }) => {
  return await auth.requestReset(email);
});
