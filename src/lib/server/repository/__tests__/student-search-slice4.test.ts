import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    LIBSQL_URL: "file:test.db",
    LIBSQL_AUTH_TOKEN: "test",
  },
}));

vi.mock("$app/server", () => ({
  getRequestEvent: () => ({}),
}));

describe("Slice 4: StudentRepository.searchStudent extended signature (B8 Commit B)", () => {
  let searchStudent: typeof import("../student.repo").StudentRepository.prototype.searchStudent;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockWhere: ReturnType<typeof vi.fn>;
  let mockLimit: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockWhere = vi.fn();
    mockLimit = vi.fn();

    const chainable: any = {};
    chainable.from = vi.fn().mockReturnValue(chainable);
    chainable.leftJoin = vi.fn().mockReturnValue(chainable);
    chainable.rightJoin = vi.fn().mockReturnValue(chainable);
    chainable.innerJoin = vi.fn().mockReturnValue(chainable);
    chainable.where = mockWhere;
    chainable.limit = mockLimit;
    chainable.offset = vi.fn().mockReturnValue(chainable);
    chainable.orderBy = vi.fn().mockReturnValue(chainable);
    chainable.groupBy = vi.fn().mockReturnValue(chainable);
    chainable.having = vi.fn().mockReturnValue(chainable);
    chainable.then = undefined;

    mockSelect = vi.fn().mockReturnValue(chainable);

    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([
      { studentId: 1, fullName: "Test", admissionNo: 100 },
    ]);

    vi.doMock("$lib/server/db", () => ({
      getDatabase: () => ({ select: mockSelect }),
    }));
    vi.doMock("$lib/server/db/sms-schema", () => ({
      smStudents: { id: "smStudents.id", fullName: "smStudents.fullName", admissionNo: "smStudents.admissionNo", activeStatus: "smStudents.activeStatus" },
      studentRecords: { studentId: "studentRecords.studentId", classId: "studentRecords.classId", sectionId: "studentRecords.sectionId", isDefault: "studentRecords.isDefault" },
      smClasses: { id: "smClasses.id", className: "smClasses.className" },
      smSections: { id: "smSections.id", sectionName: "smSections.sectionName" },
    }));
    vi.doMock("drizzle-orm", () => ({
      like: vi.fn((col, val) => ({ kind: "like", col, val })),
      eq: vi.fn((col, val) => ({ kind: "eq", col, val })),
      and: vi.fn((...conds) => ({ kind: "and", conds })),
    }));

    const mod = await import("../student.repo");
    searchStudent = mod.StudentRepository.prototype.searchStudent;
  });

  function makeRepo() {
    return {
      db: { select: mockSelect },
      withErrorHandling: async <T>(fn: () => Promise<T>, _label: string): Promise<T> => fn(),
    } as never;
  }

  it("B8: searchStudent accepts (query) and preserves current default behaviour", async () => {
    const result = await searchStudent.call(makeRepo(), "Alice");

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("B8: searchStudent accepts (query, { classId, sectionId }) and includes them in the where clause", async () => {
    await searchStudent.call(makeRepo(), "Bob", { classId: 22, sectionId: 3 });

    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    const serialized = JSON.stringify(whereArg);
    expect(serialized).toContain("studentRecords.classId");
    expect(serialized).toContain('"val":22');
    expect(serialized).toContain("studentRecords.sectionId");
    expect(serialized).toContain('"val":3');
  });

  it("B8: searchStudent with only classId does not add a sectionId filter", async () => {
    await searchStudent.call(makeRepo(), "Bob", { classId: 22 });

    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    const serialized = JSON.stringify(whereArg);
    expect(serialized).toContain("studentRecords.classId");
    expect(serialized).not.toContain("studentRecords.sectionId");
  });

  it("B8: searchStudent with no filter option preserves the legacy all-school search (no classId/sectionId in where)", async () => {
    await searchStudent.call(makeRepo(), "Bob");

    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    const serialized = JSON.stringify(whereArg);
    expect(serialized).not.toContain("studentRecords.classId");
    expect(serialized).not.toContain("studentRecords.sectionId");
  });
});
