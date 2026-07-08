import { fly } from "svelte/transition";

// Shared `in` / `out` fly transitions for the settings modal's tab panels.
// Centralized so the timing constants stay in lockstep across panels.
export function slideIn(node: Element) {
	return fly(node, { y: 12, duration: 200 });
}

export function slideOut(node: Element) {
	return fly(node, { y: -12, duration: 150 });
}
