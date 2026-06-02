import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    LIBSQL_URL: "file:tests/.tmp/test.db",
    LIBSQL_AUTH_TOKEN: "test",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
    TINYFISH_API_KEY: "test-key",
  },
}));

vi.mock("$env/dynamic/public", () => ({
  env: {
    PUBLIC_STORAGE_PATH: "/tmp/test-storage",
  },
}));

vi.mock("$app/server", () => ({
  getRequestEvent: () => null,
}));

vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

vi.mock("$lib/components/template/ResultTemplate.svelte", () => ({
  default: {},
}));

vi.mock("$lib/components/template/result-email.svelte", () => ({
  default: {},
}));

vi.mock("$lib/server/repository/student.repo", () => ({
  StudentRepository: class StudentRepository {
    static build = vi.fn();
  },
}));

vi.mock("$lib/server/repository/staff.repo", () => ({
  StaffRepository: class StaffRepository {
    static build = vi.fn();
  },
}));

import { createTenantContext } from "../tenant-context";

describe("Slice 4: searchEntityTool input filter (B8)", () => {
  type StudentRepoSpy = {
    getStudentsByClassSection: ReturnType<typeof vi.fn>;
    searchStudent: ReturnType<typeof vi.fn>;
  };

  type StaffRepoSpy = {
    db: { select: ReturnType<typeof vi.fn> };
  };

  type RepoSpyMap = {
    StudentRepository: StudentRepoSpy;
    StaffRepository: StaffRepoSpy;
  };

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
      classStudents?: Array<{ id: number; name: string; admissionNo?: number }> | null;
      searchedStudents?: Array<{ studentId: number; fullName: string; admissionNo?: number; className?: string; sectionName?: string }>;
      audit?: { threadId: string; modelId: string };
    } = {},
  ) {
    const tenantContext = createTenantContext({
      staffId: 1,
      roleId: 1,
      schoolId: 1,
      classId: 10,
      sectionId: 5,
      examId: null,
      academicId: 2024,
      userId: 100,
      designationId: 8,
      ...opts.tenant,
    });

    const classStudents = opts.classStudents === undefined
      ? [
          { id: 1001, name: "Alice", admissionNo: 2001 },
          { id: 1002, name: "Bob", admissionNo: 2002 },
        ]
      : opts.classStudents;

    const searchedStudents = opts.searchedStudents ?? [
      { studentId: 2001, fullName: "Carla", admissionNo: 3001, className: "Grade 9", sectionName: "A" },
    ];

    const spies: RepoSpyMap = {
      StudentRepository: {
        getStudentsByClassSection: vi.fn().mockResolvedValue(classStudents),
        searchStudent: vi.fn().mockResolvedValue(searchedStudents),
      },
      StaffRepository: {
        db: { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }) },
      },
    };

    const getRepo = (RepoCls: { name?: string } | string) => {
      const name = (typeof RepoCls === "string" ? RepoCls : RepoCls?.name) as keyof RepoSpyMap;
      const spy = spies[name];
      if (!spy) {
        throw new Error(`Repository not stubbed in test: ${String(name)}`);
      }
      return spy;
    };

    const audit = opts.audit ?? { threadId: "thread_search_test", modelId: "gpt-4o" };

    return {
      context: { tenantContext, getRepo, audit },
      spies,
      tenantContext,
    };
  }

  let searchEntityTool: typeof import("../tools/index").searchEntityTool;
  let searchEntityLogic: typeof import("../tools/core-tools").searchEntityLogic;
  let StudentRepository: unknown;
  let StaffRepository: unknown;

  beforeEach(async () => {
    const studentMod = await import("$lib/server/repository/student.repo");
    const staffMod = await import("$lib/server/repository/staff.repo");
    StudentRepository = studentMod.StudentRepository;
    StaffRepository = staffMod.StaffRepository;
    const indexMod = await import("../tools/index");
    searchEntityTool = indexMod.searchEntityTool;
    const coreMod = await import("../tools/core-tools");
    searchEntityLogic = coreMod.searchEntityLogic;
  });

  it("B8: empty-query branch passes input.classId/input.sectionId override to getStudentsByClassSection", async () => {
    const { context, spies } = makeToolContext({ classStudents: [{ id: 1001, name: "Alice", admissionNo: 2001 }] });

    const execute = (searchEntityTool as unknown as { execute: (input: any, context: any) => Promise<any> }).execute;
    const result = await execute(
      { query: "", entityType: "student", classId: 99, sectionId: 7 },
      context,
    );

    expect(spies.StudentRepository.getStudentsByClassSection).toHaveBeenCalledTimes(1);
    expect(spies.StudentRepository.getStudentsByClassSection).toHaveBeenCalledWith({
      classId: 99,
      sectionId: 7,
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.entity).toBeDefined();
    expect(result.entity.classId).toBe(99);
    expect(result.entity.sectionId).toBe(7);
  });

  it("B8: empty-query branch falls back to tenantContext when input.classId/sectionId are omitted", async () => {
    const { context, spies } = makeToolContext();

    const execute = (searchEntityTool as unknown as { execute: (input: any, context: any) => Promise<any> }).execute;
    await execute({ query: "", entityType: "student" }, context);

    expect(spies.StudentRepository.getStudentsByClassSection).toHaveBeenCalledWith({
      classId: 10,
      sectionId: 5,
    });
  });

  it("B8: when both input override and tenantContext are null, returns NEEDS_CLARIFICATION without calling getStudentsByClassSection", async () => {
    const { context, spies } = makeToolContext({ tenant: { classId: null, sectionId: null } });

    const execute = (searchEntityTool as unknown as { execute: (input: any, context: any) => Promise<any> }).execute;
    const result = await execute({ query: "", entityType: "student" }, context);

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    expect(spies.StudentRepository.getStudentsByClassSection).not.toHaveBeenCalled();
  });

  it("B8: empty-query result mapping uses resolved classId/sectionId (not raw tenantContext)", async () => {
    const { context } = makeToolContext({ classStudents: [{ id: 1001, name: "Alice", admissionNo: 2001 }] });

    const execute = (searchEntityTool as unknown as { execute: (input: any, context: any) => Promise<any> }).execute;
    const result = await execute(
      { query: "", entityType: "student", classId: 22, sectionId: 3 },
      context,
    );

    expect(result.entity).toEqual(
      expect.objectContaining({ classId: 22, sectionId: 3 }),
    );
  });

  it("B8: non-empty-query branch passes resolved classId/sectionId to searchStudent", async () => {
    const { context, spies } = makeToolContext();

    const execute = (searchEntityTool as unknown as { execute: (input: any, context: any) => Promise<any> }).execute;
    await execute({ query: "Carla", entityType: "student", classId: 22, sectionId: 3 }, context);

    expect(spies.StudentRepository.searchStudent).toHaveBeenCalledTimes(1);
    const callArgs = spies.StudentRepository.searchStudent.mock.calls[0];
    expect(callArgs[0]).toBe("Carla");
    expect(callArgs[1]).toEqual({ classId: 22, sectionId: 3 });
  });

  it("B8: non-empty-query branch without input override still calls searchStudent with explicit nulls (signature compatibility)", async () => {
    const { context, spies } = makeToolContext();

    const execute = (searchEntityTool as unknown as { execute: (input: any, context: any) => Promise<any> }).execute;
    await execute({ query: "Carla", entityType: "student" }, context);

    expect(spies.StudentRepository.searchStudent).toHaveBeenCalledTimes(1);
    const callArgs = spies.StudentRepository.searchStudent.mock.calls[0];
    expect(callArgs[0]).toBe("Carla");
    expect(callArgs[1]).toEqual({ classId: 10, sectionId: 5 });
  });
});
