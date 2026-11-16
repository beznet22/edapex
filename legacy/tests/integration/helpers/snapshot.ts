/**
 * MySQL row snapshot/restore helper.
 *
 * Some tests (e.g. `/marksheet commit`) exercise write tools that mutate
 * `sm_*` tables. The plan forbids permanent mutations, so tests that touch
 * the database must:
 *
 *   1. Capture the affected rows BEFORE the test (via `snapshotRows`).
 *   2. Run the test.
 *   3. Restore the captured state (via `restoreRows`) regardless of pass/fail.
 *
 * Captures are stored on a per-snapshot object so multiple snapshots in the
 * same test file do not interfere.
 *
 * Only rows matching the provided WHERE filter are snapshotted. The caller
 * is responsible for supplying a filter narrow enough that the capture set
 * stays small.
 */
import { sql } from 'drizzle-orm';
import type { MySQLDrizzleClient } from '$lib/server/db';

export interface RowSnapshot {
	readonly table: string;
	readonly rows: ReadonlyArray<Record<string, unknown>>;
}

export interface SnapshotRegistry {
	snapshot(table: string, where: ReturnType<typeof sql>): Promise<RowSnapshot>;
	restore(): Promise<void>;
	discard(): void;
}

export async function createSnapshotRegistry(db: MySQLDrizzleClient): Promise<SnapshotRegistry> {
	const captured: RowSnapshot[] = [];
	const discarded = { value: false };

	const registry: SnapshotRegistry = {
		async snapshot(table, where) {
			const stmt = sql`SELECT * FROM ${sql.raw(table)} WHERE ${where}`;
			const rows = (await db.execute(stmt)) as unknown as Array<Record<string, unknown>>;
			const snap: RowSnapshot = { table, rows };
			captured.push(snap);
			return snap;
		},
		async restore() {
			if (discarded.value) return;
			for (const snap of captured.reverse()) {
				if (snap.rows.length === 0) continue;
				await db.execute(
					sql`DELETE FROM ${sql.raw(snap.table)} WHERE ${Object.keys(snap.rows[0] as object)
						.map((col) => sql`${sql.raw(col)} IN (${sql.raw(snap.rows.map((r) => formatValue(r[col])).join(','))})`)
						.reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc} OR ${cur}`))}`
				);
				for (const row of snap.rows) {
					const cols = Object.keys(row);
					const values = cols.map((c) => row[c]);
					await db.execute(
						sql`INSERT INTO ${sql.raw(snap.table)} (${sql.raw(cols.join(','))}) VALUES (${sql.raw(values.map((v) => formatValue(v)).join(','))})`
					);
				}
			}
		},
		discard() {
			discarded.value = true;
			captured.length = 0;
		}
	};

	return registry;
}

function formatValue(v: unknown): string {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'number') return String(v);
	if (typeof v === 'boolean') return v ? '1' : '0';
	if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
	return `'${String(v).replace(/'/g, "''")}'`;
}
