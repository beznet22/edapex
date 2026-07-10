import { fly } from "svelte/transition";

// Shared `in` / `out` fly transitions for the settings modal's tab panels.
// Centralized so the timing constants stay in lockstep across panels.
export function slideIn(node: Element) {
	return fly(node, { y: 12, duration: 200 });
}

export function slideOut(node: Element) {
	return fly(node, { y: -12, duration: 150 });
}

// Returns true when the role-gating rule for a tab is satisfied for the
// given user. Tabs with no `allowedRoles` are visible to everyone; tabs
// with an `allowedRoles` whitelist are visible only when the user holds one
// of the listed roles. Anonymous users (role === null) never see gated tabs.
export function isTabVisible(
	allowedRoles: readonly string[] | undefined,
	userRole: string | null
): boolean {
	if (!allowedRoles || allowedRoles.length === 0) return true;
	return userRole !== null && allowedRoles.includes(userRole);
}
