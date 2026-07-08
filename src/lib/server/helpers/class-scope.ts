/**
 * Resolves the active (classId, sectionId) tuple for a request using the
 * same precedence as the chat layout:
 *
 *   1. Explicit `?className=&sectionName=` query params
 *   2. The persisted `selected-class` cookie (set by `class-selector.svelte`)
 *   3. The staff member's `sm_class_teachers` assignment
 *
 * The filestore page and file API both call this so the per-tenant
 * workspace is rooted at the same class directory regardless of which
 * entry point the user came from.
 */
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
	smClasses,
	smSections,
	smClassSections,
	smClassTeachers,
	smAssignClassTeachers,
	smAcademicYears,
} from "$lib/server/db/sms-schema";
import type { ClassSection } from "$lib/types/result-types";

export type ClassScope = {
	classId: number;
	sectionId: number;
	academicId: number;
};

/**
 * Resolves the display names + academic-year title for a known
 * (classId, sectionId, academicId) tuple. Used by the file API's tenant
 * resolution to populate the `className`, `sectionName`, and
 * `academicYearTitle` fields on TenantContext so `classDir` produces the
 * correct human-readable workspace path (e.g. `AY4-2025/2026/12-c_5-a`)
 * rather than the ID-only fallback (`AY4-4/12-12_5-5`).
 */
export async function resolveClassNamesByIds({
	schoolId,
	classId,
	sectionId,
	academicId,
}: {
	schoolId: number;
	classId: number;
	sectionId: number;
	academicId: number;
}): Promise<{ className: string | null; sectionName: string | null; academicYearTitle: string | null }> {
	const db = await getDatabase();
	const [cls] = await db
		.select({ className: smClasses.className })
		.from(smClasses)
		.where(and(eq(smClasses.schoolId, schoolId), eq(smClasses.id, classId)))
		.limit(1);
	const [sec] = await db
		.select({ sectionName: smSections.sectionName })
		.from(smSections)
		.where(and(eq(smSections.schoolId, schoolId), eq(smSections.id, sectionId)))
		.limit(1);
	const [yr] = await db
		.select({ title: smAcademicYears.title })
		.from(smAcademicYears)
		.where(and(eq(smAcademicYears.schoolId, schoolId), eq(smAcademicYears.id, academicId)))
		.limit(1);
	return {
		className: cls?.className ?? null,
		sectionName: sec?.sectionName ?? null,
		academicYearTitle: yr?.title ?? null,
	};
}

export async function resolveActiveClassScope({
	schoolId,
	staffId,
	className,
	sectionName,
	selectedClassCookie,
}: {
	schoolId: number;
	staffId?: number;
	className?: string | null;
	sectionName?: string | null;
	selectedClassCookie?: string | null;
}): Promise<ClassScope | null> {
	const academicId = await resolveActiveAcademicId(schoolId);
	if (academicId === null) return null;

	if (className && sectionName) {
		const named = await resolveClassIdByName(schoolId, className, sectionName);
		if (named) return { ...named, academicId };
	}
	if (selectedClassCookie) {
		try {
			const parsed = JSON.parse(selectedClassCookie) as ClassSection;
			if (parsed.classId && parsed.sectionId) {
				return {
					classId: parsed.classId,
					sectionId: parsed.sectionId,
					academicId,
				};
			}
		} catch {
			// ignore malformed cookie
		}
	}
	if (staffId) {
		const assigned = await resolveAssignedClass(schoolId, staffId);
		if (assigned) return { ...assigned, academicId };
	}
	return null;
}

async function resolveActiveAcademicId(schoolId: number): Promise<number | null> {
	const db = await getDatabase();
	const allYears = await db
		.select({
			id: smAcademicYears.id,
			activeStatus: smAcademicYears.activeStatus,
			startingDate: smAcademicYears.startingDate,
			endingDate: smAcademicYears.endingDate,
		})
		.from(smAcademicYears)
		.where(eq(smAcademicYears.schoolId, schoolId))
		.orderBy(smAcademicYears.id);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const inRange = allYears.find((y) => {
		if (!y.startingDate || !y.endingDate) return false;
		const s = new Date(y.startingDate);
		const e = new Date(y.endingDate);
		s.setHours(0, 0, 0, 0);
		e.setHours(23, 59, 59, 999);
		return today >= s && today <= e;
	});
	if (inRange) return inRange.id;
	const active = allYears.find((y) => y.activeStatus === 1);
	return active?.id ?? null;
}

async function resolveClassIdByName(
	schoolId: number,
	className: string,
	sectionName: string,
): Promise<{ classId: number; sectionId: number } | null> {
	const db = await getDatabase();
	const cls = await db
		.select({ id: smClasses.id })
		.from(smClasses)
		.where(and(eq(smClasses.schoolId, schoolId), eq(smClasses.className, className)))
		.limit(1);
	if (cls.length === 0) return null;
	const sec = await db
		.select({ id: smSections.id })
		.from(smSections)
		.where(
			and(eq(smSections.schoolId, schoolId), eq(smSections.sectionName, sectionName)),
		)
		.limit(1);
	if (sec.length === 0) return null;
	const link = await db
		.select({
			classId: smClassSections.classId,
			sectionId: smClassSections.sectionId,
		})
		.from(smClassSections)
		.where(
			and(
				eq(smClassSections.schoolId, schoolId),
				eq(smClassSections.classId, cls[0].id),
				eq(smClassSections.sectionId, sec[0].id),
			),
		)
		.limit(1);
	if (link.length === 0) return null;
	return { classId: link[0].classId!, sectionId: link[0].sectionId! };
}

async function resolveAssignedClass(
	schoolId: number,
	staffId: number,
): Promise<{ classId: number; sectionId: number } | null> {
	const db = await getDatabase();
	const rows = await db
		.select({
			classId: smAssignClassTeachers.classId,
			sectionId: smAssignClassTeachers.sectionId,
		})
		.from(smClassTeachers)
		.innerJoin(
			smAssignClassTeachers,
			eq(smAssignClassTeachers.id, smClassTeachers.assignClassTeacherId),
		)
		.where(
			and(
				eq(smClassTeachers.teacherId, staffId),
				eq(smClassTeachers.activeStatus, 1),
				eq(smAssignClassTeachers.schoolId, schoolId),
				eq(smAssignClassTeachers.activeStatus, 1),
			),
		)
		.limit(1);
	if (rows.length === 0) return null;
	return { classId: rows[0].classId!, sectionId: rows[0].sectionId! };
}
