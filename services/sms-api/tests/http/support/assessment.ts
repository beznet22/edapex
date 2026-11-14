import { env } from "cloudflare:workers";

import type { Marksheet } from "../../../src/lib/schema/marksheet";
import { smAssignSubjects } from "../../../src/lib/server/db/schema";
import {
  AssessmentEntryService,
  AssessmentQueryService
} from "../../../src/lib/server/services/assessment";
import {
  createService,
  createServiceContext
} from "../../../src/lib/server/services/context";
import { database, tenantOf } from "../../support/seed";
import type { SeededSchool } from "../../support/seed";

export const seedAssessmentResult = async (
  school: SeededSchool
): Promise<Marksheet> => {
  const db = database(env);
  await db.insert(smAssignSubjects).values({
    classId: school.classId,
    sectionId: school.sectionId,
    subjectId: school.subjectId,
    teacherId: school.staffId,
    schoolId: school.schoolId,
    academicId: school.academicId,
    activeStatus: 1
  });

  const ctx = createServiceContext({ DB: env.DB }, tenantOf(school));
  const entry = createService(AssessmentEntryService, ctx);
  await entry.upsertStudentResult(
    {
      studentData: {
        studentId: school.studentId,
        classId: school.classId,
        sectionId: school.sectionId,
        recordId: school.recordId,
        examTypeId: school.termId,
        studentCategory: "NURSERY"
      },
      marksData: [
        {
          subjectId: school.subjectId,
          marks: { CA: 10, EXAM: 50 }
        }
      ]
    },
    school.staffId
  );

  const query = createService(AssessmentQueryService, ctx);
  const marksheet = await query.getStudentResult({
    id: school.studentId,
    examId: school.termId
  });
  if (marksheet === null) {
    throw new Error("assessment fixture did not produce a marksheet");
  }
  return marksheet;
};
