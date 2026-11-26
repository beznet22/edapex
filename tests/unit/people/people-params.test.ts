import { describe, expect, it } from "vitest";
import {
  buildPeopleUrl,
  PAGE_SIZES,
  parseIdList,
  parsePeopleParams,
  resolveTab,
} from "$lib/server/people/people-params";

function parse(query: string, canManage = true) {
  return parsePeopleParams({
    searchParams: new URLSearchParams(query),
    canManage,
  });
}

describe("parsePeopleParams — defaults", () => {
  it("defaults admins to the staff tab", () => {
    const filters = parse("");
    expect(filters).toMatchObject({
      tab: "staff",
      q: "",
      status: "all",
      sort: "name",
      dir: "asc",
      page: 1,
      pageSize: 25,
      includeInactive: false,
      allYears: false,
      onboarding: false,
    });
  });

  it("defaults teachers to the students tab regardless of the URL", () => {
    expect(parse("tab=staff", false).tab).toBe("students");
    expect(parse("tab=parents", false).tab).toBe("students");
    expect(parse("tab=duplicates", true).tab).toBe("staff");
  });

  it("exposes the allowed page sizes", () => {
    expect(PAGE_SIZES).toEqual([25, 50, 100]);
  });

  it("resolves tab names", () => {
    expect(resolveTab("parents", true)).toBe("parents");
    expect(resolveTab("duplicates", true)).toBe("staff");
    expect(resolveTab("students", false)).toBe("students");
  });
});

describe("parsePeopleParams — normalization", () => {
  it("clears queries shorter than two characters and truncates at 100", () => {
    expect(parse("q=a").q).toBe("");
    expect(parse("q=%20%20ab%20%20").q).toBe("ab");
    expect(parse(`q=${"x".repeat(150)}`).q).toHaveLength(100);
  });

  it("clamps page and pageSize", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-4").page).toBe(1);
    expect(parse("page=abc").page).toBe(1);
    expect(parse("page=3").page).toBe(3);
    expect(parse("pageSize=30").pageSize).toBe(25);
    expect(parse("pageSize=100").pageSize).toBe(100);
    expect(parse("pageSize=50").pageSize).toBe(50);
  });

  it("falls back on unknown status, sort and direction values", () => {
    const staff = parse("tab=staff&status=duplicate&sort=email&dir=sideways");
    expect(staff).toMatchObject({ status: "all", sort: "name", dir: "asc" });

    const parents = parse("tab=parents&status=duplicate&sort=email");
    expect(parents).toMatchObject({ status: "duplicate", sort: "email" });
  });

  it("accepts only the literal true for includeInactive and allYears", () => {
    expect(parse("tab=staff&includeInactive=true").includeInactive).toBe(true);
    expect(parse("tab=staff&includeInactive=1").includeInactive).toBe(false);

    const parents = parse("tab=parents&allYears=true");
    expect(parents.allYears).toBe(true);
    expect(parse("tab=staff&allYears=true").allYears).toBe(false);
    expect(parse("tab=parents&allYears=yes").allYears).toBe(false);
  });

  it("reads class and section ids for students and rejects invalid values", () => {
    expect(parse("tab=students&classId=7&sectionId=9", false)).toMatchObject({
      classId: 7,
      sectionId: 9,
    });
    expect(parse("tab=students&classId=-7&sectionId=0", false)).toMatchObject({
      classId: null,
      sectionId: null,
    });
    expect(parse("tab=students&classId=abc", false).classId).toBeNull();
  });

  it("ignores class ids on the staff and parents tabs", () => {
    expect(parse("tab=staff&classId=7&sectionId=9")).toMatchObject({
      classId: null,
      sectionId: null,
    });
    expect(parse("tab=parents&classId=7&sectionId=9")).toMatchObject({
      classId: null,
      sectionId: null,
    });
  });

  it("reads the onboarding hint", () => {
    expect(parse("onboarding=1").onboarding).toBe(true);
    expect(parse("onboarding=true").onboarding).toBe(true);
    expect(parse("onboarding=0").onboarding).toBe(false);
  });
});

describe("buildPeopleUrl", () => {
  const base = new URL("https://school.test/people");

  it("resets the page when a filter changes", () => {
    const current = new URL("https://school.test/people?tab=staff&page=4&q=ada");
    const next = buildPeopleUrl(current, { status: "linked" });
    expect(next).not.toContain("page=");
    expect(next).toContain("q=ada");
    expect(next).toContain("status=linked");

    const parsed = parsePeopleParams({
      searchParams: new URL(next, "https://school.test").searchParams,
      canManage: true,
    });
    expect(parsed.page).toBe(1);
  });

  it("keeps the page when only the page changes", () => {
    const next = buildPeopleUrl(base, { page: 3 });
    expect(next).toContain("page=3");
  });

  it("drops default values from the URL", () => {
    const current = new URL(
      "https://school.test/people?q=ada&status=all&dir=asc&pageSize=25&includeInactive=false"
    );
    const next = buildPeopleUrl(current, {
      q: "",
      status: "all",
      dir: "asc",
      pageSize: 25,
      includeInactive: false,
    });
    expect(next).toBe("/people");
  });

  it("clears queries shorter than the two-character search minimum", () => {
    const current = new URL("https://school.test/people?q=ada");
    expect(buildPeopleUrl(current, { q: "a" })).toBe("/people");
    expect(buildPeopleUrl(current, { q: "  a  " })).toBe("/people");
    expect(buildPeopleUrl(current, { q: "ab" })).toBe("/people?q=ab");
  });

  it("preserves the onboarding hint while switching tabs", () => {
    const current = new URL("https://school.test/people?onboarding=1");
    const next = buildPeopleUrl(current, { tab: "students" });
    expect(next).toContain("onboarding=1");
    expect(next).toContain("tab=students");
  });

  it("round-trips the parents All-years scope and clears it on reset", () => {
    const current = new URL("https://school.test/people?tab=parents");
    const next = buildPeopleUrl(current, { allYears: true });
    expect(next).toContain("allYears=true");
    expect(parse("tab=parents&allYears=true").allYears).toBe(true);
    expect(buildPeopleUrl(new URL(next, "https://school.test"), { allYears: false })).toBe(
      "/people?tab=parents"
    );
  });

  it("round-trips parsed filters", () => {
    const built = buildPeopleUrl(base, {
      tab: "parents",
      q: "ada",
      pageSize: 50,
      allYears: true,
      page: 3,
    });
    const parsed = parsePeopleParams({
      searchParams: new URL(built, "https://school.test").searchParams,
      canManage: true,
    });
    expect(parsed).toMatchObject({
      tab: "parents",
      q: "ada",
      pageSize: 50,
      allYears: true,
      page: 3,
    });
  });
});

describe("parseIdList", () => {
  it("dedupes, drops invalid values and caps the list", () => {
    expect(parseIdList("1,2,2,-3,x,0,4")).toEqual([1, 2, 4]);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList("")).toEqual([]);
  });

  it("caps at 50 ids by default and honours a smaller cap", () => {
    const many = Array.from({ length: 60 }, (_, index) => index + 1).join(",");
    expect(parseIdList(many)).toHaveLength(50);
    expect(parseIdList(many, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
