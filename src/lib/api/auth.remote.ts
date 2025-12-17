import { form, getRequestEvent, query } from "$app/server";
import { authUserSchema, signupSchema } from "$lib/schema/auth";
import { auth } from "$lib/server/service/auth.service";
import { redirect } from "@sveltejs/kit";

export const signup = form(signupSchema, async (user) => {
  await auth.signup(user);
  redirect(307, `/`);
});

export const login = form(authUserSchema, async ({ email, password }) => {
    await auth.login({ identifier: email, password });
    redirect(303, "/");
});

export const signout = form(async () => {
  await auth.logout();
  redirect(303, "/signin");
});

export const getUser = query(async () => {
  const { locals } = getRequestEvent();
  if (!locals.user) {
    redirect(307, "/signin");
  }
  return locals.user;
});
