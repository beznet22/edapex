import { DESIGNATIONS } from '$lib/types/sms-types';
import type { Designation } from '$lib/types/sms-types';

/**
 * Resolve a numeric designation id (the staff table column) to the
 * canonical user-role string the 4-tier router matches against
 * `potluck_config.consumerRoles` / `donorRoles`.
 *
 * Examples:
 *   resolveUserRole(1)  -> 'it'
 *   resolveUserRole(5)  -> 'coordinator'
 *   resolveUserRole(8)  -> 'class_teacher'
 *   resolveUserRole(null) -> null
 *
 * Single source of truth: every chat-side path (layout SSR auto-pick,
 * `buildRequestContext`, model-availability pool pass) imports this so
 * the role string used in `consumerRoles.includes(...)` is identical
 * to what the donation is stored under.
 */
export function resolveUserRole(designationId: number | null | undefined): string | null {
	if (typeof designationId !== 'number') return null;
	const role = DESIGNATIONS[designationId];
	return typeof role === 'string' ? (role as Designation) : null;
}
