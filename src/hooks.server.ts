import { startQueueWorker } from "$lib/server/queue";
import { auth } from "$lib/server/service/auth.service";
import { type Handle } from "@sveltejs/kit";

// startQueueWorker();

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.getSession();
  event.locals.user = session?.user || null;
  event.locals.session = session?.session || null;
  return resolve(event);
};
