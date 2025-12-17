// /src/lib/server/repository/student.repo.ts

import { and, eq } from "drizzle-orm";
import {
  smAssignSubjects,
  smBaseSetups,
  smClasses,
  smDesignations,
  smHumanDepartments,
  smParents,
  smSections,
  smStaffs,
  smStudentCategories,
  smStudents,
  studentRecords,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

export type ParentRow = typeof smParents.$inferSelect;

export class ParentRepository extends BaseRepository {

}

// ✅ Singleton export — the only one you need
export const parentRepo = await ParentRepository.build();
