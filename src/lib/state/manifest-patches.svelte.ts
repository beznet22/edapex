export type FilePatch = {
	manifestStatus?: string;
	validationErrors?: string[];
	validationErrorCount?: number;
	validationWarnings?: string[];
	validationWarningCount?: number;
};

let _patches: Record<string, FilePatch> = $state({});

export function patchFile(url: string, patch: FilePatch): void {
	_patches[url] = patch;
}

export function clearPatch(url: string): void {
	delete _patches[url];
}

export function getPatches(): Record<string, FilePatch> {
	return _patches;
}
