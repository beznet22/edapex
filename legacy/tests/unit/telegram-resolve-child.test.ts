import { describe, it, expect } from "vitest";
import { filterOwned, resolveChild, type ChildCandidate } from "$lib/server/telegram/pdf/resolveChild";

const CANDIDATES: ChildCandidate[] = [
  { studentId: 101, fullName: "Alice Johnson", admissionNo: 2001 },
  { studentId: 102, fullName: "Alicia Smith", admissionNo: 2002 },
  { studentId: 103, fullName: "Bob Lee", admissionNo: 2003 },
  { studentId: 104, fullName: "Carla Wong", admissionNo: null },
];

describe("resolveChild", () => {
  it("matches by exact full name (case-insensitive)", () => {
    const r = resolveChild("alice johnson", CANDIDATES);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.studentId).toBe(101);
  });

  it("matches by exact admission number as a string", () => {
    const r = resolveChild("2003", CANDIDATES);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.studentId).toBe(103);
  });

  it("matches by unique substring of the full name", () => {
    const r = resolveChild("wong", CANDIDATES);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.studentId).toBe(104);
  });

  it("returns ambiguous when substring matches multiple", () => {
    const r = resolveChild("ali", CANDIDATES);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.matches.map((m) => m.studentId).sort()).toEqual([101, 102]);
    }
  });

  it("returns not_found for empty query", () => {
    expect(resolveChild("   ", CANDIDATES).kind).toBe("not_found");
  });

  it("returns not_found for empty candidate list", () => {
    expect(resolveChild("Alice", []).kind).toBe("not_found");
  });

  it("returns not_found when no candidate matches", () => {
    expect(resolveChild("Zoe", CANDIDATES).kind).toBe("not_found");
  });

  it("prefers admission-number match over substring", () => {
    // 2002 happens to contain "200" — admission number match must win.
    const r = resolveChild("2002", CANDIDATES);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.studentId).toBe(102);
  });

  it("trims whitespace from query", () => {
    const r = resolveChild("  Bob Lee  ", CANDIDATES);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.studentId).toBe(103);
  });
});

describe("filterOwned", () => {
  it("returns only candidates whose studentId is in the owned list", () => {
    const out = filterOwned([101, 103], CANDIDATES);
    expect(out.map((c) => c.studentId)).toEqual([101, 103]);
  });

  it("returns empty when no overlap", () => {
    expect(filterOwned([999], CANDIDATES)).toEqual([]);
  });
});
