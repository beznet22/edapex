import { redirect, type RequestEvent } from "@sveltejs/kit";

export function load({ locals }: RequestEvent) {
  if (locals.user && locals.session) {
    throw redirect(307, "/");
  }
}