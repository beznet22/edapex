import { startQueueWorker } from "$lib/server/queue";
import { workerPool } from "$lib/server/queue/pool";
import { auth } from "$lib/server/service/auth.service";
import { type Handle } from "@sveltejs/kit";

workerPool.initializeWorkers();

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.getSession();
  event.locals.user = session?.user || null;
  event.locals.session = session?.session || null;
  return resolve(event);
};
