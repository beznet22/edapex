import { afterEach, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveDbUrl, resetResolvedDbUrl } from './db-url';

describe('resolveDbUrl', () => {
	const originalProcessEnv = process.env.MASTRA_DB_URL;

	afterEach(() => {
		if (originalProcessEnv === undefined) {
			delete process.env.MASTRA_DB_URL;
		} else {
			process.env.MASTRA_DB_URL = originalProcessEnv;
		}
		resetResolvedDbUrl();
	});

	it('falls back to an absolute file:<projectRoot>/mastra.db when no env is set', () => {
		delete process.env.MASTRA_DB_URL;
		const url = resolveDbUrl({
			processEnv: {},
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(url).toBe(`file:${resolve('/tmp/edapex-test', 'mastra.db')}`);
		expect(url.startsWith('file:/')).toBe(true);
	});

	it('prefers svelteEnvValue over processEnv', () => {
		const url = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: 'file:from-process.db' },
			svelteEnvValue: 'file:from-svelte.db',
			projectRoot: '/tmp/edapex-test'
		});
		expect(url).toBe(`file:${resolve('/tmp/edapex-test', 'from-svelte.db')}`);
	});

	it('resolves a relative file: URL against projectRoot', () => {
		const url = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: 'file:./storage/edapex-mastra.db' },
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(url).toBe(`file:${resolve('/tmp/edapex-test', 'storage', 'edapex-mastra.db')}`);
	});

	it('passes through an absolute file: URL unchanged', () => {
		const url = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: 'file:/var/data/mastra.db' },
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(url).toBe('file:/var/data/mastra.db');
	});

	it('passes through libsql:// and https:// URLs unchanged', () => {
		const remote = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: 'libsql://db.example.com' },
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(remote).toBe('libsql://db.example.com');

		const https = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: 'https://db.example.com' },
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(https).toBe('https://db.example.com');
	});

	it('returns file::memory: for in-memory mode', () => {
		const url = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: 'file::memory:' },
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(url).toBe('file::memory:');
	});

	it('treats whitespace-only env as empty and falls back to default', () => {
		const url = resolveDbUrl({
			processEnv: { MASTRA_DB_URL: '   ' },
			svelteEnvValue: '',
			projectRoot: '/tmp/edapex-test'
		});
		expect(url).toBe(`file:${resolve('/tmp/edapex-test', 'mastra.db')}`);
	});
});
