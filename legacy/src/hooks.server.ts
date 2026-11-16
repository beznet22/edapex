import { auth } from "$lib/server/service/auth.service";
import { applyMigrations } from "$lib/server/mastra/storage/libsql/migrations/runner";
import { getClient } from "$lib/server/mastra/storage/libsql/app-db";
import { type Handle } from "@sveltejs/kit";

// Apply app DB migrations on cold start (creates encrypted_credentials etc.)
applyMigrations(getClient()).catch((err: unknown) =>
  console.error("[migration] app schema migration failed:", err)
);

// workerPool.initializeWorkers();

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.getSession();
  event.locals.user = session?.user || null;
  event.locals.session = session?.session || null;
  return resolve(event);
};
