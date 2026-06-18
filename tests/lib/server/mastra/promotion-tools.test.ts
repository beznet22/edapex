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

vi.mock("$lib/server/db", () => ({
  getDatabase: vi.fn(),
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

import { createTenantContext, ForbiddenError, WorkspaceMismatchError } from "$lib/server/mastra/tenant-context";
import { getDatabase } from "$lib/server/db";
import { smStudents } from "$lib/server/db/sms-schema";

type FakeQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeQueryChain(rows: Array<Record<string, unknown>>): FakeQueryBuilder {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ limit, orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where, orderBy, limit };
}

describe("Promotion tools", () => {
  type RepoSpyMap = {
    StudentRepository: {
      promoteStudent: ReturnType<typeof vi.fn>;
    };
    TimelineRepository: {
      createTimeline: ReturnType<typeof vi.fn>;
    };
  };

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
    } = {},
  ) {
    const tenantContext = createTenantContext({
      staffId: 1,
      roleId: 1,
      schoolId: 1,
      classId: null,
      sectionId: null,
      examId: null,
      academicId: 2024,
      userId: 100,
      designationId: 1,
      ...opts.tenant,
    });

    const spies: RepoSpyMap = {
      StudentRepository: {
        promoteStudent: vi.fn().mockResolvedValue(undefined),
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

    return {
      context: { tenantContext, getRepo, audit: {} },
      spies,
      tenantContext,
    };
  }

  let promoteStudentLogic: typeof import("$lib/server/mastra/tools/promotion-tools").promoteStudentLogic;

  beforeEach(async () => {
    vi.clearAllMocks();
    const studentMod = await import("$lib/server/repository/student.repo");
    const timelineMod = await import("$lib/server/repository/timeline.repo");
    void studentMod.StudentRepository;
    void timelineMod.TimelineRepository;
    const mod = await import("$lib/server/mastra/tools/promotion-tools");
    promoteStudentLogic = mod.promoteStudentLogic;
  });

  describe("promoteStudentLogic", () => {
    it("promotes a student within the active workspace", async () => {
      const { context, spies } = makeToolContext();
      const query = makeQueryChain([
        { id: 101, fullName: "Alice Smith", classId: 10, sectionId: 5 },
      ]);
      (getDatabase as ReturnType<typeof vi.fn>).mockResolvedValue({
        select: query.select,
      });

      const result = await promoteStudentLogic(context as never, {
        studentId: 101,
        classId: 11,
        sectionId: 6,
      });

      expect(result.status).toBe("SUCCESS");
      expect(spies.StudentRepository.promoteStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 101,
          classId: 11,
          sectionId: 6,
          resultStatus: "PASSED",
        }),
      );
      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledTimes(1);
      expect(query.select).toHaveBeenCalledWith({
        id: smStudents.id,
        fullName: smStudents.fullName,
        classId: smStudents.classId,
        sectionId: smStudents.sectionId,
      });
    });

    it("returns STUDENT_NOT_FOUND when the student does not exist", async () => {
      const { context, spies } = makeToolContext();
      const query = makeQueryChain([]);
      (getDatabase as ReturnType<typeof vi.fn>).mockResolvedValue({
        select: query.select,
      });

      const result = await promoteStudentLogic(context as never, {
        studentId: 9999,
        classId: 11,
        sectionId: 6,
      });

      expect(result).toMatchObject({ status: "ERROR", errorCode: "STUDENT_NOT_FOUND" });
      expect(spies.StudentRepository.promoteStudent).not.toHaveBeenCalled();
      expect(spies.TimelineRepository.createTimeline).not.toHaveBeenCalled();
    });

    it("enforces workspace lock on the source class/section", async () => {
      const { context } = makeToolContext({ tenant: { classId: 10, sectionId: 5 } });
      const query = makeQueryChain([
        { id: 101, fullName: "Alice Smith", classId: 99, sectionId: 1 },
      ]);
      (getDatabase as ReturnType<typeof vi.fn>).mockResolvedValue({
        select: query.select,
      });

      await expect(
        promoteStudentLogic(context as never, {
          studentId: 101,
          classId: 10,
          sectionId: 5,
        }),
      ).rejects.toBeInstanceOf(WorkspaceMismatchError);
    });

    it("rejects callers outside the role whitelist", async () => {
      const { context } = makeToolContext({ tenant: { designationId: 2 } });
      const query = makeQueryChain([]);
      (getDatabase as ReturnType<typeof vi.fn>).mockResolvedValue({
        select: query.select,
      });

      await expect(
        promoteStudentLogic(context as never, {
          studentId: 101,
          classId: 11,
          sectionId: 6,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
