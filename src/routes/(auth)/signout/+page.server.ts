import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { auth } from "$lib/server/service/auth.service";

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (locals.session || locals.user) {
    auth.logout();
    cookies.delete("access_token", { path: "/" });
    cookies.delete("refresh_token", { path: "/" });
  }

  redirect(307, "/signin");
};
