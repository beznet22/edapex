/**
 * useContainerBreakpoint — Svelte 5 reactive container-width hook.
 *
 * Subscribes to a container element's width via ResizeObserver and returns
 * a `$derived` breakpoint (xs/sm/md/lg/xl) that mirrors Tailwind's `@container`
 * scale from `docs/responsive_design.md` §7. Combined with the `isMobile`
 * viewport flag (from `$lib/hooks/is-mobile.svelte`), this lets the editor's
 * bubble menu / AI selector / bottom toolbar adapt reactively to BOTH:
 *   1. The resizable workspace panel (WorkspacePaneGroup uses paneforge)
 *   2. The viewport (mobile vs tablet vs desktop)
 *
 * Breakpoint scale (px thresholds):
 *   xs: < 384
 *   sm: ≥ 384
 *   md: ≥ 448
 *   lg: ≥ 512
 *   xl: ≥ 576
 *
 * Returns an object whose `breakpoint` and `isMobile` properties are both
 * `$derived` — so consumers can read them directly inside templates and
 * `$derived` expressions without needing their own `$effect` to track them.
 */
import { untrack } from "svelte";

export type ContainerBreakpoint = "xs" | "sm" | "md" | "lg" | "xl";

const BREAKPOINT_THRESHOLDS: readonly { name: ContainerBreakpoint; minWidth: number }[] = [
	{ name: "xs", minWidth: 0 },
	{ name: "sm", minWidth: 384 },
	{ name: "md", minWidth: 448 },
	{ name: "lg", minWidth: 512 },
	{ name: "xl", minWidth: 576 },
];

export function breakpointFromWidth(width: number): ContainerBreakpoint {
	let current: ContainerBreakpoint = "xs";
	for (const { name, minWidth } of BREAKPOINT_THRESHOLDS) {
		if (width >= minWidth) current = name;
	}
	return current;
}

/**
 * Subscribes to `container`'s width via ResizeObserver. Returns reactive
 * `breakpoint` and `width` values. The `isMobile` flag is supplied by the
 * caller (typically from `$lib/hooks/is-mobile.svelte`) so the hook stays
 * focused on container-only concerns.
 */
export function useContainerBreakpoint(
	container: HTMLElement | null,
	options?: { isMobile?: boolean },
): { width: number; breakpoint: ContainerBreakpoint; isMobile: boolean } {
	const isMobile = $derived(options?.isMobile ?? false);
	let width = $state(0);
	let breakpoint = $derived(breakpointFromWidth(width));

	$effect(() => {
		if (!container) return;
		const initialWidth = container.getBoundingClientRect().width;
		untrack(() => {
			width = initialWidth;
		});
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			width = entry.contentRect.width;
		});
		observer.observe(container);
		return () => observer.disconnect();
	});

	return {
		get width() {
			return width;
		},
		get breakpoint() {
			return breakpoint;
		},
		get isMobile() {
			return isMobile;
		},
	};
}
