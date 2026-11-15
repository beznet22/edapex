/**
 * GET /api/settings/platform-providers
 *   Lists providers whose env keys are configured on the server, along
 *   with the school's current platform-wide enabled state. A provider
 *   without an env key is excluded (admins cannot toggle something the
 *   platform cannot serve).
 *
 * POST /api/settings/platform-providers
 *   Body: { providerId: string, enabled: boolean }
 *   Sets the provider-wide admin override (modelId = null) on or off.
 *   Writes an audit-log entry on every change.
 *
 * Both routes require admin/IT designation.
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import { z } from "zod";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import {
	disableModelOrProvider,
	enableModelOrProvider,
	isProviderDisabled
} from "$lib/server/mastra/provider/admin-model-overrides";
import { PLATFORM_ENV_KEYS } from "$lib/server/mastra/provider/credentials";
import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
import { log } from "$lib/server/audit-log";
import { requireAdminOrIt, parseJsonBody } from "$lib/server/helpers/platform-tab";

const PostSchema = z
	.object({
		providerId: z.string().min(1).max(64),
		enabled: z.boolean()
	})
	.strict();

export async function GET(event: RequestEvent): Promise<Response> {
	const { schoolId } = requireAdminOrIt(event);
	const env = (await import("$env/dynamic/private")).env as Record<string, string | undefined>;
	const db = getAppDb();

	const providers: Array<{
		providerId: string;
		name: string;
		hasEnvKey: boolean;
		enabled: boolean;
	}> = [];

	for (const [providerId, envKey] of Object.entries(PLATFORM_ENV_KEYS)) {
		const hasEnvKey = Boolean(envKey && env[envKey]);
		if (!hasEnvKey) continue;
		const info = BUILTIN_PROVIDERS[providerId as keyof typeof BUILTIN_PROVIDERS];
		const enabled = !(await isProviderDisabled(db, schoolId, providerId));
		providers.push({
			providerId,
			name: info?.name ?? providerId,
			hasEnvKey,
			enabled
		});
	}

	return json({ ok: true, schoolId, providers });
}

export async function POST(event: RequestEvent): Promise<Response> {
	const { user, schoolId } = requireAdminOrIt(event);
	const body = await parseJsonBody(event, PostSchema);
	const db = getAppDb();

	if (!Object.prototype.hasOwnProperty.call(PLATFORM_ENV_KEYS, body.providerId)) {
		return json(
			{ ok: false, message: `${body.providerId} is not a platform provider` },
			{ status: 400 }
		);
	}

	const env = (await import("$env/dynamic/private")).env as Record<string, string | undefined>;
	const envKey = PLATFORM_ENV_KEYS[body.providerId as keyof typeof PLATFORM_ENV_KEYS];
	if (!envKey || !env[envKey]) {
		return json(
			{ ok: false, message: `${body.providerId} has no env key configured` },
			{ status: 400 }
		);
	}

	const beforeEnabled = !(await isProviderDisabled(db, schoolId, body.providerId));
	const actorStaffId = typeof user.staffId === "number" ? user.staffId : 0;

	if (body.enabled && !beforeEnabled) {
		await enableModelOrProvider(db, schoolId, body.providerId, null);
	} else if (!body.enabled && beforeEnabled) {
		await disableModelOrProvider(db, schoolId, body.providerId, null, actorStaffId, null);
	}

	if (typeof user.staffId === "number") {
		await log({
			schoolId,
			actorStaffId: user.staffId,
			action: body.enabled ? "enable" : "disable",
			entityType: "platformProvider",
			entityId: body.providerId,
			before: { enabled: beforeEnabled },
			after: { enabled: body.enabled }
		});
	}

	const enabled = body.enabled;
	return json({ ok: true, schoolId, providerId: body.providerId, enabled });
}
