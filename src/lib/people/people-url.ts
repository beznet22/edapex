import type {
  ParentSort,
  ParentStatus,
  PeopleTab,
  SortDir,
  StaffSort,
  StaffStatus,
} from "$lib/server/people/people-types";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

const RESET_KEYS = [
  "tab",
  "q",
  "status",
  "sort",
  "dir",
  "includeInactive",
  "allYears",
  "pageSize",
  "classId",
  "sectionId",
  "exam",
] as const;

export type PeopleUrlPatch = Partial<{
  tab: PeopleTab;
  q: string;
  status: StaffStatus | ParentStatus;
  sort: StaffSort | ParentSort | "name";
  dir: SortDir;
  page: number;
  pageSize: PageSize;
  includeInactive: boolean;
  allYears: boolean;
  classId: number | null;
  sectionId: number | null;
  exam: number | null;
  onboarding: boolean;
}>;

export function buildPeopleUrl(current: URL, patch: PeopleUrlPatch): string {
  const params = new URLSearchParams(current.searchParams);
  const apply = (key: string, value: string | null): void => {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  };

  const touchesReset = RESET_KEYS.some((key) => patch[key] !== undefined);

  if (patch.tab !== undefined) apply("tab", patch.tab);
  if (patch.q !== undefined) {
    const query = patch.q.trim().slice(0, 100);
    apply("q", query.length >= 2 ? query : null);
  }
  if (patch.status !== undefined) apply("status", patch.status === "all" ? null : patch.status);
  if (patch.sort !== undefined) apply("sort", patch.sort === "name" ? null : patch.sort);
  if (patch.dir !== undefined) apply("dir", patch.dir === "asc" ? null : patch.dir);
  if (patch.includeInactive !== undefined) {
    apply("includeInactive", patch.includeInactive ? "true" : null);
  }
  if (patch.allYears !== undefined) apply("allYears", patch.allYears ? "true" : null);
  if (patch.pageSize !== undefined) {
    apply("pageSize", patch.pageSize === 25 ? null : String(patch.pageSize));
  }
  if (patch.classId !== undefined) {
    apply("classId", patch.classId === null ? null : String(patch.classId));
  }
  if (patch.sectionId !== undefined) {
    apply("sectionId", patch.sectionId === null ? null : String(patch.sectionId));
  }
  if (patch.exam !== undefined) apply("exam", patch.exam === null ? null : String(patch.exam));
  if (patch.onboarding !== undefined) apply("onboarding", patch.onboarding ? "1" : null);

  const nextPage = patch.page !== undefined ? patch.page : touchesReset ? 1 : null;
  if (nextPage !== null) apply("page", nextPage <= 1 ? null : String(nextPage));

  const query = params.toString();
  return query ? `${current.pathname}?${query}` : current.pathname;
}
