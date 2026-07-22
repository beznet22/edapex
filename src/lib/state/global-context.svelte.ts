let _active = $state(false);

export function isActive(): boolean {
	return _active;
}

export function setActive(v: boolean): void {
	_active = v;
}
