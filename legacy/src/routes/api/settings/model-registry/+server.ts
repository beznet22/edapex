/**
 * GET /api/settings/model-registry
 *   Returns the canonical catalog (provider + model pairs) plus the school's
 *   current denylist entries.
 *
 * POST /api/settings/model-registry
 *   Body: { action: "disable" | "enable", providerId, modelId | null, reason? }
 *   - `disable` is idempotent; re-disabling updates the reason.
 *   - `enable` deletes the matching row.
 *
 * Both routes require admin/IT role.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import {
	disableModelOrProvider,
	enableModelOrProvider,
	listAdminOverrides
} from '$lib/server/mastra/provider/admin-model-overrides';
import {
	BUILTIN_MODELS,
	BUILTIN_PROVIDERS
} from '$lib/provider/catalog';
import { log } from '$lib/server/audit-log';
import { requireAdminOrIt, parseJsonBody } from '$lib/server/helpers/platform-tab';

const PostSchema = z
	.object({
		action: z.enum(['disable', 'enable']),
		providerId: z.string().min(1).max(64),
		modelId: z.string().min(1).max(256).nullable(),
		reason: z.string().max(500).optional()
	})
	.strict();

function pickString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function pickNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function GET(event: RequestEvent): Promise<Response> {
	const { user, schoolId } = requireAdminOrIt(event);

	const catalog = Object.values(BUILTIN_MODELS).map((model) => ({
		providerId: model.providerId,
		modelId: model.id,
		name: model.name,
		tier: model.tier
	}));
	const providers = Object.entries(BUILTIN_PROVIDERS).map(([id, info]) => ({
		providerId: id,
		label: info.name ?? id
	}));
	const overrides = await listAdminOverrides(getAppDb(), schoolId);
	return json({ ok: true, schoolId, catalog, providers, overrides });
}

export async function POST(event: RequestEvent): Promise<Response> {
	const { user, schoolId } = requireAdminOrIt(event);
	const body = await parseJsonBody(event, PostSchema);
	const db = getAppDb();

	const before = await listAdminOverrides(db, schoolId);
	const entityId =
		body.modelId === null ? `${body.providerId}:*` : `${body.providerId}:${body.modelId}`;

	if (body.action === 'disable') {
		const reason = body.reason ?? null;
		const disabledBy = pickNumber(user.staffId) ?? 0;
		const updated = await disableModelOrProvider(
			db,
			schoolId,
			body.providerId,
			body.modelId,
			disabledBy,
			reason
		);
		const after = await listAdminOverrides(db, schoolId);
		if (typeof user.staffId === 'number') {
			await log({
				schoolId,
				actorStaffId: user.staffId,
				action: 'disable',
				entityType: 'adminModelOverrides',
				entityId,
				before: {
					wasDisabled: before.some(
						(row) =>
							row.providerId === body.providerId && row.modelId === body.modelId
					)
				},
				after: { reason: updated?.reason ?? null }
			});
		}
		return json({ ok: true, action: body.action, overrides: after });
	}

	// enable
	await enableModelOrProvider(db, schoolId, body.providerId, body.modelId);
	const after = await listAdminOverrides(db, schoolId);
	if (typeof user.staffId === 'number') {
		await log({
			schoolId,
			actorStaffId: user.staffId,
			action: 'enable',
			entityType: 'adminModelOverrides',
			entityId,
			before: {
				wasDisabled: before.some(
					(row) =>
						row.providerId === body.providerId && row.modelId === body.modelId
				)
			},
			after: { reenabled: true }
		});
	}
	return json({ ok: true, action: body.action, overrides: after });
}

void pickString;
