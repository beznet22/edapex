/**
 * Integration test: marksheet parse + MySQL context resolution
 *
 * Reads each strict markdown fixture, resolves the student/school/class/section
 * from the live MySQL database, builds a full ParseContext, re-parses with
 * context, validates against the Zod marksheetSchema, and saves the validated
 * output to storage/mock-data/generated/.
 *
 * The fixture data is synthetic — context JSON files contain the expected IDs.
 * This test queries the live DB to verify those structural records exist
 * (school, academic year, exam types, subjects, etc.) and builds real
 * ParseContext values where possible, falling back to fixture data otherwise.
 *
 * Run: pnpm test:integration   (sets RUN_LIVE_E2E=1)
 */
import 'dotenv/config';
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, and, inArray } from 'drizzle-orm';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

import type { ParseContext } from '$lib/utils/marksheet-ast-parser';
import { parseMarksheetMarkdown } from '$lib/utils/marksheet-ast-parser';
import { marksheetSchema } from '$lib/schema/marksheet';
import { getDatabase, closeDatabase } from '$lib/server/db';
import type { MySQLDrizzleClient } from '$lib/server/db';
import {
	smSchools,
	smStudents,
	smClasses,
	smSections,
	smExamTypes,
	smAcademicYears,
	smSubjects,
	studentRecords
} from '$lib/server/db/sms-schema';

// ── Paths ────────────────────────────────────────────────────────────────────

const STRICT = resolve('storage/mock-data/strict');
const CONTEXT = resolve('storage/mock-data/context');
const OUT = resolve('storage/mock-data/generated');

// ── Fixture loading ──────────────────────────────────────────────────────────

interface ContextFixture {
	tenant: {
		schoolId: number;
		classId: number;
		sectionId: number;
		examTypeId: number;
		academicId: number;
		className: string;
		sectionName: string;
		academicYearTitle: string;
	};
	school: {
		name?: string;
		email?: string;
		phone?: string;
		city?: string;
		state?: string;
	};
	mapping: {
		subjects: { id: number; subjectCode: string }[];
	};
	roster: { id: number; name: string; admissionNo?: string | number }[];
	learningOutcomeFallback?: string;
}

interface Fixture {
	name: string;
	md: string;
	ctx: ContextFixture;
}

function loadFixtures(): Fixture[] {
	const files = [
		'adakole', 'CRECHE1', 'DC1', 'GRADEK1', 'LB1', 'MB1', 'NURSERY1'
	];
	return files.map((name) => {
		const md = readFileSync(resolve(STRICT, `${name}.md`), 'utf-8');
		const ctxPath = resolve(CONTEXT, `${name}.json`);
		const ctx = existsSync(ctxPath)
			? (JSON.parse(readFileSync(ctxPath, 'utf-8')) as ContextFixture)
			: ({} as ContextFixture);
		return { name, md, ctx };
	});
}

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Fuzzy-match exam type title from markdown against DB exam type titles. */
function matchExamType(
	examTypes: Array<{ id: number; title: string | null }>,
	markdownTitle: string
): { id: number } | undefined {
	if (!markdownTitle || examTypes.length === 0) return examTypes[0];
	// Extract the exam term part (after "— " or the first space-separated term)
	const termPart = markdownTitle.split(/—\s*/).pop() ?? markdownTitle;
	const normalized = termPart.replace(/EXAMINATION|EXAM/i, '').trim().toLowerCase();
	for (const et of examTypes) {
		const dbNorm = (et.title ?? '').toLowerCase();
		if (dbNorm.includes(normalized) || normalized.includes(dbNorm)) return et;
	}
	return examTypes[0];
}

/** Build a ParseContext for a fixture, resolving from DB where possible. */
async function buildContext(
	db: MySQLDrizzleClient,
	{ name, md, ctx }: Fixture,
	activeYear: { id: number; title: string | null },
	examType: { id: number }
): Promise<ParseContext> {
	const schoolId = ctx.tenant?.schoolId ?? 1;

	// ── School ───────────────────────────────────────────────────────────────
	const [school] = await db
		.select({
			schoolName: smSchools.schoolName,
			email: smSchools.email,
			phone: smSchools.phone
		})
		.from(smSchools)
		.where(eq(smSchools.id, schoolId))
		.limit(1);

	// ── Student (try real DB by name first, fall back to context roster) ─────
	const base = parseMarksheetMarkdown(md);
	const studentName = base.student.fullName.toUpperCase();

	const [dbStudent] = await db
		.select({
			id: smStudents.id,
			fullName: smStudents.fullName,
			admissionNo: smStudents.admissionNo
		})
		.from(smStudents)
		.where(eq(smStudents.fullName, studentName))
		.limit(1);

	const rosterEntry = dbStudent
		? { id: dbStudent.id, name: dbStudent.fullName ?? '', admissionNo: dbStudent.admissionNo ?? undefined }
		: ctx.roster?.[0] ?? { id: 0, name: studentName };

	// ── Student record (bridge to class/section per year) ────────────────────
	let classId = ctx.tenant?.classId ?? null;
	let sectionId = ctx.tenant?.sectionId ?? null;
	let className = ctx.tenant?.className ?? null;
	let sectionName = ctx.tenant?.sectionName ?? null;

	if (dbStudent) {
		const [sr] = await db
			.select({
				classId: studentRecords.classId,
				sectionId: studentRecords.sectionId
			})
			.from(studentRecords)
			.where(
				and(
					eq(studentRecords.studentId, dbStudent.id),
					eq(studentRecords.academicId, activeYear.id),
					eq(studentRecords.schoolId, schoolId)
				)
			)
			.limit(1);

		if (sr) {
			if (sr.classId != null) classId = sr.classId;
			if (sr.sectionId != null) sectionId = sr.sectionId;

			if (sr.classId != null) {
				const [cls] = await db
					.select({ className: smClasses.className })
					.from(smClasses)
					.where(eq(smClasses.id, sr.classId))
					.limit(1);
				if (cls) className = cls.className;
			}
			if (sr.sectionId != null) {
				const [sec] = await db
					.select({ sectionName: smSections.sectionName })
					.from(smSections)
					.where(eq(smSections.id, sr.sectionId))
					.limit(1);
				if (sec) sectionName = sec.sectionName;
			}
		}
	}

	// ── Subjects (try real DB by code, fall back to context mapping) ─────────
	const parsedCodes = base.subjects
		.map((s) => s.subjectCode?.toUpperCase())
		.filter(Boolean) as string[];

	const dbSubjects = parsedCodes.length
		? await db
				.select({ id: smSubjects.id, subjectCode: smSubjects.subjectCode })
				.from(smSubjects)
				.where(
					and(
						eq(smSubjects.schoolId, schoolId),
						inArray(smSubjects.subjectCode, parsedCodes)
					)
				)
		: [];

	const subjectMapping = dbSubjects.length > 0
		? dbSubjects
				.filter((s): s is { id: number; subjectCode: string } => s.id != null && s.subjectCode != null)
				.map((s) => ({ id: s.id, subjectCode: s.subjectCode }))
		: (ctx.mapping?.subjects ?? []);

	// ── Assemble ─────────────────────────────────────────────────────────────
	return {
		tenant: {
			schoolId,
			classId: classId ?? undefined,
			sectionId: sectionId ?? undefined,
			examTypeId: examType.id,
			academicId: activeYear.id,
			className: className ?? undefined,
			sectionName: sectionName ?? undefined,
			academicYearTitle: activeYear.title ?? undefined
		},
		school: {
			name: school?.schoolName ?? ctx.school?.name,
			email: school?.email ?? ctx.school?.email,
			phone: school?.phone ?? ctx.school?.phone
		},
		mapping: { subjects: subjectMapping },
		roster: [rosterEntry],
		learningOutcomeFallback: ctx.learningOutcomeFallback ?? 'Progressing'
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('marksheet context integration', () => {
	let db: MySQLDrizzleClient;
	const fixtures = loadFixtures();
	let activeYear: { id: number; title: string | null } | undefined;
	let examType: { id: number } | undefined;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error('DATABASE_URL not set — cannot run integration test');
		}
		db = await getDatabase();

		// Verify connectivity
		const [school] = await db
			.select({ id: smSchools.id, schoolName: smSchools.schoolName })
			.from(smSchools)
			.where(eq(smSchools.id, 1))
			.limit(1);
		expect(school).toBeDefined();
		console.log(`[db] connected — school: ${school?.schoolName ?? '?'}`);

		// Resolve active academic year
		const allYears = await db
			.select({ id: smAcademicYears.id, title: smAcademicYears.title, startingDate: smAcademicYears.startingDate, endingDate: smAcademicYears.endingDate })
			.from(smAcademicYears)
			.where(and(eq(smAcademicYears.schoolId, 1), eq(smAcademicYears.activeStatus, 1)));
		const today = todayISO();
		activeYear = allYears.find((y) => y.startingDate <= today && y.endingDate >= today) ?? allYears[0];
		if (!activeYear) throw new Error('No active academic year found in DB');
		console.log(`[db] active year: ${activeYear.title ?? activeYear.id} (id=${activeYear.id})`);

		// Resolve exam type
		const firstLine = fixtures[0].md.split('\n')[0] ?? '';
		const markdownTitle = firstLine.replace(/^#\s*/, '');
		const dbExamTypes = await db
			.select({ id: smExamTypes.id, title: smExamTypes.title })
			.from(smExamTypes)
			.where(
				and(
					eq(smExamTypes.schoolId, 1),
					eq(smExamTypes.activeStatus, 1)
				)
			);
		examType = matchExamType(dbExamTypes, markdownTitle);
		if (!examType) throw new Error('No active exam type found');
		console.log(`[db] exam type: ${dbExamTypes.find((et) => et.id === examType!.id)?.title ?? examType.id} (id=${examType.id})`);
	});

	afterAll(async () => {
		await closeDatabase();
	});

	for (const fixture of fixtures) {
		test(`${fixture.name} — parse, resolve context, Zod-validate, save`, async () => {
			const context = await buildContext(db, fixture, activeYear!, examType!);
			const result = parseMarksheetMarkdown(fixture.md, context);
			const validated = await marksheetSchema.parseAsync(result);

			mkdirSync(OUT, { recursive: true });
			writeFileSync(
				resolve(OUT, `${fixture.name}.json`),
				JSON.stringify(validated, null, 2) + '\n'
			);

			expect(validated.school.id).toBeGreaterThan(0);
			expect(validated.student.id).toBeGreaterThan(0);
			expect(validated.records.length).toBeGreaterThan(0);
		});
	}
});
