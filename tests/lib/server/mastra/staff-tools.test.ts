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

import { createTenantContext, ForbiddenError } from "$lib/server/mastra/tenant-context";
import { smDesignations, smHumanDepartments, smStaffs, users } from "$lib/server/db/sms-schema";
import { getTableName } from "drizzle-orm";

describe("Staff tools", () => {
  type RepoSpyMap = {
    StaffRepository: {
      createStaff: ReturnType<typeof vi.fn>;
      getById: ReturnType<typeof vi.fn>;
      db: {
        select: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    StudentRepository: {
      resolveGenderId: ReturnType<typeof vi.fn>;
    };
  };

  function makeDbSelect(
    tableRows: Record<string, Array<Record<string, unknown>>>,
  ) {
    return vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => {
        const tableName = typeof table === "string" ? table : getTableName(table as never);
        const rows = tableRows[tableName] ?? [];
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        };
      }),
    }));
  }

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
      genderId?: number | null;
      designationRows?: Array<Record<string, unknown>>;
      departmentRows?: Array<Record<string, unknown>>;
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

    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const spies: RepoSpyMap = {
      StaffRepository: {
        createStaff: vi.fn().mockResolvedValue({
          id: 500,
          userId: 600,
          email: "jane.doe@example.com",
          password: "temp-pass",
        }),
        getById: vi.fn().mockResolvedValue({
          id: 500,
          userId: 600,
          firstName: "Jane",
          lastName: "Doe",
        }),
        db: {
          select: makeDbSelect({
            sm_designations: opts.designationRows ?? [{ id: 5 }],
            sm_human_departments: opts.departmentRows ?? [{ id: 3 }],
            sm_staffs: [{ id: 500, userId: 600, firstName: "Jane", lastName: "Doe" }],
          }),
          update: vi.fn().mockReturnValue({ set: updateSet }),
        },
      },
      StudentRepository: {
        resolveGenderId: vi.fn().mockResolvedValue(opts.genderId === undefined ? 2 : opts.genderId),
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

  let enrollStaffLogic: typeof import("$lib/server/mastra/tools/staff-tools").enrollStaffLogic;
  let updateStaffBiodataLogic: typeof import("$lib/server/mastra/tools/staff-tools").updateStaffBiodataLogic;

  beforeEach(async () => {
    const staffMod = await import("$lib/server/repository/staff.repo");
    const studentMod = await import("$lib/server/repository/student.repo");
    void staffMod.StaffRepository;
    void studentMod.StudentRepository;
    const mod = await import("$lib/server/mastra/tools/staff-tools");
    enrollStaffLogic = mod.enrollStaffLogic;
    updateStaffBiodataLogic = mod.updateStaffBiodataLogic;
  });

  describe("enrollStaffLogic", () => {
    it("enrolls a new staff member when gender/designation/department resolve", async () => {
      const { context, spies } = makeToolContext({
        designationRows: [{ id: 5 }],
        departmentRows: [{ id: 3 }],
      });

      const result = await enrollStaffLogic(context as never, {
        firstName: "Jane",
        lastName: "Doe",
        gender: "Female",
        email: "jane.doe@example.com",
        mobile: "+1234567890",
        designation: "coordinator",
        department: "Academics",
      });

      expect(result.status).toBe("SUCCESS");
      expect(spies.StudentRepository.resolveGenderId).toHaveBeenCalledWith("Female");
      expect(spies.StaffRepository.createStaff).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane.doe@example.com",
          designationId: 5,
          departmentId: 3,
          roleId: 5,
          genderId: 2,
          schoolId: 1,
        }),
      );
    });

    it("returns GENDER_NOT_FOUND when gender is unknown", async () => {
      const { context } = makeToolContext({ genderId: null });

      const result = await enrollStaffLogic(context as never, {
        firstName: "Jane",
        lastName: "Doe",
        gender: "Unknown",
        email: "jane.doe@example.com",
        mobile: "+1234567890",
        designation: "coordinator",
        department: "Academics",
      });

      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("GENDER_NOT_FOUND");
    });

    it("rejects callers outside the IT/coordinator/class-teacher whitelist", async () => {
      const { context } = makeToolContext({ tenant: { designationId: 2 } });

      await expect(
        enrollStaffLogic(context as never, {
          firstName: "Jane",
          lastName: "Doe",
          gender: "Female",
          email: "jane.doe@example.com",
          mobile: "+1234567890",
          designation: "coordinator",
          department: "Academics",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("updateStaffBiodataLogic", () => {
    it("updates staff biodata when staff is found", async () => {
      const { context, spies } = makeToolContext();

      const result = await updateStaffBiodataLogic(context as never, {
        staffId: 500,
        firstName: "Janet",
        mobile: "+9999999999",
      });

      expect(result.status).toBe("SUCCESS");
      expect(spies.StaffRepository.getById).toHaveBeenCalledWith(500);
      expect(spies.StaffRepository.db.update).toHaveBeenCalledWith(smStaffs);
    });

    it("returns STAFF_NOT_FOUND when staff does not exist", async () => {
      const { context, spies } = makeToolContext();
      spies.StaffRepository.getById.mockResolvedValue(null);

      const result = await updateStaffBiodataLogic(context as never, {
        staffId: 9999,
        firstName: "Janet",
      });

      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("STAFF_NOT_FOUND");
    });

    it("returns MISSING_IDENTIFIER when neither staffId nor email is provided", async () => {
      const { context } = makeToolContext();

      const result = await updateStaffBiodataLogic(context as never, {
        firstName: "Janet",
      });

      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("MISSING_IDENTIFIER");
    });
  });
});
