import type { smStudents, smStudentPromotions, studentRecords } from "../../../db/schema";

export type StudentRow = typeof smStudents.$inferSelect;
export type NewStudent = typeof smStudents.$inferInsert;
export type StudentRecordRow = typeof studentRecords.$inferSelect;
export type NewStudentRecord = typeof studentRecords.$inferInsert;

/** Columns a student profile update may touch. */
export type StudentPatch = Partial<
  Pick<
    NewStudent,
    | "fullName"
    | "firstName"
    | "lastName"
    | "dateOfBirth"
    | "genderId"
    | "studentCategoryId"
    | "classId"
    | "sectionId"
    | "rollNo"
    | "email"
    | "mobile"
  >
>;

export interface CreateStudentInput {
  readonly admissionNo: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName?: string;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly dateOfBirth: string | null;
  readonly classId: number;
  readonly sectionId: number;
  readonly genderId: number;
  readonly studentCategoryId: number;
  readonly userId: number;
  readonly parentId: number | null;
  readonly roleId?: number;
}

export interface CreatedStudent {
  readonly student: StudentRow;
  readonly recordId: number;
}

export interface StudentStatusResult {
  readonly success: boolean;
  readonly studentId: number;
  readonly fullName: string | null;
  readonly active: boolean;
}

export interface StudentDeleteResult {
  readonly success: boolean;
  readonly studentId: number;
  readonly fullName: string | null;
}

export interface StudentSearchRow {
  readonly id: number;
  readonly name: string | null;
  readonly admissionNo: number | null;
}

export type PromotionRow = typeof smStudentPromotions.$inferSelect;

export interface DemoteParams {
  readonly studentId: number;
  readonly promotionId: number;
  readonly currentClassId: number;
  readonly currentSectionId: number;
  readonly currentAcademicId: number;
  readonly previousClassId: number;
  readonly previousSectionId: number;
  readonly previousAcademicId: number;
  readonly previousRollNumber: number | null;
}

export interface DemoteResult {
  readonly success: boolean;
  readonly studentId: number;
  readonly previousClassId: number;
  readonly previousSectionId: number;
  readonly previousAcademicId: number;
}

export interface PromoteParams {
  readonly studentId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly targetAcademicId?: number;
  readonly rollNo?: number;
  readonly resultStatus?: string;
}

export interface PromoteResult {
  readonly success: boolean;
  readonly studentId: number;
  readonly promotionId: number;
  readonly recordId: number;
  readonly rollNo: number | null;
}
