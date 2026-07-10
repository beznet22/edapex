/**
 * GET /api/settings/potluck
 *   Returns the school's potluck_config row (or the empty default shape
 *   when none exists yet). Includes the parsed JSON arrays so the UI
 *   doesn't have to re-parse.
 *
 * POST /api/settings/potluck
 *   Body: { enabled?, donorRoles?, consumerRoles?, allowedProviders?,
 *           perUserDailyTokenCap?, perUserDailyRequestCap?,
 *           perProviderDailyTokenCap?, auditRetentionDays?, tosVersion? }
 *   All fields optional — omitted fields keep their current value. Empty
 *   strings for the array fields coerce to []. Writes audit-log entry.
 *
 * Both routes require admin/IT role.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import {
	getPotluckConfig,
	savePotluckConfig,
	parseJsonArray,
	stringifyJsonArray
} from '$lib/server/mastra/provider/potluck';
import { log } from '$lib/server/audit-log';
import { requireAdminOrIt, parseJsonBody } from '$lib/server/helpers/platform-tab';

const PostSchema = z
	.object({
		enabled: z.boolean().optional(),
		donorRoles: z.array(z.string().min(1).max(64)).max(32).optional(),
		consumerRoles: z.array(z.string().min(1).max(64)).max(32).optional(),
		allowedProviders: z.array(z.string().min(1).max(64)).max(64).optional(),
		perUserDailyTokenCap: z.number().int().min(0).max(1_000_000_000).optional(),
		perUserDailyRequestCap: z.number().int().min(0).max(1_000_000).optional(),
		perProviderDailyTokenCap: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
		auditRetentionDays: z.number().int().min(1).max(3650).optional(),
		tosVersion: z.string().max(32).nullable().optional()
	})
	.strict();

const EMPTY_DEFAULT = {
	schoolId: 1,
	enabled: 0,
	donorRoles: [] as string[],
	consumerRoles: [] as string[],
	allowedProviders: [] as string[],
	perUserDailyTokenCap: 0,
	perUserDailyRequestCap: 0,
	perProviderDailyTokenCap: null as number | null,
	auditRetentionDays: 90,
	tosVersion: null as string | null,
	updatedBy: 0,
	updatedAt: ''
};

export async function GET(event: RequestEvent): Promise<Response> {
	const { user, schoolId } = requireAdminOrIt(event);

	const row = await getPotluckConfig(getAppDb(), schoolId);
	if (!row) {
		return json({ ok: true, schoolId, config: { ...EMPTY_DEFAULT, schoolId } });
	}
	return json({
		ok: true,
		schoolId,
		config: {
			schoolId: row.schoolId,
			enabled: row.enabled,
			donorRoles: parseJsonArray(row.donorRoles),
			consumerRoles: parseJsonArray(row.consumerRoles),
			allowedProviders: parseJsonArray(row.allowedProviders),
			perUserDailyTokenCap: row.perUserDailyTokenCap,
			perUserDailyRequestCap: row.perUserDailyRequestCap,
			perProviderDailyTokenCap: row.perProviderDailyTokenCap,
			auditRetentionDays: row.auditRetentionDays,
			tosVersion: row.tosVersion,
			updatedBy: row.updatedBy,
			updatedAt: row.updatedAt
		}
	});
}

export async function POST(event: RequestEvent): Promise<Response> {
	const { user, schoolId } = requireAdminOrIt(event);
	const data = parseJsonBody(event, PostSchema);

	const db = getAppDb();
	const before = await getPotluckConfig(db, schoolId);

	const patch: Record<string, unknown> = {};
	if (data.enabled !== undefined) patch['enabled'] = data.enabled ? 1 : 0;
	if (data.donorRoles !== undefined) patch['donorRoles'] = stringifyJsonArray(data.donorRoles);
	if (data.consumerRoles !== undefined)
		patch['consumerRoles'] = stringifyJsonArray(data.consumerRoles);
	if (data.allowedProviders !== undefined)
		patch['allowedProviders'] = stringifyJsonArray(data.allowedProviders);
	if (data.perUserDailyTokenCap !== undefined)
		patch['perUserDailyTokenCap'] = data.perUserDailyTokenCap;
	if (data.perUserDailyRequestCap !== undefined)
		patch['perUserDailyRequestCap'] = data.perUserDailyRequestCap;
	if (data.perProviderDailyTokenCap !== undefined)
		patch['perProviderDailyTokenCap'] = data.perProviderDailyTokenCap;
	if (data.auditRetentionDays !== undefined)
		patch['auditRetentionDays'] = data.auditRetentionDays;
	if (data.tosVersion !== undefined) patch['tosVersion'] = data.tosVersion;

	const updatedBy = typeof user.staffId === 'number' ? user.staffId : 1;
	const after = await savePotluckConfig(db, schoolId, patch, updatedBy);

	if (typeof user.staffId === 'number') {
		await log({
			schoolId,
			actorStaffId: user.staffId,
			action: before === null ? 'create' : 'update',
			entityType: 'potluckConfig',
			entityId: String(schoolId),
			before: before
				? {
						enabled: before.enabled,
						perUserDailyTokenCap: before.perUserDailyTokenCap,
						perUserDailyRequestCap: before.perUserDailyRequestCap,
						perProviderDailyTokenCap: before.perProviderDailyTokenCap,
						auditRetentionDays: before.auditRetentionDays,
						tosVersion: before.tosVersion
					}
				: { existed: false },
			after: {
				enabled: after.enabled,
				perUserDailyTokenCap: after.perUserDailyTokenCap,
				perUserDailyRequestCap: after.perUserDailyRequestCap,
				perProviderDailyTokenCap: after.perProviderDailyTokenCap,
				auditRetentionDays: after.auditRetentionDays,
				tosVersion: after.tosVersion,
				patchedFields: Object.keys(patch)
			}
		});
	}

	return json({
		ok: true,
		config: {
			schoolId: after.schoolId,
			enabled: after.enabled,
			donorRoles: parseJsonArray(after.donorRoles),
			consumerRoles: parseJsonArray(after.consumerRoles),
			allowedProviders: parseJsonArray(after.allowedProviders),
			perUserDailyTokenCap: after.perUserDailyTokenCap,
			perUserDailyRequestCap: after.perUserDailyRequestCap,
			perProviderDailyTokenCap: after.perProviderDailyTokenCap,
			auditRetentionDays: after.auditRetentionDays,
			tosVersion: after.tosVersion,
			updatedBy: after.updatedBy,
			updatedAt: after.updatedAt
		}
	});
}
