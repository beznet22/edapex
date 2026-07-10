/**
 * libSQL tracing proxy — counts SELECT statements per logical request.
 *
 * Wraps any `@libsql/client` Client with a transparent Proxy that records every
 * SELECT into an AsyncLocalStorage store scoped to the current request. Tests
 * use `runWithTrace()` to bracket a code path; afterwards
 * `countSelectsByTable()` returns the table-level breakdown and
 * `getSelectCounts()` returns the full timeline.
 *
 * Production code is unaffected: outside a `runWithTrace()` call the storage
 * store is undefined and the proxy is a no-op (`recordSelect` returns early,
 * `getSelectCounts()` returns []).
 *
 * The per-request caching layer (success criterion [observability]) and the
 * duplicate-SELECT detector in tier-router.ts both read from
 * `countSelectsByTable()`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Client, InValue, ResultSet } from '@libsql/client';

export interface SelectRecord {
	table: string | null;
	sql: string;
	timestamp: number;
}

export interface TraceStore {
	selects: SelectRecord[];
}

const storage = new AsyncLocalStorage<TraceStore>();

export function runWithTrace<T>(fn: () => T | Promise<T>): Promise<T> {
	const store: TraceStore = { selects: [] };
	return storage.run(store, async () => fn()) as Promise<T>;
}

export function recordSelect(sql: string): void {
	const store = storage.getStore();
	if (!store) return;
	store.selects.push({ table: extractTable(sql), sql, timestamp: Date.now() });
}

export function getSelectCounts(): SelectRecord[] {
	const store = storage.getStore();
	return store ? [...store.selects] : [];
}

export function clearSelectCounts(): void {
	const store = storage.getStore();
	if (store) store.selects.length = 0;
}

export function countSelectsByTable(): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const s of getSelectCounts()) {
		const key = s.table ?? '__unknown__';
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

export function uniqueSelectCount(): number {
	return new Set(getSelectCounts().map((s) => s.sql)).size;
}

function extractTable(sql: string): string | null {
	const match = /(?:FROM|\bINTO\b|\bUPDATE\b)\s+["`[]?(\w+)["`\]]?/i.exec(sql);
	return match && match[1] ? match[1] : null;
}

type ExecuteArgs = string | { sql: string; args?: InValue[] };

export function wrapClientWithTracing<T extends Client>(client: T): T {
	return new Proxy(client, {
		get(target, prop, receiver) {
			if (prop === 'execute') {
				return async (args: ExecuteArgs, maybeArgs?: InValue[]): Promise<ResultSet> => {
					const sql = typeof args === 'string' ? args : args.sql;
					if (/^\s*(SELECT|select)\b/.test(sql)) {
						recordSelect(sql);
					}
					return target.execute(args as never, maybeArgs as never) as Promise<ResultSet>;
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	}) as T;
}
