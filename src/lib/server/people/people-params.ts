import type {
  ParentFilters,
  ParentSort,
  ParentStatus,
  PeopleFilters,
  PeopleTab,
  SortDir,
  StaffFilters,
  StaffSort,
  StaffStatus,
  StudentFilters,
} from "./people-types";
import { PAGE_SIZES, type PageSize } from "$lib/people/people-url";

export * from "$lib/people/people-url";

export const STAFF_STATUSES: readonly StaffStatus[] = [
  "all",
  "active",
  "inactive",
  "no_email",
  "linked",
  "unlinked",
];

export const PARENT_STATUSES: readonly ParentStatus[] = [
  "all",
  "linked",
  "unlinked",
  "no_email",
  "non_gmail",
  "duplicate",
];

export const STAFF_SORTS: readonly StaffSort[] = ["name", "role", "status"];
export const PARENT_SORTS: readonly ParentSort[] = ["name", "status", "email"];

function oneOf<T extends string>(allowed: readonly T[], raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function positiveInt(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizePage(raw: string | null): number {
  const value = positiveInt(raw);
  return value ?? 1;
}

function normalizePageSize(raw: string | null): PageSize {
  const value = raw === null ? NaN : Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(value) ? (value as PageSize) : 25;
}

function normalizeQuery(raw: string | null): string {
  const value = (raw ?? "").trim().slice(0, 100);
  return value.length >= 2 ? value : "";
}

export function resolveTab(raw: string | null, canManage: boolean): PeopleTab {
  if (!canManage) return "students";
  return raw === "staff" || raw === "parents" || raw === "students" ? raw : "staff";
}

export function parsePeopleParams(input: {
  searchParams: URLSearchParams;
  canManage: boolean;
}): PeopleFilters {
  const { searchParams, canManage } = input;
  const tab = resolveTab(searchParams.get("tab"), canManage);
  const q = normalizeQuery(searchParams.get("q"));
  const page = normalizePage(searchParams.get("page"));
  const pageSize = normalizePageSize(searchParams.get("pageSize"));
  const dir: SortDir = searchParams.get("dir") === "desc" ? "desc" : "asc";
  const onboarding =
    searchParams.get("onboarding") === "1" || searchParams.get("onboarding") === "true";

  if (tab === "staff") {
    const filters: StaffFilters = {
      tab,
      q,
      status: oneOf(STAFF_STATUSES, searchParams.get("status"), "all"),
      sort: oneOf(STAFF_SORTS, searchParams.get("sort"), "name"),
      dir,
      page,
      pageSize,
      includeInactive: searchParams.get("includeInactive") === "true",
      allYears: false,
      classId: null,
      sectionId: null,
      onboarding,
    };
    return filters;
  }

  if (tab === "parents") {
    const filters: ParentFilters = {
      tab,
      q,
      status: oneOf(PARENT_STATUSES, searchParams.get("status"), "all"),
      sort: oneOf(PARENT_SORTS, searchParams.get("sort"), "name"),
      dir,
      page,
      pageSize,
      includeInactive: false,
      allYears: searchParams.get("allYears") === "true",
      classId: null,
      sectionId: null,
      onboarding,
    };
    return filters;
  }

  const filters: StudentFilters = {
    tab: "students",
    q,
    status: "all",
    sort: "name",
    dir,
    page,
    pageSize,
    includeInactive: false,
    allYears: false,
    classId: positiveInt(searchParams.get("classId")),
    sectionId: positiveInt(searchParams.get("sectionId")),
    examTypeId: positiveInt(searchParams.get("exam")),
    onboarding,
  };
  return filters;
}

export function parseIdList(raw: string | null, max = 50): number[] {
  const ids = (raw ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(ids)].slice(0, Math.max(1, max));
}
