import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { getAvailableModelsForUser } from "$lib/server/mastra/provider/availability";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { user }, setHeaders }) => {
	if (!user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	setHeaders({ "Cache-Control": "private, max-age=60" });

	try {
		const db = getAppDb();
		const envKeys = env as Record<string, string | undefined>;
		const models = await getAvailableModelsForUser(db, envKeys, user.id);
		return json({ success: true, models });
	} catch (err) {
		console.error("[api/models] Failed to resolve available models:", err);
		return json({ success: false, message: "Failed to fetch models" }, { status: 500 });
	}
};
