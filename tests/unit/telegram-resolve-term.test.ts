import { describe, it, expect, vi } from "vitest";
import { resolveTerm } from "$lib/server/telegram/pdf/resolveTerm";
import type { MySQLDrizzleClient } from "$lib/server/db";

/**
 * Build a fake drizzle client whose first `selectDistinct` returns one
 * row set and whose second `select` returns another. resolveTerm only
 * performs those two queries per call.
 */
function fakeDb(
  distinctRows: Array<{ examTypeId: number | null }>,
  examTypeRows: Array<{
    examTypeId: number;
    title: string;
    academicId: number | null;
    academicYear: string | null;
    academicTitle: string | null;
  }>,
): MySQLDrizzleClient {
  const selectDistinct = vi.fn().mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(distinctRows),
    }),
  });
  const select = vi.fn().mockReturnValue({
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(examTypeRows),
        }),
      }),
    }),
  });
  return {
    select,
    selectDistinct,
  } as unknown as MySQLDrizzleClient;
}

describe("resolveTerm", () => {
  it("returns not_found when no result rows exist for the child", async () => {
    const db = fakeDb([], []);
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: null, yearHint: null });
    expect(r.kind).toBe("not_found");
  });

  it("returns exact with the latest examType when no hints are provided", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }, { examTypeId: 11 }],
      [
        { examTypeId: 11, title: "CA2", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
        { examTypeId: 10, title: "CA1", academicId: 1, academicYear: "2023-2024", academicTitle: "AY 23-24" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: null, yearHint: null });
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.examType.examTypeId).toBe(11);
  });

  it("matches by exact title (case-insensitive)", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }, { examTypeId: 11 }],
      [
        { examTypeId: 11, title: "CA2", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
        { examTypeId: 10, title: "CA1", academicId: 1, academicYear: "2023-2024", academicTitle: "AY 23-24" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: "ca2", yearHint: null });
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.examType.examTypeId).toBe(11);
  });

  it("matches by numeric examTypeId hint", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }, { examTypeId: 11 }],
      [
        { examTypeId: 11, title: "CA2", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
        { examTypeId: 10, title: "CA1", academicId: 1, academicYear: "2023-2024", academicTitle: "AY 23-24" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: "10", yearHint: null });
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.examType.examTypeId).toBe(10);
  });

  it("returns ambiguous_years when the same term title spans multiple years", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }, { examTypeId: 11 }],
      [
        { examTypeId: 11, title: "CA2", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
        { examTypeId: 10, title: "CA2", academicId: 1, academicYear: "2023-2024", academicTitle: "AY 23-24" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: "CA2", yearHint: null });
    expect(r.kind).toBe("ambiguous_years");
    if (r.kind === "ambiguous_years") {
      expect(r.examTypes).toHaveLength(2);
      expect(r.termTitle).toBe("CA2");
    }
  });

  it("returns ambiguous_terms when the hint matches multiple distinct term titles", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }, { examTypeId: 11 }],
      [
        { examTypeId: 11, title: "CA2", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
        { examTypeId: 10, title: "CA1", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: "CA", yearHint: null });
    // 'CA' is a substring of both titles. The matcher uses exact equality
    // (normalize(termHint) === normalize(r.title)), so 'CA' must NOT match
    // 'CA1' or 'CA2'. Result: not_found.
    expect(r.kind).toBe("not_found");
  });

  it("returns not_found when the hint matches nothing", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }],
      [
        { examTypeId: 10, title: "CA1", academicId: 1, academicYear: "2023-2024", academicTitle: "AY 23-24" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: "Final", yearHint: null });
    expect(r.kind).toBe("not_found");
  });

  it("narrows by year hint as well as term hint", async () => {
    const db = fakeDb(
      [{ examTypeId: 10 }, { examTypeId: 11 }],
      [
        { examTypeId: 11, title: "CA2", academicId: 2, academicYear: "2024-2025", academicTitle: "AY 24-25" },
        { examTypeId: 10, title: "CA2", academicId: 1, academicYear: "2023-2024", academicTitle: "AY 23-24" },
      ],
    );
    const r = await resolveTerm({ db, schoolId: 1, studentId: 1, termHint: "CA2", yearHint: "2024-2025" });
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.examType.examTypeId).toBe(11);
  });
});
