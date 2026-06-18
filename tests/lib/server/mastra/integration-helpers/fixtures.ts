import {
	smAcademicYears,
	smClasses,
	smClassSections,
	smExamTypes,
	smParents,
	smSchools,
	smSections,
	smStaffs,
	smStudents,
	studentRecords,
	users,
} from "$lib/server/db/sms-schema";
import type {
	AcademicYearInsert,
	ClassInsert,
	ClassSectionInsert,
	ExamTypeInsert,
	ParentInsert,
	SectionInsert,
	SandboxedRow,
	SchoolInsert,
	StaffInsert,
	StudentInsert,
	StudentRecordInsert,
	UserInsert,
} from "./types";

export function buildSchoolFixture(
	overrides?: Partial<SandboxedRow<SchoolInsert>>,
): SandboxedRow<SchoolInsert> {
	return {
		schoolName: "Test School",
		...overrides,
	};
}

export function buildAcademicYearFixture(
	schoolId: number,
	overrides?: Partial<SandboxedRow<AcademicYearInsert>>,
): SandboxedRow<AcademicYearInsert> {
	return {
		year: "2026",
		title: "2026-2027",
		startingDate: "2026-04-01",
		endingDate: "2027-03-31",
		schoolId,
		...overrides,
	};
}

export function buildExamTypeFixture(
	schoolId: number,
	academicId: number,
	overrides?: Partial<SandboxedRow<ExamTypeInsert>>,
): SandboxedRow<ExamTypeInsert> {
	return {
		title: "Mid-Term",
		averageMark: 100,
		schoolId,
		academicId,
		...overrides,
	};
}

export function buildClassFixture(
	schoolId: number,
	overrides?: Partial<SandboxedRow<ClassInsert>>,
): SandboxedRow<ClassInsert> {
	return {
		className: "Grade 1",
		schoolId,
		...overrides,
	};
}

export function buildSectionFixture(
	schoolId: number,
	overrides?: Partial<SandboxedRow<SectionInsert>>,
): SandboxedRow<SectionInsert> {
	return {
		sectionName: "Section A",
		schoolId,
		...overrides,
	};
}

export function buildClassSectionFixture(
	schoolId: number,
	classId: number,
	sectionId: number,
	academicId: number,
	overrides?: Partial<SandboxedRow<ClassSectionInsert>>,
): SandboxedRow<ClassSectionInsert> {
	return {
		classId,
		sectionId,
		schoolId,
		academicId,
		...overrides,
	};
}

export function buildUserFixture(
	overrides?: Partial<SandboxedRow<UserInsert>>,
): SandboxedRow<UserInsert> {
	return {
		fullName: "Test User",
		username: "test.user",
		email: "test.user@example.com",
		walletBalance: 0,
		...overrides,
	};
}

export function buildStaffFixture(
	schoolId: number,
	userId: number,
	overrides?: Partial<SandboxedRow<StaffInsert>>,
): SandboxedRow<StaffInsert> {
	return {
		firstName: "Test",
		lastName: "Staff",
		fullName: "Test Staff",
		email: "staff@example.com",
		schoolId,
		userId,
		...overrides,
	};
}

export function buildStudentFixture(
	schoolId: number,
	classId: number,
	sectionId: number,
	userId: number,
	academicId: number,
	overrides?: Partial<SandboxedRow<StudentInsert>>,
): SandboxedRow<StudentInsert> {
	return {
		firstName: "Test",
		lastName: "Student",
		fullName: "Test Student",
		email: "student@example.com",
		schoolId,
		classId,
		sectionId,
		userId,
		academicId,
		...overrides,
	};
}

export function buildStudentRecordFixture(
	schoolId: number,
	studentId: number,
	classId: number,
	sectionId: number,
	academicId: number,
	overrides?: Partial<SandboxedRow<StudentRecordInsert>>,
): SandboxedRow<StudentRecordInsert> {
	return {
		schoolId,
		studentId,
		classId,
		sectionId,
		academicId,
		...overrides,
	};
}

export function buildParentFixture(
	overrides?: Partial<SandboxedRow<ParentInsert>>,
): SandboxedRow<ParentInsert> {
	return {
		fathersName: "Test Father",
		guardiansName: "Test Guardian",
		guardiansMobile: "555-0100",
		isGuardian: 1,
		...overrides,
	};
}