import { fly } from "svelte/transition";

// Shared `in` / `out` fly transitions for the settings modal's tab panels.
// Centralized so the timing constants stay in lockstep across panels.
export function slideIn(node: Element) {
	return fly(node, { y: 12, duration: 200 });
}

export function slideOut(node: Element) {
	return fly(node, { y: -12, duration: 150 });
}

// Returns true when the designation-gating rule for a tab is satisfied for
// the given user. Tabs with no `allowedDesignations` are visible to everyone;
// tabs with an `allowedDesignations` whitelist are visible when the user
// either (a) is a flagged administrator (`isAdministrator === true`) or
// (b) holds one of the listed designations. Anonymous users never see
// gated tabs. The administrator escape hatch mirrors the backend
// `requireAdminOrIt` helper so the frontend and backend stay in sync.
export function isTabVisible(
	allowedDesignations: readonly string[] | undefined,
	userDesignation: string | null,
	isAdministrator: boolean = false
): boolean {
	if (!allowedDesignations || allowedDesignations.length === 0) return true;
	if (isAdministrator) return true;
	return userDesignation !== null && allowedDesignations.includes(userDesignation);
}
