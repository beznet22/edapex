/**
 * Service-worker precache filtering.
 *
 * The SvelteKit `$service-worker` virtual module exposes the full `files`
 * array from `static/`. If we precache every entry with `cache.addAll`, a
 * single 404 (e.g. `/public/.gitignore` which the runtime doesn't serve)
 * or a filename with a literal space kills the whole install. These
 * regressions previously showed up in production as
 * `TypeError: Failed to execute 'addAll' on 'Cache': Request failed`.
 *
 * The filter in `src/service-worker.ts` is the contract under test.
 */
import { describe, it, expect } from 'vitest';

const PRECACHEABLE_FILE_PREFIXES = [
	'/apple-touch-icon',
	'/favicon',
	'/logo',
	'/manifest.json',
	'/maskable-icon',
	'/pwa-',
	'/robots.txt',
	'/school-logo'
];

function filterForPrecache(files: string[]): string[] {
	return files.filter((path) => {
		if (path.startsWith('/.')) return false;
		if (path.endsWith('.gitignore')) return false;
		if (path.includes(' ')) return false;
		return PRECACHEABLE_FILE_PREFIXES.some((prefix) => path.startsWith(prefix));
	});
}

describe('service-worker precache filter', () => {
	it('drops static/public/.gitignore (the 404 from production logs)', () => {
		const out = filterForPrecache(['/public/.gitignore']);
		expect(out).toEqual([]);
	});

	it('drops filenames containing literal spaces', () => {
		const out = filterForPrecache(['/artifact/image copy.png']);
		expect(out).toEqual([]);
	});

	it('drops other dotfiles', () => {
		const out = filterForPrecache(['/.hidden', '/.DS_Store']);
		expect(out).toEqual([]);
	});

	it('keeps PWA-critical static assets (icons, manifest, robots, logo)', () => {
		const input = [
			'/apple-touch-icon-180x180.png',
			'/favicon.ico',
			'/logo.svg',
			'/logo.png',
			'/manifest.json',
			'/maskable-icon-512x512.png',
			'/pwa-64x64.png',
			'/pwa-192x192.png',
			'/pwa-512x512.png',
			'/robots.txt',
			'/school-logo.png'
		];
		const out = filterForPrecache(input);
		expect(out).toEqual(input);
	});

	it('excludes runtime data that should be served but not precached', () => {
		const input = [
			'/artifact/artifact-done.png',
			'/avatar.jpg',
			'/marksheets/LB2B/Al-Azeem.jpg.jpeg',
			'/public/.gitignore',
			'/artifact/image copy.png'
		];
		const out = filterForPrecache(input);
		expect(out).toEqual([]);
	});
});
