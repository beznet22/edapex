import type {
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

export type SchoolInsert = typeof smSchools.$inferInsert;
export type AcademicYearInsert = typeof smAcademicYears.$inferInsert;
export type ExamTypeInsert = typeof smExamTypes.$inferInsert;
export type ClassInsert = typeof smClasses.$inferInsert;
export type SectionInsert = typeof smSections.$inferInsert;
export type ClassSectionInsert = typeof smClassSections.$inferInsert;
export type UserInsert = typeof users.$inferInsert;
export type StaffInsert = typeof smStaffs.$inferInsert;
export type StudentInsert = typeof smStudents.$inferInsert;
export type StudentRecordInsert = typeof studentRecords.$inferInsert;
export type ParentInsert = typeof smParents.$inferInsert;

export interface TenantFixtureIds {
	schoolId: number;
	academicId: number;
	examTypeId: number;
	classId: number;
	sectionId: number;
	classSectionId: number;
	userId: number;
	staffId: number;
	studentId: number;
	studentRecordId: number;
	parentId: number;
}

export type SandboxedRow<T> = Omit<T, "id">;