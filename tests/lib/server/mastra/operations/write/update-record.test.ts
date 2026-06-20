import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

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

vi.mock("$lib/server/repository/timeline.repo", () => ({
  TimelineRepository: class TimelineRepository {
    static build = vi.fn();
  },
}));

import { createTenantContext, ForbiddenError } from "$lib/server/mastra/tenant-context";
import { smStaffs, users } from "$lib/server/db/sms-schema";
import type { UpdateRecordPayload } from "$lib/server/mastra/tools/operations/write/update-record";
import type { ToolExecutionContext } from "@mastra/core/tools";

type UpdateRecordResult =
  | { status: "SUCCESS"; entityType: "student" | "staff" | "self"; entityId: number; message: string }
  | { status: "ERROR"; errorCode: string; message: string };

type UpdateRecordTool = {
  id: string;
  description: string;
  execute?: (input: UpdateRecordPayload, context: ToolExecutionContext) => Promise<unknown>;
  toModelOutput?: (output: unknown) => unknown;
};

describe("updateRecordTool", () => {
  type RepoSpyMap = {
    StaffRepository: {
      getById: ReturnType<typeof vi.fn>;
      db: {
        update: ReturnType<typeof vi.fn>;
      };
    };
    StudentRepository: {
      getById: ReturnType<typeof vi.fn>;
      updateStudent: ReturnType<typeof vi.fn>;
      updateStudentPhoto: ReturnType<typeof vi.fn>;
    };
    TimelineRepository: {
      createTimeline: ReturnType<typeof vi.fn>;
    };
  };

  type StaffRow = {
    id: number;
    userId: number | null;
    firstName: string;
    lastName: string;
  };

  type StudentRow = {
    id: number;
    classId: number | null;
    sectionId: number | null;
    firstName: string;
    lastName: string;
  };

  function makeDbUpdate() {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn().mockReturnValue({ set });
    return { update, set, where: set.mock.results[0]?.value };
  }

  function makeToolContext(opts: {
    tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
    staffRow?: StaffRow | null;
    studentRow?: StudentRow | null;
  } = {}) {
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

    const dbUpdate = makeDbUpdate();

    const staffRow: StaffRow | null = opts.staffRow === undefined
      ? { id: 1, userId: 200, firstName: "Old", lastName: "Name" }
      : opts.staffRow;

    const studentRow: StudentRow | null = opts.studentRow === undefined
      ? { id: 1, classId: null, sectionId: null, firstName: "Old", lastName: "Name" }
      : opts.studentRow;

    const spies: RepoSpyMap = {
      StaffRepository: {
        getById: vi.fn().mockResolvedValue(staffRow),
        db: { update: dbUpdate.update },
      },
      StudentRepository: {
        getById: vi.fn().mockResolvedValue(studentRow),
        updateStudent: vi.fn().mockResolvedValue(undefined),
        updateStudentPhoto: vi.fn().mockResolvedValue(undefined),
      },
      TimelineRepository: {
        createTimeline: vi.fn().mockResolvedValue(undefined),
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
      context: { tenantContext, getRepo, audit: { threadId: "t1", modelId: "m1" } },
      spies,
      tenantContext,
    };
  }

  let updateRecordTool: UpdateRecordTool;

  beforeEach(async () => {
    const mod = await import("$lib/server/mastra/tools/operations/write/update-record");
    updateRecordTool = mod.updateRecordTool;
  });

  function execute(payload: UpdateRecordPayload, context: unknown): Promise<UpdateRecordResult> {
    const executeFn = updateRecordTool.execute;
    if (!executeFn) {
      throw new Error("updateRecordTool.execute is not defined");
    }
    return (executeFn as unknown as (input: UpdateRecordPayload, context: unknown) => Promise<UpdateRecordResult>)(
      payload,
      context,
    );
  }

  it("updates a student record when entityType=student", async () => {
    const { context, spies, tenantContext } = makeToolContext({
      studentRow: { id: 1, classId: null, sectionId: null, firstName: "Old", lastName: "Name" },
    });

    const result = await execute(
      { entityType: "student", entityId: 1, firstName: "New" },
      context,
    );

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.entityType).toBe("student");
      expect(result.entityId).toBe(1);
    }
    expect(spies.StudentRepository.getById).toHaveBeenCalledWith(1);
    expect(spies.StudentRepository.updateStudent).toHaveBeenCalledTimes(1);
    expect(spies.StudentRepository.updateStudent).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 1, firstName: "New", fullName: "New Name" }),
    );
    expect(spies.StudentRepository.updateStudentPhoto).not.toHaveBeenCalled();
    expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        staffStudentId: 1,
        type: "behavioral",
        schoolId: tenantContext.schoolId,
        createdBy: tenantContext.userId,
      }),
    );
  });

  it("updates a staff record when entityType=staff", async () => {
    const { context, spies } = makeToolContext({
      staffRow: { id: 1, userId: 200, firstName: "Old", lastName: "Name" },
    });

    const result = await execute(
      { entityType: "staff", entityId: 1, firstName: "New" },
      context,
    );

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.entityType).toBe("staff");
      expect(result.entityId).toBe(1);
    }
    expect(spies.StaffRepository.getById).toHaveBeenCalledWith(1);
    expect(spies.StaffRepository.db.update).toHaveBeenCalledWith(smStaffs);
    const updateCalls = spies.StaffRepository.db.update.mock.results;
    const firstSetCall = updateCalls[0]?.value.set as ReturnType<typeof vi.fn>;
    expect(firstSetCall).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "New", fullName: "New Name" }),
    );
    expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ staffStudentId: 1, type: "behavioral" }),
    );
  });

  it("resolves entityId from tenantContext.staffId when entityType=self", async () => {
    const { context, spies, tenantContext } = makeToolContext({
      tenant: { staffId: 42, userId: 999 },
      staffRow: { id: 42, userId: 999, firstName: "Self", lastName: "User" },
    });

    const result = await execute(
      { entityType: "self", firstName: "Renamed" },
      context,
    );

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.entityId).toBe(tenantContext.staffId);
    }
    expect(spies.StaffRepository.getById).toHaveBeenCalledWith(tenantContext.staffId);
    expect(spies.StaffRepository.db.update).toHaveBeenCalledWith(smStaffs);
    const updateCalls = spies.StaffRepository.db.update.mock.results;
    const firstSetCall = updateCalls[0]?.value.set as ReturnType<typeof vi.fn>;
    expect(firstSetCall).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Renamed", fullName: "Renamed User" }),
    );
    expect(spies.StaffRepository.db.update).toHaveBeenCalledWith(users);
    expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        staffStudentId: tenantContext.staffId,
        createdBy: tenantContext.userId,
      }),
    );
  });

  it("throws ForbiddenError when a non-whitelisted role updates a student record", async () => {
    const { context } = makeToolContext({
      tenant: { designationId: 2 },
      studentRow: { id: 1, classId: null, sectionId: null, firstName: "Old", lastName: "Name" },
    });

    await expect(
      execute(
        { entityType: "student", entityId: 1, firstName: "New" },
        context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("writes photoPath to smStaffs.staffPhoto for entityType=self using tenantContext.staffId", async () => {
    const { context, spies, tenantContext } = makeToolContext({
      tenant: { staffId: 77, userId: 555 },
      staffRow: { id: 77, userId: 555, firstName: "Self", lastName: "User" },
    });

    const result = await execute(
      { entityType: "self", photoPath: "/path/to/photo.jpg" },
      context,
    );

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.entityId).toBe(tenantContext.staffId);
    }
    expect(spies.StaffRepository.db.update).toHaveBeenCalledWith(smStaffs);
    const updateCalls = spies.StaffRepository.db.update.mock.results;
    const photoSetCall = updateCalls.find(
      (call) => (call.value.set as ReturnType<typeof vi.fn>).mock.calls.length > 0,
    );
    expect(photoSetCall).toBeDefined();
    const setFn = photoSetCall?.value.set as ReturnType<typeof vi.fn>;
    const setArgs = setFn.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setArgs).toEqual({ staffPhoto: "/path/to/photo.jpg" });
    const whereFn = photoSetCall?.value.set.mock.results[0]?.value.where as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalledWith(eq(smStaffs.id, tenantContext.staffId));
    expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ staffStudentId: tenantContext.staffId }),
    );
  });
});
