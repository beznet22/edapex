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

vi.mock("$lib/server/repository/staff.repo", () => ({
  StaffRepository: class StaffRepository {
    static build = vi.fn();
  },
}));

vi.mock("$lib/server/repository/student.repo", () => ({
  StudentRepository: class StudentRepository {
    static build = vi.fn();
  },
}));

vi.mock("$lib/server/repository/auth.repo", () => ({
  AuthRepository: class AuthRepository {
    static build = vi.fn();
  },
}));

vi.mock("$lib/server/repository/timeline.repo", () => ({
  TimelineRepository: class TimelineRepository {
    static build = vi.fn();
  },
}));

import { createTenantContext } from "../tenant-context";

describe("Slice 6: manageAccessLogic raw Drizzle removal (B10)", () => {
  type RepoSpyMap = {
    StaffRepository: {
      getById: ReturnType<typeof vi.fn>;
      updateStaffStatus: ReturnType<typeof vi.fn>;
      deleteStaff: ReturnType<typeof vi.fn>;
    };
    StudentRepository: {
      getById: ReturnType<typeof vi.fn>;
    };
    AuthRepository: {
      updateUserPassword: ReturnType<typeof vi.fn>;
    };
    TimelineRepository: {
      createTimeline: ReturnType<typeof vi.fn>;
    };
  };

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
      staff?: { id: number; fullName: string; userId: number | null } | null;
      audit?: { threadId: string; modelId: string };
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

    const defaultStaff = { id: 700, fullName: "Mr. Smith", userId: 999 };

    const spies: RepoSpyMap = {
      StaffRepository: {
        getById: vi
          .fn()
          .mockResolvedValue(opts.staff === undefined ? defaultStaff : opts.staff),
        updateStaffStatus: vi.fn().mockResolvedValue(undefined),
        deleteStaff: vi.fn().mockResolvedValue(undefined),
      },
      StudentRepository: {
        getById: vi.fn().mockResolvedValue(null),
      },
      AuthRepository: {
        updateUserPassword: vi.fn().mockResolvedValue(undefined),
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

    const audit = opts.audit ?? { threadId: "thread_access_test", modelId: "gpt-4o" };

    return {
      context: { tenantContext, getRepo, audit },
      spies,
      tenantContext,
    };
  }

  let manageAccessLogic: typeof import("../tools/gov-tools").manageAccessLogic;

  beforeEach(async () => {
    const staffMod = await import("$lib/server/repository/staff.repo");
    const studentMod = await import("$lib/server/repository/student.repo");
    const authMod = await import("$lib/server/repository/auth.repo");
    const timelineMod = await import("$lib/server/repository/timeline.repo");
    void staffMod.StaffRepository;
    void studentMod.StudentRepository;
    void authMod.AuthRepository;
    void timelineMod.TimelineRepository;
    const mod = await import("../tools/gov-tools");
    manageAccessLogic = mod.manageAccessLogic;
  });

  it("B10: staff ban calls staffRepo.getById(targetId) (not staffRepo.db.select)", async () => {
    const { context, spies } = makeToolContext();

    const result = await manageAccessLogic(context as never, {
      targetType: "staff",
      targetId: 700,
      action: "ban",
      confirmed: true,
    });

    expect(result.status).toBe("SUCCESS");
    expect(spies.StaffRepository.getById).toHaveBeenCalledTimes(1);
    expect(spies.StaffRepository.getById).toHaveBeenCalledWith(700);
    expect(spies.StaffRepository.updateStaffStatus).toHaveBeenCalledWith({
      teacherId: 700,
      active: false,
    });
  });

  it("B10: returns STAFF_NOT_FOUND when staffRepo.getById returns null", async () => {
    const { context, spies } = makeToolContext({ staff: null });

    const result = await manageAccessLogic(context as never, {
      targetType: "staff",
      targetId: 9999,
      action: "ban",
      confirmed: true,
    });

    expect(result.status).toBe("ERROR");
    expect(result.errorCode).toBe("STAFF_NOT_FOUND");
    expect(spies.StaffRepository.updateStaffStatus).not.toHaveBeenCalled();
    expect(spies.StaffRepository.deleteStaff).not.toHaveBeenCalled();
  });

  it("B10: staff delete uses getById + deleteStaff (no raw Drizzle)", async () => {
    const { context, spies } = makeToolContext();

    const result = await manageAccessLogic(context as never, {
      targetType: "staff",
      targetId: 700,
      action: "delete",
      confirmed: true,
    });

    expect(result.status).toBe("SUCCESS");
    expect(spies.StaffRepository.getById).toHaveBeenCalledWith(700);
    expect(spies.StaffRepository.deleteStaff).toHaveBeenCalledWith({ teacherId: 700 });
    expect(spies.StaffRepository.updateStaffStatus).not.toHaveBeenCalled();
  });
});
