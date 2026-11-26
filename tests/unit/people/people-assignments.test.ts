import { describe, expect, it } from "vitest";
import {
  buildSelectedClassCookieValue,
  classifyOffering,
  isSelfAssignEnabled,
  mapConflictRows,
  needsReplacement,
} from "$lib/server/people/people-format";
import { canSelfAssign } from "$lib/server/people/people-access";
import { parseIdList } from "$lib/server/people/people-params";

describe("offering classification (create / reactivate / skip)", () => {
  it("creates when no row exists", () => {
    expect(classifyOffering(null)).toBe("create");
    expect(classifyOffering(undefined)).toBe("create");
  });

  it("reactivates inactive rows and skips active ones", () => {
    expect(classifyOffering({ activeStatus: 0 })).toBe("reactivate");
    expect(classifyOffering({ activeStatus: 1 })).toBe("skip");
  });
});

describe("teacher replacement rule", () => {
  it("requires confirmation only for a different existing teacher", () => {
    expect(needsReplacement(null, 3)).toBe(false);
    expect(needsReplacement(3, 3)).toBe(false);
    expect(needsReplacement(2, 3)).toBe(true);
  });
});

describe("conflict mapping", () => {
  it("parses grouped teacher ids", () => {
    expect(
      mapConflictRows([
        { classId: 4, sectionId: 5, subjectId: 6, activeTeachers: 3, teacherIds: "11,12,13" },
      ])
    ).toEqual([
      { classId: 4, sectionId: 5, subjectId: 6, activeTeachers: 3, teacherIds: [11, 12, 13] },
    ]);
  });

  it("drops rows with incomplete tuples and tolerates empty teacher ids", () => {
    expect(
      mapConflictRows([
        { classId: 4, sectionId: null, subjectId: 6, activeTeachers: 2, teacherIds: "1,2" },
        { classId: 4, sectionId: 5, subjectId: 6, activeTeachers: 2, teacherIds: null },
      ])
    ).toEqual([
      { classId: 4, sectionId: 5, subjectId: 6, activeTeachers: 2, teacherIds: [] },
    ]);
  });
});

describe("toggle mapping", () => {
  it("maps auto_approve values 1/0/null", () => {
    expect(isSelfAssignEnabled(1)).toBe(true);
    expect(isSelfAssignEnabled(0)).toBe(false);
    expect(isSelfAssignEnabled(undefined)).toBe(false);
  });
});

describe("self-assign eligibility", () => {
  const base = {
    enabled: true,
    isAdminOrIt: false,
    staffId: 9,
    activeAssignments: 0,
    staffActive: true,
  };

  it("allows only enabled non-managers with zero assignments", () => {
    expect(canSelfAssign(base)).toBe(true);
    expect(canSelfAssign({ ...base, activeAssignments: 2 })).toBe(false);
    expect(canSelfAssign({ ...base, enabled: false })).toBe(false);
    expect(canSelfAssign({ ...base, isAdminOrIt: true })).toBe(false);
  });
});

describe("selected-class cookie payload", () => {
  it("carries the class, section, year and labels", () => {
    const value = buildSelectedClassCookieValue(
      { classId: 1, sectionId: 2, className: "JSS 1", sectionName: "A" },
      4
    );
    expect(JSON.parse(value)).toEqual({
      classId: 1,
      sectionId: 2,
      academicId: 4,
      className: "JSS 1",
      sectionName: "A",
    });
  });
});

describe("id caps", () => {
  it("keeps at most 50 subject or offering ids", () => {
    const raw = Array.from({ length: 75 }, (_, index) => index + 1).join(",");
    expect(parseIdList(raw)).toHaveLength(50);
  });

  it("dedupes repeated ids before applying the cap", () => {
    expect(parseIdList("3,3,3,4")).toEqual([3, 4]);
  });
});
