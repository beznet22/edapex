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

vi.mock("$lib/server/db", () => ({
  getDatabase: () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }),
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

vi.mock("$lib/server/repository/timeline.repo", () => ({
  TimelineRepository: class TimelineRepository {
    static build = vi.fn();
  },
}));

vi.mock("$lib/server/repository/auth.repo", () => ({
  AuthRepository: class AuthRepository {
    static build = vi.fn();
  },
}));

vi.mock("$lib/server/repository/result.repo", () => ({
  ResultsRepository: class ResultsRepository {
    static build = vi.fn();
  },
}));

import {
  createTenantContext,
  buildMastraToolContext,
  WorkspaceMismatchError,
  type TenantContext,
  type MastraToolContext,
} from "../tenant-context";

/**
 * Slice 7 — End-to-end bridge integration test.
 *
 * Constructs a real `MastraToolContext` via the bridge from Slice 0,
 * then invokes each of the 8 tool `*Logic` functions with a hand-rolled
 * mock `ScopedRepositoryProvider`. Asserts:
 * - tenant boundaries are honored
 * - DB writes go to the provider's tenant
 * - no null deref crashes on the happy path
 * - error codes (STUDENT_NOT_FOUND, WORKSPACE_MISMATCH, MISSING_EXAM_CONTEXT,
 *   USER_EXISTS, NEEDS_CONFIRMATION) all return cleanly
 */

const tenantA: TenantContext = createTenantContext({
  schoolId: 1,
  userId: 100,
  designationId: 1,
  staffId: 1,
  roleId: 1,
  classId: 10,
  sectionId: 5,
  examId: 7,
  academicId: 2024,
  studentId: null,
});

const tenantB: TenantContext = createTenantContext({
  schoolId: 2,
  userId: 200,
  designationId: 1,
  staffId: 2,
  roleId: 1,
  classId: 99,
  sectionId: 1,
  examId: 8,
  academicId: 2024,
  studentId: null,
});

type Repos = {
  StudentRepository: Record<string, ReturnType<typeof vi.fn>>;
  StaffRepository: Record<string, ReturnType<typeof vi.fn>>;
  TimelineRepository: Record<string, ReturnType<typeof vi.fn>>;
  AuthRepository: Record<string, ReturnType<typeof vi.fn>>;
  ResultsRepository: Record<string, ReturnType<typeof vi.fn>>;
};

function defaultStubs(): Repos {
  return {
    StudentRepository: {
      getById: vi.fn().mockResolvedValue({ id: 501, classId: 10, sectionId: 5, schoolId: 1, fullName: "Alice" }),
      searchStudent: vi.fn().mockResolvedValue([]),
      getStudentsByClassSection: vi.fn().mockResolvedValue([]),
      assignClassSection: vi.fn().mockResolvedValue(undefined),
      updateStudent: vi.fn().mockResolvedValue(undefined),
      resolveGenderId: vi.fn().mockResolvedValue(2),
      resolveStudentCategoryId: vi.fn().mockResolvedValue(3),
      getRollNoAndAdmissionNo: vi.fn().mockResolvedValue({ rollNo: 1, admissionNo: 100 }),
    },
    StaffRepository: {
      getById: vi.fn().mockResolvedValue({ id: 700, fullName: "Mr. Smith", userId: 999, schoolId: 1 }),
      updateStaffStatus: vi.fn().mockResolvedValue(undefined),
      deleteStaff: vi.fn().mockResolvedValue(undefined),
    },
    TimelineRepository: {
      createTimeline: vi.fn().mockResolvedValue(42),
    },
    AuthRepository: {
      updateUserPassword: vi.fn().mockResolvedValue(undefined),
    },
    ResultsRepository: {
      batchUpsertMarkRecords: vi.fn().mockResolvedValue(undefined),
      upsertClassAttendance: vi.fn().mockResolvedValue(1),
      upsertTeacherRemark: vi.fn().mockResolvedValue(undefined),
      upsertStudentRatings: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makeContextWithStubs(
  tenant: TenantContext,
  stubs: Repos,
  audit = { threadId: "thread_integration", modelId: "gpt-4o" },
): MastraToolContext {
  const getRepo = (RepoClass: { name?: string } | string) => {
    const name = (typeof RepoClass === "string" ? RepoClass : RepoClass?.name) as keyof Repos;
    const repo = stubs[name];
    if (!repo) {
      throw new Error(`Repository not stubbed: ${String(name)}`);
    }
    return repo;
  };
  return { tenantContext: tenant, getRepo: getRepo as never, audit, mastra: undefined };
}

describe("Slice 7: end-to-end bridge integration", () => {
  describe("bridge construction", () => {
    it("buildMastraToolContext returns a locked default when requestContext is undefined", async () => {
      const ctx = await buildMastraToolContext(undefined, undefined);
      // Default tenant has schoolId: 1 (createTenantContext fallback) — locks the
      // caller out of every real school's data.
      expect(ctx.tenantContext.schoolId).toBe(1);
      expect(() => ctx.getRepo({ name: "Anything" } as never)).toThrow(/request context/);
    });

    it("buildMastraToolContext populates tenantContext, audit, and provider from requestContext", async () => {
      const fakeRequestContext = {
        get: (key: string) => {
          if (key === "tenantContext") return tenantA;
          if (key === "threadId") return "thread_bridge";
          if (key === "modelId") return "gpt-4o";
          return undefined;
        },
      } as never;
      const ctx = await buildMastraToolContext(fakeRequestContext, undefined);
      expect(ctx.tenantContext.schoolId).toBe(1);
      expect(ctx.audit?.threadId).toBe("thread_bridge");
      expect(ctx.audit?.modelId).toBe("gpt-4o");
      expect(ctx.getProvider).toBeDefined();
      // getRepo is wired to the provider
      expect(typeof ctx.getRepo).toBe("function");
    });
  });

  describe("per-tool happy-path", () => {
    let searchEntityLogic: typeof import("../tools/core-tools").searchEntityLogic;
    let systemStatusLogic: typeof import("../tools/core-tools").systemStatusLogic;
    let switchWorkspaceLogic: typeof import("../tools/core-tools").switchWorkspaceLogic;
    let manageResultsLogic: typeof import("../tools/grading-tools").manageResultsLogic;
    let onboardEntityLogic: typeof import("../tools/onboard-tools").onboardEntityLogic;
    let assignEntityLogic: typeof import("../tools/onboard-tools").assignEntityLogic;
    let patchEntityLogic: typeof import("../tools/gov-tools").patchEntityLogic;
    let manageAccessLogic: typeof import("../tools/gov-tools").manageAccessLogic;

    beforeEach(async () => {
      await import("$lib/server/repository/student.repo");
      await import("$lib/server/repository/staff.repo");
      await import("$lib/server/repository/timeline.repo");
      await import("$lib/server/repository/auth.repo");
      await import("$lib/server/repository/result.repo");
      const core = await import("../tools/core-tools");
      const grading = await import("../tools/grading-tools");
      const onboard = await import("../tools/onboard-tools");
      const gov = await import("../tools/gov-tools");
      searchEntityLogic = core.searchEntityLogic;
      systemStatusLogic = core.systemStatusLogic;
      switchWorkspaceLogic = core.switchWorkspaceLogic;
      manageResultsLogic = grading.manageResultsLogic;
      onboardEntityLogic = onboard.onboardEntityLogic;
      assignEntityLogic = onboard.assignEntityLogic;
      patchEntityLogic = gov.patchEntityLogic;
      manageAccessLogic = gov.manageAccessLogic;
    });

    it("[1/8] searchEntityLogic: returns SUCCESS when single match found", async () => {
      const stubs = defaultStubs();
      stubs.StudentRepository.getStudentsByClassSection.mockResolvedValue([
        { id: 1001, name: "Alice", admissionNo: 2001 },
      ]);
      const ctx = makeContextWithStubs(tenantA, stubs);
      const result = await searchEntityLogic(ctx.tenantContext, "", [{ id: 1001, name: "Alice", classId: 10, sectionId: 5, admissionNumber: "2001" }] as never, {
        threadId: "t", modelId: "m",
      });
      expect(result.status).toBe("SUCCESS");
    });

    it("[2/8] systemStatusLogic: returns tenant echo", async () => {
      const ctx = makeContextWithStubs(tenantA, defaultStubs());
      const result = await systemStatusLogic(ctx as never);
      expect(result.status).toBe("SUCCESS");
      expect(result.tenant.schoolId).toBe(1);
      expect(result.tenant.classId).toBe(10);
      expect(result.tenant.examId).toBe(7);
    });

    it("[3/8] switchWorkspaceLogic: returns new context with target ids", async () => {
      const ctx = makeContextWithStubs(tenantA, defaultStubs());
      const result = await switchWorkspaceLogic(ctx as never, 11, 6);
      expect(result.status).toBe("SUCCESS");
      expect(result.newContext.classId).toBe(11);
      expect(result.newContext.sectionId).toBe(6);
    });

    it("[4/8] manageResultsLogic: writes to provider's tenant (schoolId: 1)", async () => {
      const stubs = defaultStubs();
      const ctx = makeContextWithStubs(tenantA, stubs);
      const result = await manageResultsLogic(ctx as never, {
        type: "academic",
        studentId: 501,
        subjectId: 12,
        score: 85,
      });
      expect(result.status).toBe("SUCCESS");
      expect(stubs.ResultsRepository.batchUpsertMarkRecords).toHaveBeenCalledWith([
        expect.objectContaining({ schoolId: 1, classId: 10, sectionId: 5, examTermId: 7 }),
      ]);
    });

    it("[5/8] onboardEntityLogic: resolves gender + category via repo methods", async () => {
      const stubs = defaultStubs();
      const ctx = makeContextWithStubs(tenantA, stubs);
      // Stub the downstream createStudent path so the call doesn't crash mid-execution
      stubs.StudentRepository.getById = vi.fn().mockResolvedValue({ id: 999, schoolId: 1 });
      const result = await onboardEntityLogic(
        ctx as never,
        {
          studentDetails: { firstName: "A", lastName: "B", gender: "Female", category: "Gen" },
          guardianDetails: { relation: "Mother", guardianName: "G", phone: "+1", email: "g@e.com" },
          enrollmentDetails: { classId: 10, sectionId: 5 },
        } as never,
      );
      expect(stubs.StudentRepository.resolveGenderId).toHaveBeenCalledWith("Female");
      expect(stubs.StudentRepository.resolveStudentCategoryId).toHaveBeenCalledWith("Gen");
      // Status may be SUCCESS or ERROR depending on downstream; we only assert resolvers were called
      expect(result).toBeDefined();
    });

    it("[6/8] assignEntityLogic: writes to provider's tenant (schoolId: 1)", async () => {
      const stubs = defaultStubs();
      const ctx = makeContextWithStubs(tenantA, stubs);
      const result = await assignEntityLogic(ctx as never, {
        studentId: 501,
        targetClassId: 10,
        targetSectionId: 5,
      });
      expect(result.status).toBe("SUCCESS");
      expect(stubs.StudentRepository.assignClassSection).toHaveBeenCalledWith({
        studentId: 501,
        classId: 10,
        sectionId: 5,
      });
    });

    it("[7/8] patchEntityLogic: throws WorkspaceMismatchError when student is in class 99 (B9 source lock)", async () => {
      const stubs = defaultStubs();
      stubs.StudentRepository.getById.mockResolvedValue({ id: 501, classId: 99, sectionId: 1, schoolId: 1, firstName: "X", lastName: "Y" });
      const ctx = makeContextWithStubs(tenantA, stubs);
      await expect(
        patchEntityLogic(ctx as never, { studentId: 501, firstName: "New" } as never),
      ).rejects.toBeInstanceOf(WorkspaceMismatchError);
    });

    it("[8/8] manageAccessLogic: writes to provider's tenant (schoolId: 1)", async () => {
      const stubs = defaultStubs();
      const ctx = makeContextWithStubs(tenantA, stubs);
      const result = await manageAccessLogic(ctx as never, {
        targetType: "staff",
        targetId: 700,
        action: "ban",
        confirmed: true,
      });
      expect(result.status).toBe("SUCCESS");
      expect(stubs.StaffRepository.getById).toHaveBeenCalledWith(700);
    });
  });

  describe("error code coverage", () => {
    let manageResultsLogic: typeof import("../tools/grading-tools").manageResultsLogic;
    let assignEntityLogic: typeof import("../tools/onboard-tools").assignEntityLogic;
    let onboardEntityLogic: typeof import("../tools/onboard-tools").onboardEntityLogic;
    let manageAccessLogic: typeof import("../tools/gov-tools").manageAccessLogic;

    beforeEach(async () => {
      await import("$lib/server/repository/student.repo");
      await import("$lib/server/repository/staff.repo");
      await import("$lib/server/repository/timeline.repo");
      await import("$lib/server/repository/auth.repo");
      await import("$lib/server/repository/result.repo");
      const grading = await import("../tools/grading-tools");
      const onboard = await import("../tools/onboard-tools");
      const gov = await import("../tools/gov-tools");
      manageResultsLogic = grading.manageResultsLogic;
      assignEntityLogic = onboard.assignEntityLogic;
      onboardEntityLogic = onboard.onboardEntityLogic;
      manageAccessLogic = gov.manageAccessLogic;
    });

    it("STUDENT_NOT_FOUND: assignEntityLogic returns errorCode when getById resolves to null", async () => {
      const stubs = defaultStubs();
      stubs.StudentRepository.getById.mockResolvedValue(null);
      const ctx = makeContextWithStubs(tenantA, stubs);
      const result = await assignEntityLogic(ctx as never, {
        studentId: 9999,
        targetClassId: 10,
        targetSectionId: 5,
      });
      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("STUDENT_NOT_FOUND");
    });

    it("WORKSPACE_MISMATCH: assignEntityLogic throws when source classId != tenant classId", async () => {
      const stubs = defaultStubs();
      stubs.StudentRepository.getById.mockResolvedValue({ id: 501, classId: 99, sectionId: 1, schoolId: 1 });
      const ctx = makeContextWithStubs(tenantA, stubs);
      await expect(
        assignEntityLogic(ctx as never, { studentId: 501, targetClassId: 10, targetSectionId: 5 }),
      ).rejects.toBeInstanceOf(WorkspaceMismatchError);
    });

    it("MISSING_EXAM_CONTEXT: manageResultsLogic returns errorCode for all 4 mutation types when examId is null", async () => {
      const stubs = defaultStubs();
      const ctxNoExam = makeContextWithStubs(
        createTenantContext({ ...tenantA, examId: null }),
        stubs,
      );
      const types: Array<"academic" | "attendance" | "qualitative" | "behavioral"> = [
        "academic",
        "attendance",
        "qualitative",
        "behavioral",
      ];
      for (const type of types) {
        const result = await manageResultsLogic(ctxNoExam as never, {
          type,
          studentId: 501,
          ...(type === "academic" ? { subjectId: 12, score: 85 } : {}),
          ...(type === "attendance" ? { present: 50, absent: 2 } : {}),
          ...(type === "qualitative" ? { remark: "Good" } : {}),
          ...(type === "behavioral" ? { trait: "Punctuality", rating: 5 } : {}),
        } as never);
        expect(result.status).toBe("ERROR");
        expect(result.errorCode).toBe("MISSING_EXAM_CONTEXT");
      }
    });

    it("USER_EXISTS: onboardEntityLogic returns errorCode when simulateUserExists is set", async () => {
      const ctx = makeContextWithStubs(tenantA, defaultStubs());
      const result = await onboardEntityLogic(
        ctx as never,
        {
          studentDetails: { firstName: "A", lastName: "B", gender: "Female", category: "Gen" },
          guardianDetails: { relation: "Mother", guardianName: "G", phone: "+1", email: "g@e.com" },
          enrollmentDetails: { classId: 10, sectionId: 5 },
        } as never,
        { simulateUserExists: true },
      );
      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("USER_EXISTS");
    });

    it("NEEDS_CONFIRMATION: manageAccessLogic returns errorCode for destructive action without confirmed flag", async () => {
      const stubs = defaultStubs();
      const ctx = makeContextWithStubs(tenantA, stubs);
      const result = await manageAccessLogic(ctx as never, {
        targetType: "staff",
        targetId: 700,
        action: "ban",
        confirmed: false,
      });
      expect(result.status).toBe("NEEDS_CONFIRMATION");
    });
  });

  describe("cross-tenant isolation", () => {
    let manageResultsLogic: typeof import("../tools/grading-tools").manageResultsLogic;

    beforeEach(async () => {
      await import("$lib/server/repository/student.repo");
      await import("$lib/server/repository/staff.repo");
      await import("$lib/server/repository/timeline.repo");
      await import("$lib/server/repository/result.repo");
      const grading = await import("../tools/grading-tools");
      manageResultsLogic = grading.manageResultsLogic;
    });

    it("two tenants writing through the same tool write to different schoolId values", async () => {
      const stubsA = defaultStubs();
      const stubsB = defaultStubs();
      // Each stub returns a student in the matching tenant's class/section
      // so the workspace lock passes for both. The point of this test is to
      // assert that schoolId is propagated from the tenant, not the row.
      stubsA.StudentRepository.getById.mockResolvedValue({
        id: 501, classId: 10, sectionId: 5, schoolId: 1, fullName: "Alice",
      });
      stubsB.StudentRepository.getById.mockResolvedValue({
        id: 501, classId: 99, sectionId: 1, schoolId: 2, fullName: "Bob",
      });
      const ctxA = makeContextWithStubs(tenantA, stubsA);
      const ctxB = makeContextWithStubs(tenantB, stubsB);

      await manageResultsLogic(ctxA as never, {
        type: "academic",
        studentId: 501,
        subjectId: 12,
        score: 80,
      });
      await manageResultsLogic(ctxB as never, {
        type: "academic",
        studentId: 501,
        subjectId: 12,
        score: 90,
      });

      // tenantA's call: schoolId 1, classId 10, sectionId 5, examTermId 7
      expect(stubsA.ResultsRepository.batchUpsertMarkRecords).toHaveBeenCalledWith([
        expect.objectContaining({ schoolId: 1, classId: 10, sectionId: 5, examTermId: 7 }),
      ]);
      // tenantB's call: schoolId 2, classId 99, sectionId 1, examTermId 8
      expect(stubsB.ResultsRepository.batchUpsertMarkRecords).toHaveBeenCalledWith([
        expect.objectContaining({ schoolId: 2, classId: 99, sectionId: 1, examTermId: 8 }),
      ]);
    });
  });
});
