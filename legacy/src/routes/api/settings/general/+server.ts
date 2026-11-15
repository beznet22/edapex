import { z } from "zod";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { SettingsService } from "$lib/server/service/settings.service";
import { log } from "$lib/server/audit-log";
import { requireAdminOrIt, parseJsonBody } from "$lib/server/helpers/platform-tab";

const GeneralSettingsPatchSchema = z
	.object({
		schoolName: z.string().trim().max(191).optional().nullable(),
		phone: z.string().trim().max(191).optional().nullable(),
		email: z.string().trim().email().max(191).optional().nullable(),
		address: z.string().trim().max(191).optional().nullable()
	})
	.strict();

export const GET: RequestHandler = async (event) => {
	const { session, user } = event.locals;
	if (!user || !session) error(401, "Unauthorized");
	const { schoolId } = requireAdminOrIt(event);

	const service = new SettingsService(schoolId);
	const settings = await service.getGeneralSettings();
	return json({ schoolId, settings });
};

export const POST: RequestHandler = async (event) => {
	const { session, user } = event.locals;
	if (!user || !session) error(401, "Unauthorized");
	const { schoolId } = requireAdminOrIt(event);
	const patch = await parseJsonBody(event, GeneralSettingsPatchSchema);

	const service = new SettingsService(schoolId);
	const before = await service.getGeneralSettings();
	const after = await service.saveGeneralSettings(patch);

	if (typeof user.staffId === "number") {
		const beforePick: Record<string, unknown> = {};
		const afterPick: Record<string, unknown> = {};
		for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
			beforePick[key] = before?.[key] ?? null;
			afterPick[key] = after?.[key] ?? null;
		}
		await log({
			schoolId,
			actorStaffId: user.staffId,
			action: "update",
			entityType: "smGeneralSettings.identity",
			entityId: String(schoolId),
			before: beforePick,
			after: afterPick
		});
	}

	// The BaseRepository caches smGeneralSettings for 5 minutes, so the
	// settings menu itself may briefly show stale values until the cache
	// expires. School-wide consumers (header, PDF headers) follow the same
	// path so they stay consistent.
	return json({ schoolId, settings: after });
};
