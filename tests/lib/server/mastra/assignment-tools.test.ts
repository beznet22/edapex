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

vi.mock("$lib/server/repository/assignment.repo", () => ({
  AssignmentRepository: class AssignmentRepository {
    static build = vi.fn();
  },
}));

import { createTenantContext, ForbiddenError } from "$lib/server/mastra/tenant-context";

describe("Assignment tools", () => {
  type RepoSpyMap = {
    AssignmentRepository: {
      assignClassTeacher: ReturnType<typeof vi.fn>;
      assignSubjectTeacher: ReturnType<typeof vi.fn>;
    };
  };

  function makeToolContext(
    opts: {
      tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
    } = {},
  ) {
    const tenantContext = createTenantContext({
      staffId: 10,
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
      AssignmentRepository: {
        assignClassTeacher: vi.fn().mockResolvedValue({ assignClassTeacherId: 9001 }),
        assignSubjectTeacher: vi.fn().mockResolvedValue(undefined),
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

  let assignStaffToClassLogic: typeof import("$lib/server/mastra/tools/operations/write/assign-staff-to-class").assignStaffToClassLogic;
  let assignStaffToSubjectLogic: typeof import("$lib/server/mastra/tools/operations/write/assign-staff-to-subject").assignStaffToSubjectLogic;
  let teacherSelfAssignClassLogic: typeof import("$lib/server/mastra/tools/operations/write/teacher-self-assign-class").teacherSelfAssignClassLogic;

  beforeEach(async () => {
    const assignmentMod = await import("$lib/server/repository/assignment.repo");
    void assignmentMod.AssignmentRepository;
    const classMod = await import("$lib/server/mastra/tools/operations/write/assign-staff-to-class");
    const subjectMod = await import("$lib/server/mastra/tools/operations/write/assign-staff-to-subject");
    const selfMod = await import("$lib/server/mastra/tools/operations/write/teacher-self-assign-class");
    assignStaffToClassLogic = classMod.assignStaffToClassLogic;
    assignStaffToSubjectLogic = subjectMod.assignStaffToSubjectLogic;
    teacherSelfAssignClassLogic = selfMod.teacherSelfAssignClassLogic;
  });

  describe("assignStaffToClassLogic", () => {
    it("assigns a staff member as class teacher for the requested class/section", async () => {
      const { context, spies } = makeToolContext();

      const result = await assignStaffToClassLogic(context as never, {
        staffId: 42,
        classId: 10,
        sectionId: 5,
      });

      expect(result.status).toBe("SUCCESS");
      expect(spies.AssignmentRepository.assignClassTeacher).toHaveBeenCalledTimes(1);
      expect(spies.AssignmentRepository.assignClassTeacher).toHaveBeenCalledWith({
        staffId: 42,
        classId: 10,
        sectionId: 5,
      });
    });

    it("rejects callers outside the IT/coordinator whitelist", async () => {
      const { context } = makeToolContext({ tenant: { designationId: 8 } });

      await expect(
        assignStaffToClassLogic(context as never, {
          staffId: 42,
          classId: 10,
          sectionId: 5,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("assignStaffToSubjectLogic", () => {
    it("assigns a staff member as subject teacher", async () => {
      const { context, spies } = makeToolContext();

      const result = await assignStaffToSubjectLogic(context as never, {
        staffId: 42,
        classId: 10,
        sectionId: 5,
        subjectId: 3,
      });

      expect(result.status).toBe("SUCCESS");
      expect(spies.AssignmentRepository.assignSubjectTeacher).toHaveBeenCalledTimes(1);
      expect(spies.AssignmentRepository.assignSubjectTeacher).toHaveBeenCalledWith({
        staffId: 42,
        classId: 10,
        sectionId: 5,
        subjectId: 3,
      });
    });
  });

  describe("teacherSelfAssignClassLogic", () => {
    it("lets the active staff assign themselves as class teacher", async () => {
      const { context, spies, tenantContext } = makeToolContext({ tenant: { staffId: 7, designationId: 8 } });

      const result = await teacherSelfAssignClassLogic(context as never, {
        classId: 10,
        sectionId: 5,
      });

      expect(result.status).toBe("SUCCESS");
      expect(spies.AssignmentRepository.assignClassTeacher).toHaveBeenCalledWith({
        staffId: tenantContext.staffId,
        classId: 10,
        sectionId: 5,
      });
    });

    it("rejects non-staff callers", async () => {
      const { context } = makeToolContext({ tenant: { staffId: 0 } });

      await expect(
        teacherSelfAssignClassLogic(context as never, {
          classId: 10,
          sectionId: 5,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
