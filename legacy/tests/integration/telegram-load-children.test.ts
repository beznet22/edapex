import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  smAcademicYears,
  smClasses,
  smParents,
  smSchools,
  smSections,
  smStudents,
  studentRecords,
} from "$lib/server/db/sms-schema";
import { loadChildCandidates, loadCurrentAcademicId } from "$lib/server/telegram/pdf/load-children";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIf = HAS_DB ? describe : describe.skip;

const TEST_SCHOOL = 91001;
const TEST_PARENT = 91001;
const TEST_ACADEMIC = 91001;
const TEST_CLASS = 91001;
const TEST_SECTION = 91001;
const TEST_STUDENT_ACTIVE = 91001;
const TEST_STUDENT_GRADUATE = 91002;
const TEST_STUDENT_NORECORD = 91003;
const TEST_PARENT_OTHER = 91002;
const TEST_STUDENT_OTHER_KID = 91004;

async function seedFixtures(): Promise<void> {
  const db = await getDatabase();
  // Idempotent cleanup of any stale fixture rows.
  await db.delete(studentRecords).where(eq(studentRecords.schoolId, TEST_SCHOOL));
  await db.delete(smStudents).where(eq(smStudents.schoolId, TEST_SCHOOL));
  await db.delete(smSections).where(eq(smSections.id, TEST_SECTION));
  await db.delete(smClasses).where(eq(smClasses.id, TEST_CLASS));
  await db.delete(smAcademicYears).where(eq(smAcademicYears.id, TEST_ACADEMIC));
  await db.delete(smParents).where(eq(smParents.id, TEST_PARENT));
  await db.delete(smParents).where(eq(smParents.id, TEST_PARENT_OTHER));
  await db.delete(smSchools).where(eq(smSchools.id, TEST_SCHOOL));

  await db.insert(smSchools).values({ id: TEST_SCHOOL, schoolName: "Telegram Test School" });
  await db.insert(smAcademicYears).values({
    id: TEST_ACADEMIC,
    year: "2099-2099",
    title: "AY 2099",
    startingDate: "2099-01-01",
    endingDate: "2099-12-31",
    schoolId: TEST_SCHOOL,
  });
  await db.insert(smClasses).values({
    id: TEST_CLASS,
    className: "TestClass",
    schoolId: TEST_SCHOOL,
  });
  await db.insert(smSections).values({
    id: TEST_SECTION,
    sectionName: "TestSection",
    schoolId: TEST_SCHOOL,
  });
  await db.insert(smParents).values({
    id: TEST_PARENT,
    userId: 90001,
    schoolId: TEST_SCHOOL,
  });
  await db.insert(smParents).values({
    id: TEST_PARENT_OTHER,
    userId: 90002,
    schoolId: TEST_SCHOOL,
  });
  await db.insert(smStudents).values([
    {
      id: TEST_STUDENT_ACTIVE,
      parentId: TEST_PARENT,
      fullName: "Active Child",
      admissionNo: 9001,
      schoolId: TEST_SCHOOL,
      activeStatus: 1,
    },
    {
      id: TEST_STUDENT_GRADUATE,
      parentId: TEST_PARENT,
      fullName: "Graduate Child",
      admissionNo: 9002,
      schoolId: TEST_SCHOOL,
      activeStatus: 1,
    },
    {
      id: TEST_STUDENT_NORECORD,
      parentId: TEST_PARENT,
      fullName: "No Record Child",
      admissionNo: 9003,
      schoolId: TEST_SCHOOL,
      activeStatus: 1,
    },
    {
      id: TEST_STUDENT_OTHER_KID,
      parentId: TEST_PARENT_OTHER,
      fullName: "Other Parent Kid",
      admissionNo: 9004,
      schoolId: TEST_SCHOOL,
      activeStatus: 1,
    },
  ]);
  await db.insert(studentRecords).values([
    {
      studentId: TEST_STUDENT_ACTIVE,
      classId: TEST_CLASS,
      sectionId: TEST_SECTION,
      schoolId: TEST_SCHOOL,
      academicId: TEST_ACADEMIC,
      activeStatus: 1,
      isDefault: 1,
      isGraduate: 0,
    },
    {
      // Graduate: present in records, but isGraduate=1.
      studentId: TEST_STUDENT_GRADUATE,
      classId: TEST_CLASS,
      sectionId: TEST_SECTION,
      schoolId: TEST_SCHOOL,
      academicId: TEST_ACADEMIC,
      activeStatus: 1,
      isDefault: 1,
      isGraduate: 1,
    },
    {
      studentId: TEST_STUDENT_OTHER_KID,
      classId: TEST_CLASS,
      sectionId: TEST_SECTION,
      schoolId: TEST_SCHOOL,
      academicId: TEST_ACADEMIC,
      activeStatus: 1,
      isDefault: 1,
      isGraduate: 0,
    },
  ]);
  // TEST_STUDENT_NORECORD intentionally has no student_records row.
}

async function cleanupFixtures(): Promise<void> {
  const db = await getDatabase();
  await db.delete(studentRecords).where(eq(studentRecords.schoolId, TEST_SCHOOL));
  await db.delete(smStudents).where(eq(smStudents.schoolId, TEST_SCHOOL));
  await db.delete(smSections).where(eq(smSections.id, TEST_SECTION));
  await db.delete(smClasses).where(eq(smClasses.id, TEST_CLASS));
  await db.delete(smAcademicYears).where(eq(smAcademicYears.id, TEST_ACADEMIC));
  await db.delete(smParents).where(eq(smParents.id, TEST_PARENT));
  await db.delete(smParents).where(eq(smParents.id, TEST_PARENT_OTHER));
  await db.delete(smSchools).where(eq(smSchools.id, TEST_SCHOOL));
}

describeIf("load-children", () => {
  beforeEach(async () => {
    await seedFixtures();
  });
  afterEach(async () => {
    await cleanupFixtures();
  });

  it("loadCurrentAcademicId returns the most recent year for the school", async () => {
    const id = await loadCurrentAcademicId(TEST_SCHOOL);
    expect(id).toBe(TEST_ACADEMIC);
  });

  it("loadChildCandidates returns only active, non-graduate, currently-rostered children", async () => {
    const out = await loadChildCandidates(TEST_PARENT, TEST_ACADEMIC, TEST_SCHOOL);
    expect(out).toHaveLength(1);
    expect(out[0]?.studentId).toBe(TEST_STUDENT_ACTIVE);
    expect(out[0]?.fullName).toBe("Active Child");
  });

  it("filters out graduates (isGraduate=1)", async () => {
    const out = await loadChildCandidates(TEST_PARENT, TEST_ACADEMIC, TEST_SCHOOL);
    const ids = out.map((c) => c.studentId);
    expect(ids).not.toContain(TEST_STUDENT_GRADUATE);
  });

  it("filters out students without a current student_records row", async () => {
    const out = await loadChildCandidates(TEST_PARENT, TEST_ACADEMIC, TEST_SCHOOL);
    const ids = out.map((c) => c.studentId);
    expect(ids).not.toContain(TEST_STUDENT_NORECORD);
  });

  it("does not leak other parents' children", async () => {
    const out = await loadChildCandidates(TEST_PARENT, TEST_ACADEMIC, TEST_SCHOOL);
    const ids = out.map((c) => c.studentId);
    expect(ids).not.toContain(TEST_STUDENT_OTHER_KID);
  });

  it("returns an empty array when the parent has no rostered children", async () => {
    const out = await loadChildCandidates(TEST_PARENT_OTHER + 99, TEST_ACADEMIC, TEST_SCHOOL);
    expect(out).toEqual([]);
  });

  it("returns an empty array when the parent has children but none are rostered", async () => {
    // Re-seed: TEST_STUDENT_NORECORD belongs to TEST_PARENT but has no
    // student_records row. Move TEST_STUDENT_ACTIVE's record to the
    // other parent so TEST_PARENT has zero rostered children.
    const db = await getDatabase();
    await db
      .update(studentRecords)
      .set({ studentId: TEST_STUDENT_OTHER_KID })
      .where(and(eq(studentRecords.studentId, TEST_STUDENT_ACTIVE), eq(studentRecords.schoolId, TEST_SCHOOL)));
    const out = await loadChildCandidates(TEST_PARENT, TEST_ACADEMIC, TEST_SCHOOL);
    expect(out).toEqual([]);
  });

  it("falls back to the most recent academic year when academicId is null", async () => {
    const out = await loadChildCandidates(TEST_PARENT, null, TEST_SCHOOL);
    expect(out).toHaveLength(1);
    expect(out[0]?.studentId).toBe(TEST_STUDENT_ACTIVE);
  });
});
