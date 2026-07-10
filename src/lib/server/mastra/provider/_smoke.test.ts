/**
 * Provider module bootstrap smoke test.
 *
 * Phase 1 of the harden-provider-configuration-lifecycle ferment requires
 * `pnpm test -- src/lib/server/mastra/provider` to exit 0 with no real tests
 * yet. This stub proves the module directory exists, the barrel resolves, and
 * the public API surface matches the contract declared in
 * `src/lib/server/mastra/provider/index.ts`. Subsequent phases add the
 * resolver / tier-router / discovery / credentials test suites that bring the
 * package to ≥80% line + branch coverage.
 */
import { describe, expect, it } from 'vitest';
import * as provider from './index';

describe('provider module bootstrap', () => {
	it('exports resolveModelForRequest as the public entrypoint', () => {
		expect(typeof provider.resolveModelForRequest).toBe('function');
	});

	it('exposes the tracing proxy at the storage layer', async () => {
		const tracing = await import('$lib/server/mastra/storage/libsql/tracing-client');
		expect(typeof tracing.runWithTrace).toBe('function');
		expect(typeof tracing.wrapClientWithTracing).toBe('function');
		expect(typeof tracing.countSelectsByTable).toBe('function');
	});

	it('records SELECTs inside a runWithTrace scope and exposes them per-table', async () => {
		const tracing = await import('$lib/server/mastra/storage/libsql/tracing-client');
		const fakeClient = {
			execute: async () => ({ rows: [], rowsAffected: 0, lastInsertRowid: 0n })
		};
		const wrapped = tracing.wrapClientWithTracing(
			fakeClient as unknown as Parameters<typeof tracing.wrapClientWithTracing>[0]
		);
		await tracing.runWithTrace(async () => {
			await wrapped.execute('SELECT * FROM encrypted_credentials WHERE id = ?');
			await wrapped.execute('SELECT COUNT(*) FROM model_visibility');
			await wrapped.execute('SELECT 1 FROM provider_access_policy WHERE school_id = ?');
			await wrapped.execute("INSERT INTO encrypted_credentials (id) VALUES ('x')");
			const counts = tracing.countSelectsByTable();
			expect(counts.encrypted_credentials).toBe(1);
			expect(counts.model_visibility).toBe(1);
			expect(counts.provider_access_policy).toBe(1);
			expect(tracing.uniqueSelectCount()).toBe(3);
			expect(tracing.getSelectCounts()).toHaveLength(3);
		});
	});

	it('is a no-op outside a runWithTrace scope', async () => {
		const { resetCounters } = await import('$lib/server/mastra/storage/libsql/tracing-client')
			.then((m) => ({ resetCounters: m.clearSelectCounts }));
		const counts = await import('$lib/server/mastra/storage/libsql/tracing-client')
			.then((m) => m.countSelectsByTable());
		expect(counts).toEqual({});
		void resetCounters;
	});
});
