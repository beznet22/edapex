import { describe, expect, it } from "vitest";
import {
  buildSelectedClassCookieValue,
  classifyOffering,
  formatPercent,
  initials,
  isLinked,
  isNonGmail,
  isSelfAssignEnabled,
  mapConflictRows,
  needsReplacement,
  pagerWindow,
  validateParentContact,
  validateStaffInput,
} from "$lib/server/people/people-format";
import type { StaffInput } from "$lib/server/people/people-format";

const validStaff: StaffInput = {
  firstName: " Ada ",
  lastName: "Lovelace",
  email: "ADA@School.ng",
  mobile: "08012345678",
  designationId: 2,
  departmentId: 3,
  roleId: 4,
  genderId: 1,
};

describe("linked rule", () => {
  it("treats null, 1 and a missing user as unlinked", () => {
    expect(isLinked(null, true)).toBe(false);
    expect(isLinked(1, true)).toBe(false);
    expect(isLinked(2, false)).toBe(false);
  });

  it("links user ids above 1 with a matching users row", () => {
    expect(isLinked(2, true)).toBe(true);
    expect(isLinked(9, true)).toBe(true);
  });
});

describe("initials", () => {
  it("uses the first and last token", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  grace   brewster  hopper ")).toBe("GH");
  });

  it("falls back to a single letter or a question mark", () => {
    expect(initials("Ada")).toBe("A");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("email badges", () => {
  it("flags non-Gmail addresses only when present", () => {
    expect(isNonGmail("ada@gmail.com")).toBe(false);
    expect(isNonGmail("ADA@GMAIL.COM")).toBe(false);
    expect(isNonGmail("ada@school.ng")).toBe(true);
    expect(isNonGmail(null)).toBe(false);
    expect(isNonGmail("")).toBe(false);
    expect(isNonGmail("   ")).toBe(false);
  });
});

describe("formatPercent", () => {
  it("rounds a real ratio and guards zero totals", () => {
    expect(formatPercent(1, 3)).toBe(33);
    expect(formatPercent(2, 2)).toBe(100);
    expect(formatPercent(0, 0)).toBe(0);
    expect(formatPercent(5, 0)).toBe(0);
  });
});

describe("pagerWindow", () => {
  it("renders a single page", () => {
    expect(pagerWindow(1, 1)).toEqual([1]);
  });

  it("keeps first, current neighbourhood and last with gaps", () => {
    expect(pagerWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pagerWindow(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(pagerWindow(10, 10)).toEqual([1, "gap", 9, 10]);
  });

  it("clamps out-of-range input and handles no pages", () => {
    expect(pagerWindow(0, 3)).toEqual([1, 2, 3]);
    expect(pagerWindow(99, 3)).toEqual([1, 2, 3]);
    expect(pagerWindow(1, 0)).toEqual([]);
  });
});

describe("staff validation", () => {
  it("normalizes a complete input", () => {
    const result = validateStaffInput(validStaff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstName).toBe("Ada");
      expect(result.value.email).toBe("ada@school.ng");
    }
  });

  it("rejects missing names and email", () => {
    expect(validateStaffInput({ ...validStaff, firstName: " " })).toEqual({
      ok: false,
      error: "First name is required",
    });
    expect(validateStaffInput({ ...validStaff, lastName: "" })).toEqual({
      ok: false,
      error: "Last name is required",
    });
    expect(validateStaffInput({ ...validStaff, email: "" })).toEqual({
      ok: false,
      error: "Email is required",
    });
  });

  it("rejects invalid, oversized emails and bad ids", () => {
    expect(validateStaffInput({ ...validStaff, email: "ada@school" }).ok).toBe(false);
    expect(
      validateStaffInput({ ...validStaff, email: `${"a".repeat(45)}@school.ng` }).ok
    ).toBe(false);
    expect(validateStaffInput({ ...validStaff, designationId: 0 }).ok).toBe(false);
    expect(validateStaffInput({ ...validStaff, genderId: -1 }).ok).toBe(false);
  });
});

describe("parent contact validation", () => {
  it("clears empty values to null", () => {
    expect(
      validateParentContact({ guardianEmail: "  ", guardianMobile: "" })
    ).toEqual({ ok: true, value: { guardianEmail: null, guardianMobile: null } });
  });

  it("keeps valid values", () => {
    const result = validateParentContact({
      guardianEmail: "parent@school.ng",
      guardianMobile: "0803 000 0000",
    });
    expect(result).toEqual({
      ok: true,
      value: { guardianEmail: "parent@school.ng", guardianMobile: "0803 000 0000" },
    });
  });

  it("rejects invalid or oversized contact values", () => {
    expect(validateParentContact({ guardianEmail: "not-an-email", guardianMobile: "" }).ok).toBe(
      false
    );
    expect(
      validateParentContact({ guardianEmail: "", guardianMobile: "1".repeat(201) }).ok
    ).toBe(false);
    expect(
      validateParentContact({ guardianEmail: `${"a".repeat(195)}@school.ng`, guardianMobile: "" })
        .ok
    ).toBe(false);
  });
});

describe("assignment helpers", () => {
  it("maps auto_approve to a boolean", () => {
    expect(isSelfAssignEnabled(1)).toBe(true);
    expect(isSelfAssignEnabled(0)).toBe(false);
    expect(isSelfAssignEnabled(null)).toBe(false);
  });

  it("classifies an existing offering row", () => {
    expect(classifyOffering(null)).toBe("create");
    expect(classifyOffering({ activeStatus: 0 })).toBe("reactivate");
    expect(classifyOffering({ activeStatus: 1 })).toBe("skip");
  });

  it("detects when replacing a different teacher is required", () => {
    expect(needsReplacement(null, 5)).toBe(false);
    expect(needsReplacement(5, 5)).toBe(false);
    expect(needsReplacement(4, 5)).toBe(true);
  });

  it("maps grouped conflict rows and skips incomplete tuples", () => {
    expect(
      mapConflictRows([
        { classId: 1, sectionId: 2, subjectId: 3, activeTeachers: 2, teacherIds: "5,6" },
        { classId: null, sectionId: 2, subjectId: 3, activeTeachers: 2, teacherIds: "7,8" },
        { classId: 1, sectionId: 2, subjectId: 4, activeTeachers: 2, teacherIds: "" },
      ])
    ).toEqual([
      { classId: 1, sectionId: 2, subjectId: 3, activeTeachers: 2, teacherIds: [5, 6] },
      { classId: 1, sectionId: 2, subjectId: 4, activeTeachers: 2, teacherIds: [] },
    ]);
  });

  it("builds the selected-class cookie payload", () => {
    const value = buildSelectedClassCookieValue(
      { classId: 7, sectionId: 9, className: "JSS 2", sectionName: "B" },
      4
    );
    expect(JSON.parse(value)).toEqual({
      classId: 7,
      sectionId: 9,
      academicId: 4,
      className: "JSS 2",
      sectionName: "B",
    });
  });
});
