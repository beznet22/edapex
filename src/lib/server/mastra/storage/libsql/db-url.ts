/**
 * Single source of truth for the application libSQL DB URL.
 *
 * Resolution order (first non-empty wins):
 *   1. `$env/dynamic/private.MASTRA_DB_URL` — SvelteKit's runtime env
 *      loader. Vite + SvelteKit populate this in dev and production.
 *   2. `process.env.MASTRA_DB_URL` — set by the shell / container runtime.
 *      Read as a fallback so non-SvelteKit callers (e.g. scripts) still work.
 *   3. The project-root default `file:<projectRoot>/mastra.db` — resolved
 *      as an ABSOLUTE path so the DB lives at the same place regardless
 *      of the process's cwd.
 *
 * Why absolute by default: `file:./mastra.db` is relative to the current
 * working directory, which can differ between `pnpm dev` and `pnpm test`,
 * or between the dev server and a one-off script. An absolute path makes
 * persistence deterministic and prevents the "key disappeared after
 * restart" bug that occurs when two processes disagree on the path.
 *
 * Accepted input shapes:
 *   - `file:relative/path.db`       → resolved against projectRoot
 *   - `file:/absolute/path.db`      → used as-is
 *   - `file::memory:`               → returned unchanged (in-memory mode)
 *   - `libsql://…` / `https://…`    → returned unchanged (remote libsql)
 *   - `*`                           → trimmed and passed through
 *
 * The resolved URL is memoized for the lifetime of the process so callers
 * see a single value. To re-evaluate (e.g. in tests that mutate env), call
 * `resetResolvedDbUrl()`.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Computed at module load. `import.meta.url` for a `src/lib/.../db-url.ts`
// file points to: <projectRoot>/src/lib/server/mastra/storage/libsql/db-url.ts.
// Walking up 6 levels lands on the project root.
const MODULE_URL = import.meta.url;
const DEFAULT_PROJECT_ROOT = (() => {
	try {
		return resolve(fileURLToPath(MODULE_URL), '../../../../../../..');
	} catch {
		// Fallback for non-file:// contexts (bundlers with stub URLs).
		return process.cwd();
	}
})();
const DEFAULT_DB_FILE_NAME = 'mastra.db';
const DEFAULT_FILE_URL = `file:${DEFAULT_DB_FILE_NAME}`;
const MEMORY_URL = 'file::memory:';

let _resolved: string | null = null;
let _logged = false;

function readSvelteEnv(): string | undefined {
	try {
		// `$env/dynamic/private` is a SvelteKit-only module. Wrap in a
		// dynamic import + try/catch so non-SvelteKit callers (tests,
		// scripts) don't blow up.
		const dynamic = (globalThis as { __sveltekit_private__?: { MASTRA_DB_URL?: string } })
			.__sveltekit_private__;
		if (dynamic && typeof dynamic.MASTRA_DB_URL === 'string') {
			return dynamic.MASTRA_DB_URL;
		}
	} catch {
		// ignore
	}
	return undefined;
}

function readProcessEnv(): string | undefined {
	const fromProcess = process.env.MASTRA_DB_URL;
	return typeof fromProcess === 'string' && fromProcess.length > 0
		? fromProcess
		: undefined;
}

function resolveFileUrl(input: string, projectRoot: string): string {
	const body = input.slice('file:'.length);
	if (body === ':memory:' || body.startsWith(':memory:')) {
		return MEMORY_URL;
	}
	if (body.length === 0) {
		return `file:${resolve(projectRoot, DEFAULT_DB_FILE_NAME)}`;
	}
	const target = isAbsolute(body) ? body : resolve(projectRoot, body);
	return `file:${target}`;
}

function ensureParentDir(fileUrl: string, opts: { create?: boolean } = {}): void {
	if (!opts.create) return;
	if (!fileUrl.startsWith('file:')) return;
	if (fileUrl === MEMORY_URL) return;
	const body = fileUrl.slice('file:'.length);
	if (body.startsWith(':')) return;
	if (!isAbsolute(body)) return;
	const dir = dirname(body);
	if (!existsSync(dir)) {
		try {
			mkdirSync(dir, { recursive: true });
		} catch {
			// Best-effort: the user/operator is responsible for ensuring the
			// directory exists. We never want to crash boot because the
			// operator pointed us at a path we cannot create.
		}
	}
}

export interface ResolveDbUrlOptions {
	/** Override the project root for `file:` URL resolution. Defaults to the
	 *  directory of this file's enclosing project (resolved via import.meta.url). */
	projectRoot?: string;
	/** Override `process.env.MASTRA_DB_URL` for tests. */
	processEnv?: Record<string, string | undefined>;
	/** Override the SvelteKit `$env/dynamic/private` value for tests. */
	svelteEnvValue?: string;
	/** Skip the project-root default and return whatever the inputs give. */
	allowEmpty?: boolean;
}

export function resolveDbUrl(options: ResolveDbUrlOptions = {}): string {
	if (_resolved !== null && options.processEnv === undefined && options.svelteEnvValue === undefined) {
		return _resolved;
	}

	const projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;

	const fromSvelte = options.svelteEnvValue ?? readSvelteEnv();
	const fromProcess =
		options.processEnv !== undefined
			? options.processEnv.MASTRA_DB_URL
			: readProcessEnv();

	const raw = (fromSvelte && fromSvelte.length > 0 ? fromSvelte : fromProcess)?.trim();

	if (!raw) {
		if (options.allowEmpty) return '';
		const fallback = resolveFileUrl(DEFAULT_FILE_URL, projectRoot);
		_resolved = fallback;
		logOnce(fallback);
		ensureParentDir(fallback, { create: true });
		return fallback;
	}

	const trimmed = raw.trim();
	if (trimmed.startsWith('file:')) {
		const resolved = resolveFileUrl(trimmed, projectRoot);
		_resolved = resolved;
		logOnce(resolved);
		// For explicitly-configured paths, do not auto-mkdir. The operator
		// is responsible for ensuring the parent directory exists. This
		// avoids permission errors on misconfigured production paths.
		ensureParentDir(resolved);
		return resolved;
	}

	// `libsql://`, `https://`, `wss://` etc. — pass through.
	_resolved = trimmed;
	logOnce(trimmed);
	return trimmed;
}

export function resetResolvedDbUrl(): void {
	_resolved = null;
	_logged = false;
}

function logOnce(value: string): void {
	if (_logged) return;
	_logged = true;
	// Log to stderr so the message is visible regardless of stdout buffering.
	// Keep the message short and grep-friendly so operators can confirm the
	// path from cold-start logs.
	try {
		console.warn(`[db-url] Using libSQL URL: ${value}`);
	} catch {
		// best-effort logging only
	}
}
