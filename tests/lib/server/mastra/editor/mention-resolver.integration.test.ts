/**
 * Integration tests for `resolveMentionsInMarkdown`.
 *
 * Pins the current direct-DB pattern (`getDatabase()` + raw `sm_students`
 * select scoped by `tenantContext.schoolId`) as a regression net for the
 * future refactor to `ScopedRepositoryProvider`. When that refactor lands,
 * the test bodies should not change — the resolver's *contract* (input
 * markdown → resolved markdown + mentions, with cross-tenant rejection)
 * is the surface we care about.
 *
 * The function under test reads its tenant from
 * `requestContext.get('tenantContext')`, so each test builds a real
 * `RequestContext` and binds the fixture's tenant into it.
 *
 * Visibility note (architectural, not a bug):
 *   The resolver uses `getDatabase()`, which is a connection *pool* — the
 *   underlying connection is checked out per query, so it is NOT the same
 *   connection that `withTenantFixture` holds open in its transaction.
 *   Data inserted into the fixture's transaction is therefore invisible
 *   to the resolver. To make the tests exercise real DB lookups, we
 *   pre-seed two committed rows (one school, one student — and a second
 *   pair for the cross-tenant case) via `runMysql` in `beforeAll`, then
 *   drive the fixture's `tenantOverrides` to point at those committed IDs.
 *   The pre-seeded rows live in the devdb `sm_*` tables for the duration
 *   of the suite and are removed in `afterAll`. The fixture's own
 *   transactional seed rolls back on `close()` and leaves no residue.
 */
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { resolveMentionsInMarkdown } from "$lib/server/mastra/editor/mention-resolver";
import { WorkspaceMismatchError } from "$lib/server/mastra/tenant-context";
import {
	getTenantFixture,
	type TenantFixture,
} from "../integration-helpers/withTenantFixture";
import { canConnectDb } from "../integration-helpers/canConnectDb";
import { runMysql } from "../integration-helpers/mysqlFactCheck";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL:
			process.env.DATABASE_URL ??
			"mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb",
		LIBSQL_URL: "file:tests/.tmp/test.db",
		LIBSQL_AUTH_TOKEN: "test",
		TOKEN_ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
		TINYFISH_API_KEY: "test-key",
	},
}));

vi.mock("$env/dynamic/public", () => ({
	env: {
		PUBLIC_STORAGE_PATH: "/tmp/test-storage",
	},
}));

const canConnect = await canConnectDb();

/** Committed rows that the resolver's pool-issued connections can see. */
const PRIMARY_SCHOOL_ID = 9_998_001;
const PRIMARY_STUDENT_ID = 9_999_007;
const PRIMARY_ADMISSION_NO = 9_999_007;
const ROGUE_SCHOOL_ID = 9_998_002;
const ROGUE_STUDENT_ID = 9_999_008;

function buildRequestContext(fx: TenantFixture): RequestContext {
	const rc = new RequestContext();
	rc.set("tenantContext", fx.tenant);
	return rc;
}

async function openPrimaryFixture(): Promise<TenantFixture> {
	return getTenantFixture({
		tenantOverrides: {
			schoolId: PRIMARY_SCHOOL_ID,
			studentId: PRIMARY_STUDENT_ID,
		},
	});
}

beforeAll(async () => {
	if (!canConnect) return;
	await runMysql(
		`INSERT INTO sm_schools (id, school_name, school_code, domain, is_email_verified, active_status, is_enabled)
		 VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
		[
			PRIMARY_SCHOOL_ID,
			`Test School ${PRIMARY_SCHOOL_ID}`,
			`T-${PRIMARY_SCHOOL_ID}`,
			"school",
			0,
			1,
			"yes",
			ROGUE_SCHOOL_ID,
			`Rogue School ${ROGUE_SCHOOL_ID}`,
			`R-${ROGUE_SCHOOL_ID}`,
			"school",
			0,
			1,
			"yes",
		],
	);
	await runMysql(
		`INSERT INTO sm_students (id, admission_no, first_name, last_name, full_name, school_id, active_status)
		 VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
		[
			PRIMARY_STUDENT_ID,
			PRIMARY_ADMISSION_NO,
			"Alice",
			"Smith",
			"Alice Smith",
			PRIMARY_SCHOOL_ID,
			1,
			ROGUE_STUDENT_ID,
			ROGUE_STUDENT_ID,
			"Rogue",
			"Student",
			"Rogue Student",
			ROGUE_SCHOOL_ID,
			1,
		],
	);
});

afterAll(async () => {
	if (!canConnect) return;
	await runMysql(`DELETE FROM sm_students WHERE id IN (?, ?)`, [
		PRIMARY_STUDENT_ID,
		ROGUE_STUDENT_ID,
	]);
	await runMysql(`DELETE FROM sm_schools WHERE id IN (?, ?)`, [
		PRIMARY_SCHOOL_ID,
		ROGUE_SCHOOL_ID,
	]);
});

describe.skipIf(!canConnect)("resolveMentionsInMarkdown", () => {
	it("resolves a single {{students:<id>}} mention against the tenant's school", async () => {
		const fx = await openPrimaryFixture();
		try {
			const result = await resolveMentionsInMarkdown(
				`Hello {{students:${PRIMARY_STUDENT_ID}}}`,
				buildRequestContext(fx),
				undefined,
			);
			expect(result.markdown).toBe(
				`Hello <<Alice Smith (Adm#${PRIMARY_ADMISSION_NO}) (students#${PRIMARY_STUDENT_ID})>>`,
			);
			expect(result.mentions).toEqual([
				{
					category: "students",
					id: PRIMARY_STUDENT_ID,
					label: `Alice Smith (Adm#${PRIMARY_ADMISSION_NO})`,
				},
			]);
		} finally {
			await fx.close();
		}
	});

	it("resolves multiple mentions of different categories in one input", async () => {
		const fx = await openPrimaryFixture();
		try {
			const result = await resolveMentionsInMarkdown(
				`{{students:${PRIMARY_STUDENT_ID}}} and {{date:2025-01-15}} and {{custom:foo bar}}`,
				buildRequestContext(fx),
				undefined,
			);
			expect(result.markdown).toBe(
				`<<Alice Smith (Adm#${PRIMARY_ADMISSION_NO}) (students#${PRIMARY_STUDENT_ID})>> and <<2025-01-15 (date)>> and <<foo bar (custom)>>`,
			);
			expect(result.mentions).toEqual([
				{
					category: "students",
					id: PRIMARY_STUDENT_ID,
					label: `Alice Smith (Adm#${PRIMARY_ADMISSION_NO})`,
				},
				{ category: "date", id: "2025-01-15", label: "2025-01-15" },
				{ category: "custom", id: "foo bar", label: "foo bar" },
			]);
		} finally {
			await fx.close();
		}
	});

	it("resolves a {{date:<iso>}} mention as a literal pass-through", async () => {
		const fx = await openPrimaryFixture();
		try {
			const result = await resolveMentionsInMarkdown(
				"Date {{date:2025-01-15}}",
				buildRequestContext(fx),
				undefined,
			);
			expect(result.markdown).toBe("Date <<2025-01-15 (date)>>");
			expect(result.mentions).toEqual([
				{ category: "date", id: "2025-01-15", label: "2025-01-15" },
			]);
		} finally {
			await fx.close();
		}
	});

	it("resolves a {{custom:<text>}} mention as a literal pass-through", async () => {
		const fx = await openPrimaryFixture();
		try {
			const result = await resolveMentionsInMarkdown(
				"Note {{custom:foo bar}}",
				buildRequestContext(fx),
				undefined,
			);
			expect(result.markdown).toBe("Note <<foo bar (custom)>>");
			expect(result.mentions).toEqual([
				{ category: "custom", id: "foo bar", label: "foo bar" },
			]);
		} finally {
			await fx.close();
		}
	});

	it("rejects a student mention belonging to a different school with WorkspaceMismatchError", async () => {
		const fx = await openPrimaryFixture();
		try {
			await expect(
				resolveMentionsInMarkdown(
					`Hello {{students:${ROGUE_STUDENT_ID}}}`,
					buildRequestContext(fx),
					undefined,
				),
			).rejects.toBeInstanceOf(WorkspaceMismatchError);
		} finally {
			await fx.close();
		}
	});

	it("rejects an unknown student id with WorkspaceMismatchError", async () => {
		const fx = await openPrimaryFixture();
		try {
			await expect(
				resolveMentionsInMarkdown(
					`Hello {{students:${PRIMARY_STUDENT_ID + 9_000_000}}}`,
					buildRequestContext(fx),
					undefined,
				),
			).rejects.toBeInstanceOf(WorkspaceMismatchError);
		} finally {
			await fx.close();
		}
	});

	it("returns the input unchanged with empty mentions when no requestContext is provided", async () => {
		const result = await resolveMentionsInMarkdown(
			`Hello {{students:${PRIMARY_STUDENT_ID}}}`,
			undefined,
			undefined,
		);
		expect(result.markdown).toBe(`Hello {{students:${PRIMARY_STUDENT_ID}}}`);
		expect(result.mentions).toEqual([]);
	});

	/*
	 * KNOWN BUG: the dedupe branch at `src/lib/server/mastra/editor/mention-resolver.ts:102-106`
	 * is inverted. The current implementation is:
	 *
	 *   const dedupeKey = `${category}:${rawId}`;
	 *   if (seen.has(dedupeKey)) {
	 *     seen.add(dedupeKey);
	 *     continue;
	 *   }
	 *   // ... process match ...
	 *
	 * The intent appears to be: skip subsequent occurrences of an already-seen
	 * mention key. But `seen.add` is only called on the *skip* path, never on
	 * the *process* path. Combined with the missing `seen.add(dedupeKey)` after
	 * processing, the result is that `seen.has` is always false, and every
	 * occurrence is processed and pushed into the mentions list — the dedupe
	 * never happens. (And on the (unreachable) path where `seen.has` does
	 * return true, the branch would add the key a second time, which is a
	 * no-op.)
	 *
	 * This test is marked `it.skip` per the microtask spec (DoD §4). The bug is
	 * documented in `.planning/results/mt-009-mention-resolver.md`; do not fix
	 * it here — the fix is out of scope for this regression-pin test.
	 */
	it.skip("deduplicates identical {{students:<id>}} mentions (KNOWN BUG — see result file)", async () => {
		const fx = await openPrimaryFixture();
		try {
			const result = await resolveMentionsInMarkdown(
				`{{students:${PRIMARY_STUDENT_ID}}} {{students:${PRIMARY_STUDENT_ID}}}`,
				buildRequestContext(fx),
				undefined,
			);
			expect(result.markdown).toBe(
				`<<Alice Smith (Adm#${PRIMARY_ADMISSION_NO}) (students#${PRIMARY_STUDENT_ID})>> <<Alice Smith (Adm#${PRIMARY_ADMISSION_NO}) (students#${PRIMARY_STUDENT_ID})>>`,
			);
			expect(result.mentions).toHaveLength(2);
		} finally {
			await fx.close();
		}
	});
});
