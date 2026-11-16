/**
 * Shared PlatformTab helpers for `/api/settings/*` endpoints.
 *
 * Every admin/IT-gated settings route used to redefine its own
 * `isAdminOrIt` predicate and its own JSON-body parse/validate. This
 * module centralizes both so the role-check and the body-shape contract
 * stay consistent across PlatformTab endpoints.
 */
import { error, type RequestEvent } from '@sveltejs/kit';
import type { z, ZodTypeAny } from 'zod';

export interface AdminOrItUser {
	user: NonNullable<App.Locals['user']>;
	schoolId: number;
}

function isAdminOrIt(
	user: NonNullable<App.Locals['user']> | null | undefined
): user is NonNullable<App.Locals['user']> {
	if (!user) return false;
	if (user.isAdministrator === true) return true;
	const designation = user.designation;
	return designation === 'it' || designation === 'it_support' || designation === 'admin';
}

/**
 * Resolves the authenticated user, asserts admin/IT role, and returns
 * a narrowed context `{ user, schoolId }`. Calls `error(...)` (which
 * throws) on auth failure.
 */
export function requireAdminOrIt(event: RequestEvent): AdminOrItUser {
	const user = event.locals.user;
	if (!isAdminOrIt(user)) {
		error(403, 'Platform settings require admin or IT role');
	}
	const schoolId = typeof user.schoolId === 'number' ? user.schoolId : 1;
	return { user, schoolId };
}

/**
 * Reads the request body as JSON and validates it against `schema`.
 * Throws a 400 with a descriptive message on parse or validation error.
 */
export async function parseJsonBody<S extends ZodTypeAny>(
	event: RequestEvent,
	schema: S
): Promise<z.infer<S>> {
	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		error(400, 'invalid JSON body');
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		error(400, parsed.error.message);
	}
	return parsed.data;
}
