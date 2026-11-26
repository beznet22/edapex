import type { ClassOption, PeopleTab } from "./people-types";

export type PeopleUser =
  | {
      staffId?: number | null;
      designation?: string | null;
      isAdministrator?: boolean;
    }
  | null
  | undefined;

export function isAdminOrIt(user: PeopleUser): boolean {
  if (!user) return false;
  return (
    user.isAdministrator === true ||
    user.designation === "admin" ||
    user.designation === "it"
  );
}

export function canAccessPeople(user: PeopleUser): boolean {
  if (isAdminOrIt(user)) return true;
  return typeof user?.staffId === "number" && user.staffId > 0;
}

export function allowedTabs(user: PeopleUser): PeopleTab[] {
  if (isAdminOrIt(user)) return ["staff", "parents", "students"];
  return ["students"];
}

export function defaultTabFor(user: PeopleUser): PeopleTab {
  return isAdminOrIt(user) ? "staff" : "students";
}

export function isClassAllowed(
  allowed: ClassOption[],
  classId: number,
  sectionId: number
): boolean {
  return allowed.some((option) => option.classId === classId && option.sectionId === sectionId);
}

export type ClassSelectionPolicy = "first" | "single" | "none";

export function resolveSelectedClass(
  requested: { classId: number | null; sectionId: number | null } | null,
  allowed: ClassOption[],
  policy: ClassSelectionPolicy
): ClassOption | null {
  if (allowed.length === 0) return null;

  if (requested && requested.classId !== null && requested.sectionId !== null) {
    const match = allowed.find(
      (option) =>
        option.classId === requested.classId && option.sectionId === requested.sectionId
    );
    if (match) return match;
  }

  if (policy === "first") return allowed[0] ?? null;
  if (policy === "single" && allowed.length === 1) return allowed[0] ?? null;
  return null;
}

export function canSelfAssign(input: {
  enabled: boolean;
  isAdminOrIt: boolean;
  staffId: number | null;
  activeAssignments: number;
  staffActive: boolean;
}): boolean {
  return (
    input.enabled &&
    !input.isAdminOrIt &&
    typeof input.staffId === "number" &&
    input.staffId > 0 &&
    input.staffActive &&
    input.activeAssignments === 0
  );
}

export function shouldRedirectToPeople(input: {
  pathname: string;
  staffId: number | null;
  isAdminOrIt: boolean;
  hasActiveAssignments: boolean;
  hasActiveYear: boolean;
}): boolean {
  const { pathname, staffId, isAdminOrIt, hasActiveAssignments, hasActiveYear } = input;
  if (staffId === null || staffId <= 0) return false;
  if (isAdminOrIt) return false;
  if (hasActiveAssignments) return false;
  if (!hasActiveYear) return false;
  if (pathname === "/people" || pathname.startsWith("/people/")) return false;
  return pathname === "/" || pathname.startsWith("/chat");
}
