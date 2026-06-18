/**
 * Integration-test fixture builder.
 *
 * Constructs a real `ScopedRepositoryProvider` bound to a real `TenantContext`,
 * inserts sandboxed fixture rows inside a transaction, runs the test callback,
 * then rolls back so no fixture data leaks across test runs.
 *
 * The IDs live in the [9_999_000, 9_999_999] sandbox; the offset within that
 * range is derived from `Date.now()` at module load so concurrent test files
 * that spin up in the same process pick different starting slots.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2/driver";
import { getPool } from "$lib/server/db";
import {
	createTenantContext,
	type TenantContext,
} from "$lib/server/mastra/tenant-context";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import {
	smAcademicYears,
	smClasses,
	smClassSections,
	smExamTypes,
	smGeneralSettings,
	smParents,
	smSchools,
	smSections,
	smStaffs,
	smStudents,
	studentRecords,
	users,
} from "$lib/server/db/sms-schema";
import * as schema from "$lib/server/db/schema";
import * as relations from "$lib/server/db/relations";
import * as smsRelations from "$lib/server/db/sms-relations";

const execFileAsync = promisify(execFile);

/** Composed Drizzle schema passed to the connection-bound drizzle factory. */
const combinedSchema = {
	...schema,
	...relations,
	...smsRelations,
} as const;

/** A connection-bound Drizzle instance that runs inside the test transaction. */
export type FixtureDb = MySql2Database<typeof combinedSchema>;

/** Database handle accepted by `ScopedRepositoryProvider`'s constructor. */
type ProviderDb = ConstructorParameters<typeof ScopedRepositoryProvider>[0];

/** All sandboxed IDs created by the fixture. */
export interface FixtureIds {
	readonly schoolId: number;
	readonly examTypeId: number;
	readonly classId: number;
	readonly sectionId: number;
	readonly academicId: number;
	readonly staffId: number;
	readonly userId: number;
	readonly parentId: number;
	readonly studentId: number;
	readonly recordId: number;
}

/** Result of a raw `mysql -e` query, parsed from tab-separated output. */
export interface MysqlQueryResult<TRow extends Record<string, string> = Record<string, string>> {
	readonly fields: readonly string[];
	readonly rows: readonly TRow[];
}

/**
 * The fixture handle exposed to test callbacks. The `db` field is bound to the
 * open transaction's connection; all queries and inserts performed against it
 * roll back when `close()` runs.
 */
export interface TenantFixture {
	readonly db: FixtureDb;
	readonly provider: ScopedRepositoryProvider;
	readonly tenant: TenantContext;
	readonly ids: FixtureIds;
	mysql<TRow extends Record<string, string> = Record<string, string>>(
		sql: string,
		params?: readonly unknown[],
	): Promise<MysqlQueryResult<TRow>>;
	/** Roll back the transaction and release the connection. Idempotent. */
	close(): Promise<void>;
}

export interface WithTenantFixtureOptions {
	/** Override individual IDs; unspecified slots fall back to defaults. */
	ids?: Partial<Omit<FixtureIds, "userId" | "parentId" | "studentId" | "recordId">>;
	/** Override individual TenantContext fields after defaults are applied. */
	tenantOverrides?: Partial<TenantContext>;
}

/** Canonical default IDs from the spec; the first fixture in a process uses these. */
const DEFAULT_FIXTURE_IDS: FixtureIds = {
	schoolId: 9_999_001,
	examTypeId: 9_999_002,
	classId: 9_999_003,
	sectionId: 9_999_004,
	academicId: 9_999_005,
	staffId: 9_999_006,
	userId: 9_999_007,
	parentId: 9_999_008,
	studentId: 9_999_009,
	recordId: 9_999_010,
};

/**
 * Per-process counter seeded by `Date.now()` so that subsequent fixture
 * allocations shift the starting slot. Each call advances by 12 slots
 * (10 IDs + 2 of breathing room) and wraps within the 990-slot range,
 * guaranteeing all IDs stay below 9_999_999.
 */
let fixtureSlotOffset = Math.floor((Date.now() / 1000) % 980);

function allocateFixtureIds(): FixtureIds {
	const offset = fixtureSlotOffset;
	fixtureSlotOffset = (fixtureSlotOffset + 12) % 980;
	return {
		schoolId: 9_999_000 + offset,
		examTypeId: 9_999_001 + offset,
		classId: 9_999_003 + offset,
		sectionId: 9_999_004 + offset,
		academicId: 9_999_005 + offset,
		staffId: 9_999_006 + offset,
		userId: 9_999_007 + offset,
		parentId: 9_999_008 + offset,
		studentId: 9_999_009 + offset,
		recordId: 9_999_010 + offset,
	};
}

/**
 * Map a `?` parameter slot to a SQL literal. Numbers and booleans render as
 * numeric literals; everything else is wrapped in single quotes with embedded
 * quotes escaped. This is sufficient for the test sandbox's narrow, controlled
 * parameter values; it is not a general SQL escaper.
 */
function renderSqlParam(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error(`Cannot render non-finite number as SQL literal: ${String(value)}`);
		}
		return String(value);
	}
	if (typeof value === "boolean") return value ? "1" : "0";
	if (value instanceof Date) {
		return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`;
	}
	const text = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
	return `'${text}'`;
}

function renderSql(sql: string, params: readonly unknown[] | undefined): string {
	if (!params || params.length === 0) return sql;
	let index = 0;
	return sql.replace(/\?/g, () => {
		if (index >= params.length) {
			throw new Error("More `?` placeholders than parameters supplied to mysql helper");
		}
		const rendered = renderSqlParam(params[index]);
		index += 1;
		return rendered;
	});
}

interface RawMysqlBatch {
	readonly fields: readonly string[];
	readonly rows: readonly string[][];
}

async function runRawMysql(sql: string): Promise<RawMysqlBatch> {
	const { stdout } = await execFileAsync(
		"mysql",
		[
			"-h", "127.0.0.1",
			"-u", "devuser",
			// No quoting here: the shell would strip the single quotes around the
			// password before mysql sees it, but `execFile` passes argv verbatim
			// so the quotes must be omitted.
			"-ppaxxw0rd@2791",
			"devdb",
			"-B",
			"-e", sql,
		],
		{ maxBuffer: 16 * 1024 * 1024 },
	);

	const lines = stdout.split("\n").filter((line) => line.length > 0);
	if (lines.length === 0) {
		return { fields: [], rows: [] };
	}
	const fields = lines[0]!.split("\t");
	const rows = lines.slice(1).map((line) => line.split("\t"));
	return { fields, rows };
}

async function mysql<TRow extends Record<string, string> = Record<string, string>>(
	sql: string,
	params?: readonly unknown[],
): Promise<MysqlQueryResult<TRow>> {
	const rendered = renderSql(sql, params);
	const batch = await runRawMysql(rendered);
	const rows: TRow[] = batch.rows.map((cells) => {
		const row: Record<string, string> = {};
		for (let i = 0; i < batch.fields.length; i += 1) {
			const field = batch.fields[i]!;
			row[field] = cells[i] ?? "";
		}
		return row as TRow;
	});
	return { fields: batch.fields, rows };
}

async function seedFixtures(tx: FixtureDb, ids: FixtureIds): Promise<void> {
	await tx.insert(smSchools).values({
		id: ids.schoolId,
		schoolName: `Test School ${ids.schoolId}`,
		schoolCode: `T-${ids.schoolId}`,
		domain: "school",
		isEmailVerified: 0,
		activeStatus: 1,
		isEnabled: "yes",
	});

	await tx.insert(smAcademicYears).values({
		id: ids.academicId,
		year: "2099",
		title: `Test Year ${ids.academicId}`,
		startingDate: "2020-01-01",
		endingDate: "2099-12-31",
		schoolId: ids.schoolId,
		activeStatus: 1,
	});

	await tx.insert(smExamTypes).values({
		id: ids.examTypeId,
		title: `Test Term ${ids.examTypeId}`,
		averageMark: 0,
		isAverage: 0,
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		activeStatus: 1,
	});

	await tx.insert(smClasses).values({
		id: ids.classId,
		className: `Test Class ${ids.classId}`,
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		activeStatus: 1,
	});

	await tx.insert(smSections).values({
		id: ids.sectionId,
		sectionName: "A",
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		activeStatus: 1,
	});

	await tx.insert(smClassSections).values({
		classId: ids.classId,
		sectionId: ids.sectionId,
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		activeStatus: 1,
	});

	await tx.insert(users).values({
		id: ids.userId,
		fullName: "Test Staff User",
		username: `test_user_${ids.userId}`,
		schoolId: ids.schoolId,
		isAdministrator: "no",
		activeStatus: 1,
		walletBalance: 0,
	});

	await tx.insert(smStaffs).values({
		id: ids.staffId,
		userId: ids.userId,
		firstName: "Test",
		lastName: "Staff",
		fullName: "Test Staff",
		schoolId: ids.schoolId,
		activeStatus: 1,
	});

	await tx.insert(smParents).values({
		id: ids.parentId,
		userId: ids.userId,
		guardiansName: "Test Guardian",
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		activeStatus: 1,
	});

	await tx.insert(smStudents).values({
		id: ids.studentId,
		admissionNo: ids.studentId,
		firstName: "Test",
		lastName: "Student",
		fullName: "Test Student",
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		classId: ids.classId,
		sectionId: ids.sectionId,
		parentId: ids.parentId,
		userId: ids.userId,
		activeStatus: 1,
	});

	await tx.insert(studentRecords).values({
		id: ids.recordId,
		classId: ids.classId,
		sectionId: ids.sectionId,
		schoolId: ids.schoolId,
		academicId: ids.academicId,
		studentId: ids.studentId,
		sessionId: ids.academicId,
		activeStatus: 1,
	});

	await tx.insert(smGeneralSettings).values({
		schoolName: `Test School ${ids.schoolId}`,
		schoolCode: `T-${ids.schoolId}`,
		activeStatus: 1,
	});
}

// Note: BaseRepository.loadConfigurations queries
// `sm_general_settings WHERE school_id = ?` but the schema has no
// `school_id` column (sm_general_settings is a single-row global
// settings table). The Drizzle query returns zero rows for every
// tenant. This is a pre-existing source-code inconsistency that is
// out of scope for this fixture.

async function openFixtureSession(ids: FixtureIds): Promise<TenantFixture> {
	const pool = getPool();
	const connection = await pool.getConnection();
	await connection.beginTransaction();

	const fixtureDb = drizzle(connection, {
		schema: combinedSchema,
		mode: "default",
	});

	let closed = false;

	const close = async (): Promise<void> => {
		if (closed) return;
		closed = true;
		try {
			await connection.rollback();
		} catch {
			// Swallow rollback errors; the connection will be released below.
		}
		connection.release();
	};

	try {
		await seedFixtures(fixtureDb, ids);

		const tenant = createTenantContext({
			schoolId: ids.schoolId,
			classId: ids.classId,
			sectionId: ids.sectionId,
			examTypeId: ids.examTypeId,
			academicId: ids.academicId,
			staffId: ids.staffId,
			userId: ids.userId,
			designationId: ALLOWED_DESIGNATIONS.IT,
		});

		const provider = new ScopedRepositoryProvider(
			fixtureDb as unknown as ProviderDb,
			tenant,
		);

		return {
			db: fixtureDb,
			provider,
			tenant,
			ids,
			mysql,
			close,
		};
	} catch (err) {
		await close();
		throw err;
	}
}

/**
 * Acquire a fully-seeded transaction fixture. Caller is responsible for
 * invoking `await fx.close()` (or wrapping in `withTenantFixture`) so the
 * transaction is rolled back and the connection is released.
 */
export async function getTenantFixture(
	opts: WithTenantFixtureOptions = {},
): Promise<TenantFixture> {
	const baseIds: FixtureIds =
		opts.ids === undefined
			? DEFAULT_FIXTURE_IDS
			: { ...DEFAULT_FIXTURE_IDS, ...opts.ids };
	const ids: FixtureIds = opts.ids === undefined ? allocateFixtureIds() : baseIds;

	const fixture = await openFixtureSession(ids);

	if (!opts.tenantOverrides) {
		return fixture;
	}

	const merged = createTenantContext({
		...{
			schoolId: fixture.tenant.schoolId,
			classId: fixture.tenant.classId,
			sectionId: fixture.tenant.sectionId,
			examId: fixture.tenant.examId,
			examTypeId: fixture.tenant.examTypeId,
			academicId: fixture.tenant.academicId,
			studentId: fixture.tenant.studentId,
			userId: fixture.tenant.userId,
			staffId: fixture.tenant.staffId,
			roleId: fixture.tenant.roleId,
			designationId: fixture.tenant.designationId,
		},
		...opts.tenantOverrides,
	});

	const provider = new ScopedRepositoryProvider(
		fixture.db as unknown as ProviderDb,
		merged,
	);

	return {
		...fixture,
		tenant: merged,
		provider,
	};
}

/**
 * Vitest-friendly wrapper. Wraps the test callback in a fixture, runs it, and
 * guarantees rollback via `finally` even if the callback throws.
 */
export function withTenantFixture(
	opts: WithTenantFixtureOptions = {},
): (fn: (fx: TenantFixture) => Promise<void>) => Promise<void> {
	return async (fn, ..._rest) => {
		const fixture = await getTenantFixture(opts);
		try {
			await fn(fixture);
		} finally {
			await fixture.close();
		}
	};
}
