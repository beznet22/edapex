import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    LIBSQL_URL: "file:test.db",
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

vi.mock("$lib/server/repository/timeline.repo", () => ({
  TimelineRepository: class TimelineRepository {
    static build = vi.fn();
  },
}));

import { createTenantContext, WorkspaceMismatchError } from "../tenant-context";

describe("Slice 5: assignEntityLogic workspace lock (B9)", () => {
  type RepoSpyMap = {
    StudentRepository: {
      getById: ReturnType<typeof vi.fn>;
      assignClassSection: ReturnType<typeof vi.fn>;
    };
    TimelineRepository: {
      createTimeline: ReturnType<typeof vi.fn>;
    };
  };

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
      student?: { classId: number | null; sectionId: number | null; fullName?: string; schoolId: number } | null;
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

    const defaultStudent = { classId: 10, sectionId: 5, fullName: "Alice", schoolId: 1 };

    const spies: RepoSpyMap = {
      StudentRepository: {
        getById: vi
          .fn()
          .mockResolvedValue(opts.student === undefined ? defaultStudent : opts.student),
        assignClassSection: vi.fn().mockResolvedValue(undefined),
      },
      TimelineRepository: {
        createTimeline: vi.fn().mockResolvedValue(42),
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

    const audit = opts.audit ?? { threadId: "thread_assign_test", modelId: "gpt-4o" };

    return {
      context: { tenantContext, getRepo, audit },
      spies,
      tenantContext,
    };
  }

  let assignEntityLogic: typeof import("../tools/onboard-tools").assignEntityLogic;

  beforeEach(async () => {
    const studentMod = await import("$lib/server/repository/student.repo");
    const timelineMod = await import("$lib/server/repository/timeline.repo");
    void studentMod.StudentRepository;
    void timelineMod.TimelineRepository;
    const mod = await import("../tools/onboard-tools");
    assignEntityLogic = mod.assignEntityLogic;
  });

  it("B9: happy path — student in same class as target succeeds (no source bypass)", async () => {
    const { context, spies } = makeToolContext();

    const result = await assignEntityLogic(context as never, {
      studentId: 501,
      targetClassId: 10,
      targetSectionId: 5,
    });

    expect(result.status).toBe("SUCCESS");
    expect(spies.StudentRepository.assignClassSection).toHaveBeenCalledTimes(1);
    expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledTimes(1);
  });

  it("B9: source-bypass blocked — student in class 99, teacher locked to class 10, target 10 — throws WorkspaceMismatchError", async () => {
    const { context, spies } = makeToolContext({ student: { classId: 99, sectionId: 1, fullName: "Bob", schoolId: 1 } });

    await expect(
      assignEntityLogic(context as never, {
        studentId: 501,
        targetClassId: 10,
        targetSectionId: 5,
      }),
    ).rejects.toBeInstanceOf(WorkspaceMismatchError);

    expect(spies.StudentRepository.assignClassSection).not.toHaveBeenCalled();
    expect(spies.TimelineRepository.createTimeline).not.toHaveBeenCalled();
  });

  it("B9: source-bypass blocked when source sectionId differs from tenant section (same classId)", async () => {
    const { context, spies } = makeToolContext({ student: { classId: 10, sectionId: 7, fullName: "Carol", schoolId: 1 } });

    await expect(
      assignEntityLogic(context as never, {
        studentId: 501,
        targetClassId: 10,
        targetSectionId: 5,
      }),
    ).rejects.toBeInstanceOf(WorkspaceMismatchError);

    expect(spies.StudentRepository.assignClassSection).not.toHaveBeenCalled();
  });

  it("B9: IT admin (classId: null) can move students from any source class (broad access)", async () => {
    const { context, spies } = makeToolContext({
      tenant: { designationId: 1, classId: null, sectionId: null },
      student: { classId: 99, sectionId: 1, fullName: "Dave", schoolId: 1 },
    });

    const result = await assignEntityLogic(context as never, {
      studentId: 501,
      targetClassId: 10,
      targetSectionId: 5,
    });

    expect(result.status).toBe("SUCCESS");
    expect(spies.StudentRepository.assignClassSection).toHaveBeenCalledTimes(1);
  });

  it("B9: student not found short-circuits BEFORE the source lock check", async () => {
    const { context, spies } = makeToolContext({ student: null });

    const result = await assignEntityLogic(context as never, {
      studentId: 9999,
      targetClassId: 10,
      targetSectionId: 5,
    });

    expect(result.status).toBe("ERROR");
    expect(result.errorCode).toBe("STUDENT_NOT_FOUND");
    expect(spies.StudentRepository.assignClassSection).not.toHaveBeenCalled();
  });
});

describe("Slice 6: onboardEntityLogic raw Drizzle removal (B11)", () => {
  type RepoSpyMap = {
    StudentRepository: {
      resolveGenderId: ReturnType<typeof vi.fn>;
      resolveStudentCategoryId: ReturnType<typeof vi.fn>;
      db: { select: ReturnType<typeof vi.fn> };
    };
    TimelineRepository: {
      createTimeline: ReturnType<typeof vi.fn>;
    };
  };

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
      genderId?: number | null;
      studentCategoryId?: number | null;
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
      designationId: 1,
      ...opts.tenant,
    });

    const spies: RepoSpyMap = {
      StudentRepository: {
        resolveGenderId: vi
          .fn()
          .mockResolvedValue(opts.genderId === undefined ? 5 : opts.genderId),
        resolveStudentCategoryId: vi
          .fn()
          .mockResolvedValue(opts.studentCategoryId === undefined ? 7 : opts.studentCategoryId),
        // Track calls to db.select to assert B11 removes them.
        db: { select: vi.fn() },
      },
      TimelineRepository: {
        createTimeline: vi.fn().mockResolvedValue(42),
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

    const audit = opts.audit ?? { threadId: "thread_onboard_test", modelId: "gpt-4o" };

    return {
      context: { tenantContext, getRepo, audit },
      spies,
      tenantContext,
    };
  }

  let onboardEntityLogic: typeof import("../tools/onboard-tools").onboardEntityLogic;

  beforeEach(async () => {
    const studentMod = await import("$lib/server/repository/student.repo");
    void studentMod.StudentRepository;
    const mod = await import("../tools/onboard-tools");
    onboardEntityLogic = mod.onboardEntityLogic;
  });

  it("B11: calls studentRepo.resolveGenderId() and resolveStudentCategoryId() instead of raw db.select", async () => {
    const { context, spies } = makeToolContext();

    try {
      await onboardEntityLogic(context as never, {
        studentDetails: {
          firstName: "Alice",
          lastName: "Wong",
          gender: "Female",
          category: "General",
        },
        guardianDetails: {
          relation: "Mother",
          guardianName: "Mrs. Wong",
          phone: "+1234567890",
          email: "wong@example.com",
        },
        enrollmentDetails: {
          classId: 10,
          sectionId: 5,
        },
      });
    } catch {
      // downstream repo methods may be missing in this test — we only assert resolver calls
    }

    expect(spies.StudentRepository.resolveGenderId).toHaveBeenCalledWith("Female");
    expect(spies.StudentRepository.resolveStudentCategoryId).toHaveBeenCalledWith("General");
    // B11: raw Drizzle is gone — studentRepo.db.select must not be called for gender/category.
    expect(spies.StudentRepository.db.select).not.toHaveBeenCalled();
  });

  it("B11: returns GENDER_NOT_FOUND when resolveGenderId returns null", async () => {
    const { context } = makeToolContext({ genderId: null });

    const result = await onboardEntityLogic(context as never, {
      studentDetails: {
        firstName: "Alice",
        lastName: "Wong",
        gender: "Female",
        category: "General",
      },
      guardianDetails: {
        relation: "Mother",
        guardianName: "Mrs. Wong",
        phone: "+1234567890",
        email: "wong@example.com",
      },
      enrollmentDetails: {
        classId: 10,
        sectionId: 5,
      },
    });

    expect(result.status).toBe("ERROR");
    expect(result.errorCode).toBe("GENDER_NOT_FOUND");
  });

  it("B11: returns CATEGORY_NOT_FOUND when resolveStudentCategoryId returns null", async () => {
    const { context } = makeToolContext({ studentCategoryId: null });

    const result = await onboardEntityLogic(context as never, {
      studentDetails: {
        firstName: "Alice",
        lastName: "Wong",
        gender: "Female",
        category: "Alien",
      },
      guardianDetails: {
        relation: "Mother",
        guardianName: "Mrs. Wong",
        phone: "+1234567890",
        email: "wong@example.com",
      },
      enrollmentDetails: {
        classId: 10,
        sectionId: 5,
      },
    });

    expect(result.status).toBe("ERROR");
    expect(result.errorCode).toBe("CATEGORY_NOT_FOUND");
  });
});
