import { describe, expect, it } from "vitest";
import { assertWritableKey, canScanStudent } from "$lib/server/people/scan/scan-access";

const allowed = [
  { classId: 5, sectionId: 12 },
  { classId: 6, sectionId: 13 },
];

const student = { schoolId: 1, classId: 5, sectionId: 12 };

describe("canScanStudent", () => {
  it("allows a manager regardless of class", () => {
    expect(
      canScanStudent({
        isManager: true,
        student: { schoolId: 1, classId: 99, sectionId: 99 },
        schoolId: 1,
        allowedClassSections: [],
      })
    ).toEqual({ ok: true });
  });

  it("allows a teacher assigned to the student's class/section", () => {
    expect(canScanStudent({ isManager: false, student, schoolId: 1, allowedClassSections: allowed }))
      .toEqual({ ok: true });
  });

  it("denies a teacher outside the class", () => {
    expect(
      canScanStudent({
        isManager: false,
        student: { schoolId: 1, classId: 7, sectionId: 14 },
        schoolId: 1,
        allowedClassSections: allowed,
      })
    ).toEqual({ ok: false, reason: "out-of-class" });
  });

  it("denies when class matches but section does not", () => {
    expect(
      canScanStudent({
        isManager: false,
        student: { schoolId: 1, classId: 5, sectionId: 13 },
        schoolId: 1,
        allowedClassSections: allowed,
      })
    ).toEqual({ ok: false, reason: "out-of-class" });
  });

  it("denies a student in another school even for a manager", () => {
    expect(
      canScanStudent({
        isManager: true,
        student: { schoolId: 2, classId: 5, sectionId: 12 },
        schoolId: 1,
        allowedClassSections: allowed,
      })
    ).toEqual({ ok: false, reason: "out-of-school" });
  });

  it("denies a missing student", () => {
    expect(
      canScanStudent({ isManager: true, student: null, schoolId: 1, allowedClassSections: allowed })
    ).toEqual({ ok: false, reason: "out-of-school" });
  });

  it("denies a teacher when the student has no roster row for the year", () => {
    expect(
      canScanStudent({
        isManager: false,
        student: { schoolId: 1, classId: null, sectionId: null },
        schoolId: 1,
        allowedClassSections: allowed,
      })
    ).toEqual({ ok: false, reason: "out-of-class" });
  });

  it("denies a teacher with no assignments at all", () => {
    expect(
      canScanStudent({ isManager: false, student, schoolId: 1, allowedClassSections: [] })
    ).toEqual({ ok: false, reason: "out-of-class" });
  });

  it("treats a null student school as same-school rather than cross-tenant", () => {
    expect(
      canScanStudent({
        isManager: false,
        student: { schoolId: null, classId: 5, sectionId: 12 },
        schoolId: 1,
        allowedClassSections: allowed,
      })
    ).toEqual({ ok: true });
  });
});

describe("assertWritableKey", () => {
  it("returns the tuple when complete", () => {
    expect(assertWritableKey({ studentId: 1, examTypeId: 2, academicId: 3 })).toEqual({
      studentId: 1,
      examTypeId: 2,
      academicId: 3,
    });
  });

  it("refuses a null student — the unique key would not be enforced", () => {
    expect(() => assertWritableKey({ studentId: null, examTypeId: 2, academicId: 3 })).toThrow(
      /without student, exam and academic ids/
    );
  });

  it("refuses a null exam type", () => {
    expect(() => assertWritableKey({ studentId: 1, examTypeId: null, academicId: 3 })).toThrow();
  });

  it("refuses a null academic year", () => {
    expect(() => assertWritableKey({ studentId: 1, examTypeId: 2, academicId: null })).toThrow();
  });
});
