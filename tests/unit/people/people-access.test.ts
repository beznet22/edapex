import { describe, expect, it } from "vitest";
import {
  allowedTabs,
  canAccessPeople,
  canSelfAssign,
  defaultTabFor,
  isAdminOrIt,
  isClassAllowed,
  resolveSelectedClass,
  shouldRedirectToPeople,
} from "$lib/server/people/people-access";
import type { ClassOption } from "$lib/server/people/people-types";

const classA: ClassOption = {
  classId: 1,
  className: "JSS 1",
  sectionId: 10,
  sectionName: "A",
};
const classB: ClassOption = {
  classId: 2,
  className: "JSS 2",
  sectionId: 20,
  sectionName: "B",
};

describe("role detection", () => {
  it("treats isAdministrator, admin and it as managers", () => {
    expect(isAdminOrIt({ isAdministrator: true })).toBe(true);
    expect(isAdminOrIt({ designation: "admin" })).toBe(true);
    expect(isAdminOrIt({ designation: "it" })).toBe(true);
  });

  it("does not treat other designations or missing users as managers", () => {
    expect(isAdminOrIt({ designation: "class_teacher" })).toBe(false);
    expect(isAdminOrIt({ designation: "principal" })).toBe(false);
    expect(isAdminOrIt(null)).toBe(false);
    expect(isAdminOrIt(undefined)).toBe(false);
  });

  it("grants access to managers without a staff id and to staff users", () => {
    expect(canAccessPeople({ isAdministrator: true })).toBe(true);
    expect(canAccessPeople({ staffId: 12, designation: "class_teacher" })).toBe(true);
    expect(canAccessPeople({ designation: "class_teacher" })).toBe(false);
    expect(canAccessPeople(null)).toBe(false);
  });

  it("scopes the visible tabs by role", () => {
    expect(allowedTabs({ designation: "it" })).toEqual(["staff", "parents", "students"]);
    expect(allowedTabs({ staffId: 3, designation: "class_teacher" })).toEqual(["students"]);
    expect(defaultTabFor({ designation: "admin" })).toBe("staff");
    expect(defaultTabFor({ staffId: 3, designation: "class_teacher" })).toBe("students");
  });
});

describe("class resolution", () => {
  it("checks membership", () => {
    expect(isClassAllowed([classA, classB], 2, 20)).toBe(true);
    expect(isClassAllowed([classA], 2, 20)).toBe(false);
    expect(isClassAllowed([], 1, 10)).toBe(false);
  });

  it("honours a requested class only when it is allowed", () => {
    expect(resolveSelectedClass({ classId: 2, sectionId: 20 }, [classA, classB], "single")).toEqual(
      classB
    );
    expect(resolveSelectedClass({ classId: 9, sectionId: 99 }, [classA, classB], "single")).toBeNull();
  });

  it("never widens to a requested class outside the allowed set", () => {
    expect(resolveSelectedClass({ classId: 9, sectionId: 99 }, [classA, classB], "first")).toEqual(
      classA
    );
    expect(resolveSelectedClass({ classId: 2, sectionId: 20 }, [classA], "first")).toEqual(classA);
  });

  it("applies the teacher and admin selection policies", () => {
    expect(resolveSelectedClass(null, [classA, classB], "first")).toEqual(classA);
    expect(resolveSelectedClass(null, [classA], "single")).toEqual(classA);
    expect(resolveSelectedClass(null, [classA, classB], "single")).toBeNull();
    expect(resolveSelectedClass(null, [classA, classB], "none")).toBeNull();
    expect(resolveSelectedClass(null, [], "first")).toBeNull();
  });

  it("prompts admins with several classes but auto-selects a single one", () => {
    const adminMany = resolveSelectedClass(null, [classA, classB], "single");
    expect(adminMany).toBeNull();
    const adminOne = resolveSelectedClass(null, [classA], "single");
    expect(adminOne).toEqual(classA);
  });

  it("falls back to the first allowed class when a request is outside the set", () => {
    const policy = "first";
    expect(resolveSelectedClass({ classId: 99, sectionId: 99 }, [classA, classB], policy)).toEqual(
      classA
    );
    expect(resolveSelectedClass({ classId: 99, sectionId: 99 }, [], policy)).toBeNull();
  });
});

describe("self-assign eligibility", () => {
  const eligible = {
    enabled: true,
    isAdminOrIt: false,
    staffId: 7,
    activeAssignments: 0,
    staffActive: true,
  };

  it("accepts an enabled non-manager with no assignments", () => {
    expect(canSelfAssign(eligible)).toBe(true);
  });

  it("rejects disabled, manager, missing staff, inactive staff or existing assignments", () => {
    expect(canSelfAssign({ ...eligible, enabled: false })).toBe(false);
    expect(canSelfAssign({ ...eligible, isAdminOrIt: true })).toBe(false);
    expect(canSelfAssign({ ...eligible, staffId: null })).toBe(false);
    expect(canSelfAssign({ ...eligible, staffActive: false })).toBe(false);
    expect(canSelfAssign({ ...eligible, activeAssignments: 1 })).toBe(false);
  });
});

describe("redirect decision", () => {
  const base = {
    pathname: "/chat",
    staffId: 7,
    isAdminOrIt: false,
    hasActiveAssignments: false,
    hasActiveYear: true,
  };

  it("redirects unassigned staff from the chat roots", () => {
    expect(shouldRedirectToPeople(base)).toBe(true);
    expect(shouldRedirectToPeople({ ...base, pathname: "/" })).toBe(true);
    expect(shouldRedirectToPeople({ ...base, pathname: "/chat/thread-1" })).toBe(true);
  });

  it("never redirects /people (no loop)", () => {
    expect(shouldRedirectToPeople({ ...base, pathname: "/people" })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, pathname: "/people/offerings" })).toBe(false);
  });

  it("never redirects managers, non-staff, assigned staff or when no year exists", () => {
    expect(shouldRedirectToPeople({ ...base, isAdminOrIt: true })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, staffId: null })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, hasActiveAssignments: true })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, hasActiveYear: false })).toBe(false);
  });

  it("ignores unrelated routes", () => {
    expect(shouldRedirectToPeople({ ...base, pathname: "/filestore" })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, pathname: "/signin" })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, pathname: "/class-roster" })).toBe(false);
    expect(shouldRedirectToPeople({ ...base, pathname: "/admin/parents" })).toBe(false);
  });

  it("treats INTERNAL onboarding sub-paths as exempt", () => {
    for (const path of ["/people", "/people/", "/people/assignments", "/people/offerings"]) {
      expect(shouldRedirectToPeople({ ...base, pathname: path })).toBe(false);
    }
  });
});
