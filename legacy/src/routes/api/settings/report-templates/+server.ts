import { z } from "zod";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { SettingsService } from "$lib/server/service/settings.service";
import { log } from "$lib/server/audit-log";
import { requireAdminOrIt, parseJsonBody } from "$lib/server/helpers/platform-tab";

const ReportSettingsPatchSchema = z
	.object({
		termlyReportTitle: z.string().trim().min(1).max(255).optional(),
		annualReportTitle: z.string().trim().min(1).max(255).optional(),
		principalName: z.string().trim().min(1).max(191).optional(),
		supportEmail: z.string().trim().email().max(191).optional(),
		resultEmailSubject: z.string().trim().min(1).max(255).optional()
	})
	.strict();

export const GET: RequestHandler = async (event) => {
	const { session, user } = event.locals;
	if (!user || !session) error(401, "Unauthorized");
	const { schoolId } = requireAdminOrIt(event);

	const service = new SettingsService(schoolId);
	const settings = await service.getReportSettings();
	return json({ schoolId, settings });
};

export const POST: RequestHandler = async (event) => {
	const { session, user } = event.locals;
	if (!user || !session) error(401, "Unauthorized");
	const { schoolId } = requireAdminOrIt(event);
	const patch = await parseJsonBody(event, ReportSettingsPatchSchema);

	const service = new SettingsService(schoolId);
	const before = await service.getReportSettings();
	const updatedBy = typeof user.staffId === "number" ? user.staffId : 0;
	const after = await service.saveReportSettings(patch, updatedBy);

	if (typeof user.staffId === "number") {
		await log({
			schoolId,
			actorStaffId: user.staffId,
			action: "update",
			entityType: "reportSettings",
			entityId: String(schoolId),
			before: {
				termlyReportTitle: before.termlyReportTitle,
				annualReportTitle: before.annualReportTitle,
				principalName: before.principalName,
				supportEmail: before.supportEmail,
				resultEmailSubject: before.resultEmailSubject
			},
			after: {
				termlyReportTitle: after.termlyReportTitle,
				annualReportTitle: after.annualReportTitle,
				principalName: after.principalName,
				supportEmail: after.supportEmail,
				resultEmailSubject: after.resultEmailSubject
			}
		});
	}

	return json({ schoolId, settings: after });
};
