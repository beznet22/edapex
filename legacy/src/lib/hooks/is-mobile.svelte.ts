import { MediaQuery } from "svelte/reactivity";

const DEFAULT_MOBILE_BREAKPOINT = 768;
const DEFAULT_DESKTOP_BREAKPOINT = 1024;

export class IsMobile extends MediaQuery {
	constructor(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
		super(`max-width: ${breakpoint - 1}px`);
	}
}

export class IsTablet extends MediaQuery {
	constructor(
		minBreakpoint: number = DEFAULT_MOBILE_BREAKPOINT,
		maxBreakpoint: number = DEFAULT_DESKTOP_BREAKPOINT,
	) {
		super(`(min-width: ${minBreakpoint}px) and (max-width: ${maxBreakpoint - 1}px)`);
	}
}

export class IsLandscape extends MediaQuery {
	constructor() {
		super(`(orientation: landscape)`);
	}
}
