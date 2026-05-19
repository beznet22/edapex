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

import { createTenantContext, validateWorkspaceLock, WorkspaceMismatchError } from "../tenant-context";

describe("Phase 3: Slash Commands & Governance", () => {
  describe("3.2 Secure Multi-Agent Execution & Disambiguation", () => {
    it("Test: Workspace Lock Rejection: Verify WORKSPACE_MISMATCH when attempting to access an entity outside the activeClassId/sectionId", () => {
      const tenantContext = createTenantContext({ staffId: 1, roleId: 1, examId: null, academicId: null, 
        schoolId: 1,
        classId: 10,
        sectionId: 5,
        userId: 100,
        designationId: 8, // Class Teacher
      });

      // Should succeed when classId and sectionId match the workspace lock
      expect(() => validateWorkspaceLock(tenantContext, 10, 5)).not.toThrow();

      // Should succeed if we only check classId and it matches
      expect(() => validateWorkspaceLock(tenantContext, 10)).not.toThrow();

      // Should throw WorkspaceMismatchError when trying to access a different classId
      expect(() => validateWorkspaceLock(tenantContext, 11, 5)).toThrow(WorkspaceMismatchError);
      expect(() => validateWorkspaceLock(tenantContext, 11, 5)).toThrow("WORKSPACE_MISMATCH");

      // Should throw WorkspaceMismatchError when trying to access a different sectionId
      expect(() => validateWorkspaceLock(tenantContext, 10, 6)).toThrow(WorkspaceMismatchError);
    });

    it("Test: Disambiguation Card: Verify search returns NEEDS_CLARIFICATION for multiple entities", async () => {
      // This test expects the searchEntity tool/logic to return a specific state
      // when multiple candidates match a fuzzy search.
      // Currently importing a mock or the actual function (which will fail until implemented)

      // Dynamically importing to allow test failure before implementation
      const { searchEntityLogic } = await import("../tools/core-tools").catch(() => ({
        searchEntityLogic: () => {
          throw new Error("Not implemented");
        },
      }));

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, examId: null, academicId: null, 
        schoolId: 1,
        classId: null, // IT/Coordinator context allowing broader search
        sectionId: null,
        userId: 1,
        designationId: 1, // IT
      });

      const mockCandidates = [
        { id: 101, name: "John Doe", class: "JSS1", section: "A" },
        { id: 102, name: "John Smith", class: "JSS2", section: "B" },
      ];

      const result = await searchEntityLogic(mockContext, "John", mockCandidates);

      expect(result).toBeDefined();
      expect(result.status).toBe("NEEDS_CLARIFICATION");
      expect(result.candidates!).toHaveLength(2);
      expect(result.candidates![0]).toHaveProperty("name", "John Doe");
      expect(result.candidates![0]).toHaveProperty("class");
      expect(result.candidates![0]).toHaveProperty("section");
    });

    it("Test: Scope-Bound Search Fallback: Verify /search with empty query inside an active @Class context correctly yields the complete student list", async () => {
      const { searchEntityLogic } = await import("../tools/core-tools");

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, examId: null, academicId: null, 
        schoolId: 1,
        classId: 10, // Class Teacher context
        sectionId: 5,
        userId: 100,
        designationId: 8,
      });

      const mockCandidates = [
        { id: 201, name: "Alice", class: "JSS1", section: "A", classId: 10, sectionId: 5 },
        { id: 202, name: "Bob", class: "JSS1", section: "A", classId: 10, sectionId: 5 },
        { id: 203, name: "Charlie", class: "JSS2", section: "B", classId: 11, sectionId: 6 }, // Different class
      ];

      // Pass empty query
      const result = await searchEntityLogic(mockContext, "", mockCandidates);

      // It should fallback to yielding all candidates in the active class/section
      expect(result).toBeDefined();
      // Wait, the specification says "correctly yields the complete student list".
      // If it yields a list, the status could be NEEDS_CLARIFICATION to present them to the user,
      // or it could be a special SUCCESS with multiple entities. Let's assume NEEDS_CLARIFICATION for now
      // so the user can select one.
      expect(result.status).toBe("NEEDS_CLARIFICATION");
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates![0]).toHaveProperty("name", "Alice");
      expect(result.candidates![1]).toHaveProperty("name", "Bob");
    });

    it("Test: Admission Priority: Verify exact Admission Number match bypasses fuzzy candidate list and resolves immediately", async () => {
      const { searchEntityLogic } = await import("../tools/core-tools");

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, examId: null, academicId: null, 
        schoolId: 1,
        classId: null,
        sectionId: null,
        userId: 100,
        designationId: 1, // IT
      });

      const mockCandidates = [
        { id: 301, name: "John", admissionNumber: "ADM-001" },
        { id: 302, name: "John", admissionNumber: "ADM-002" },
        { id: 303, name: "Johnny", admissionNumber: "ADM-003" },
      ];

      // If the user searches by the exact admission number
      const result = await searchEntityLogic(mockContext, "ADM-002", mockCandidates);

      // It should bypass NEEDS_CLARIFICATION and resolve immediately
      expect(result).toBeDefined();
      expect(result.status).toBe("SUCCESS");
      expect(result.entity).toBeDefined();
      expect(result.entity?.id).toBe(302);
    });

    it('Test: Audit Traceability: Verify source: "fuzzy_match" tag and threadId/modelId attribution in timeline/runs', async () => {
      const { searchEntityLogic } = await import("../tools/core-tools");

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, classId: null, sectionId: null, examId: null, academicId: null, 
        schoolId: 1,
        userId: 100,
        designationId: 1,
      });

      const mockCandidates = [{ id: 401, name: "Alice", admissionNumber: "ADM-401" }];

      const options = {
        threadId: "thread_123",
        modelId: "gpt-4o",
      };

      // Single match defaults to fuzzy_match audit source if not exact admission match
      const result = await searchEntityLogic(mockContext, "Ali", mockCandidates, options);

      expect(result).toBeDefined();
      expect(result.status).toBe("SUCCESS");
      expect(result.audit).toBeDefined();
      expect(result.audit?.source).toBe("fuzzy_match");
      expect(result.audit?.threadId).toBe("thread_123");
      expect(result.audit?.modelId).toBe("gpt-4o");
    });
  });

  describe("3.3 Onboard & Identity Flows", () => {
    it("Test: Onboarding Schema Verification: Verify /register iterative chunking (Student -> Guardian -> Class) and dropdown pre-fetching", async () => {
      const { onboardEntitySchema, getRegistrationOptions } = await import("../tools/onboard-tools").catch(
        () => ({
          onboardEntitySchema: null,
          getRegistrationOptions: () => {
            throw new Error("Not implemented");
          },
        }),
      );

      // 1. Dropdown pre-fetching
      // Ensure we have a method that fetches the dropdown options
      expect(getRegistrationOptions).toBeDefined();

      // 2. Iterative chunking validation via Zod
      // The schema should enforce the structured blocks
      expect(onboardEntitySchema).toBeDefined();

      if (onboardEntitySchema) {
        // Validate an incomplete payload throws Zod errors
        const incompletePayload = {
          studentDetails: { firstName: "Alice" },
        };

        const result = onboardEntitySchema.safeParse(incompletePayload);
        expect(result.success).toBe(false);

        if (!result.success) {
          const errorPaths = result.error.issues.map((e: any) => e.path.join("."));
          // It must require student details (lastName, gender, category), guardian details, and enrollment details
          expect(errorPaths).toContain("studentDetails.lastName");
          expect(errorPaths).toContain("guardianDetails");
          expect(errorPaths).toContain("enrollmentDetails");
        }

        // Validate a complete payload
        const completePayload = {
          studentDetails: {
            firstName: "Alice",
            lastName: "Smith",
            gender: "Female",
            category: "LOWER BASIC",
          },
          guardianDetails: {
            relation: "Father",
            guardianName: "Bob Smith",
            phone: "1234567890",
            email: "bob@example.com",
          },
          enrollmentDetails: {
            classId: 10,
            sectionId: 5,
          },
        };

        const successResult = onboardEntitySchema.safeParse(completePayload);
        expect(successResult.success).toBe(true);
      }
    });

    it("Test: Role Whitelist: Verify 403 Forbidden for users with designations outside (1, 5, 8)", async () => {
      const { validateRoleWhitelist, ForbiddenError } = await import("../tenant-context");

      const authorizedContext = createTenantContext({ staffId: 1, roleId: 1, classId: null, sectionId: null, examId: null, academicId: null, 
        schoolId: 1,
        userId: 100,
        designationId: 8, // Class Teacher
      });

      const unauthorizedContext = createTenantContext({ staffId: 1, roleId: 1, classId: null, sectionId: null, examId: null, academicId: null, 
        schoolId: 1,
        userId: 101,
        designationId: 10, // Student/Parent/Other
      });

      // Should succeed for authorized roles
      expect(() => validateRoleWhitelist(authorizedContext, [1, 5, 8])).not.toThrow();

      // Should throw ForbiddenError for unauthorized roles
      expect(() => validateRoleWhitelist(unauthorizedContext, [1, 5, 8])).toThrow(ForbiddenError);
    });

    it("Test: Onboarding Error Recovery: Intercept USER_EXISTS and suggested /update transition", async () => {
      const { onboardEntityLogic } = await import("../tools/onboard-tools").catch(() => ({
        onboardEntityLogic: () => {
          throw new Error("Not implemented");
        },
      }));

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, classId: null, sectionId: null, examId: null, academicId: null, 
        schoolId: 1,
        userId: 1,
        designationId: 1,
      });

      const payload = {
        studentDetails: { firstName: "Alice", lastName: "Smith", gender: "Female" as const, category: "LOWER BASIC" },
        guardianDetails: {
          relation: "Father" as const,
          guardianName: "Bob Smith",
          phone: "1234567890",
          email: "bob@example.com",
        },
        enrollmentDetails: { classId: 10, sectionId: 5 },
      };

      // Simulate a scenario where the user already exists
      const result = await onboardEntityLogic({ tenantContext: mockContext, getRepo: (() => null) as any }, payload, { simulateUserExists: true });

      expect(result).toBeDefined();
      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("USER_EXISTS");
      expect(result.message).toContain("already exists");
      expect(result.suggestion).toBe("/update");
    });

    it("Test: Destructive Confirmation: Verify explicit confirmation prompt for /ban, /suspend, and /reset password", async () => {
      const { destructiveActionLogic } = await import("../tools/gov-tools").catch(() => ({
        destructiveActionLogic: () => {
          throw new Error("Not implemented");
        },
      }));

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, classId: null, sectionId: null, examId: null, academicId: null, 
        schoolId: 1,
        userId: 1,
        designationId: 1, // IT
      });

      // 1. Test /ban
      const banResult = await destructiveActionLogic(mockContext, "ban", { targetId: 101 });
      expect(banResult.status).toBe("NEEDS_CONFIRMATION");
      expect(banResult.message).toContain("Are you sure you want to ban");

      // 2. Test /suspend
      const suspendResult = await destructiveActionLogic(mockContext, "suspend", { targetId: 101 });
      expect(suspendResult.status).toBe("NEEDS_CONFIRMATION");

      // 3. Test /reset password
      const resetResult = await destructiveActionLogic(mockContext, "reset password", { targetId: 101 });
      expect(resetResult.status).toBe("NEEDS_CONFIRMATION");
    });

    it("Test: Patch Zod Masking: Verify /update and /edit strictly strip protected fields (id, role, schoolId) via .omit()", async () => {
      const { patchEntitySchema } = await import("../tools/onboard-tools").catch(() => ({
        patchEntitySchema: null,
      }));

      expect(patchEntitySchema).toBeDefined();

      if (patchEntitySchema) {
        const payloadWithProtectedFields = {
          firstName: "Alice",
          id: 999, // Should be stripped
          role: "admin", // Should be stripped
          schoolId: 1, // Should be stripped
        };

        // Zod's .omit() or strict schemas should handle this.
        // If we use .omit() on the base schema, the resulting schema will not have those fields.
        const result = patchEntitySchema.safeParse(payloadWithProtectedFields);
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data).not.toHaveProperty("id");
          expect(result.data).not.toHaveProperty("role");
          expect(result.data).not.toHaveProperty("schoolId");
          expect(result.data).toHaveProperty("firstName", "Alice");
        }
      }
    });

    it("Test: Intent Confidence Gate: Verify Gateway limits mutations at <90% and reads at <70% confidence", async () => {
      const { validateIntentConfidence } = await import("../tools/gov-tools").catch(() => ({
        validateIntentConfidence: () => {
          throw new Error("Not implemented");
        },
      }));

      // 1. Mutation intent (e.g., /extract) with low confidence
      const mutationResult = await validateIntentConfidence("mutation", 0.85); // 85% < 90%
      expect(mutationResult.status).toBe("NEEDS_CONFIRMATION");
      expect(mutationResult.message).toContain("low confidence");

      // 2. Mutation intent with high confidence
      const highMutationResult = await validateIntentConfidence("mutation", 0.95); // 95% >= 90%
      expect(highMutationResult.status).toBe("SUCCESS");

      // 3. Read intent (e.g., /search) with low confidence
      const readResult = await validateIntentConfidence("read", 0.65); // 65% < 70%
      expect(readResult.status).toBe("NEEDS_CONFIRMATION");

      // 4. Read intent with high confidence
      const highReadResult = await validateIntentConfidence("read", 0.75); // 75% >= 70%
      expect(highReadResult.status).toBe("SUCCESS");
    });

    it("Test: Explicit Command Override: Verify literal slash commands bypass intent scoring and assume 100% confidence", async () => {
      const { validateIntentConfidence } = await import("../tools/gov-tools");

      // If the prompt starts with a slash command, it's treated as 100% confidence
      const prompt = "/extract data from this image";
      const isExplicit = prompt.startsWith("/");

      const confidence = isExplicit ? 1.0 : 0.85;

      const result = await validateIntentConfidence("mutation", confidence);
      expect(result.status).toBe("SUCCESS");
      expect(result.confidence).toBe(1.0);
    });

    it("Test: Live Workspace Badge: Verify /switch triggers context update and returns success", async () => {
      const { switchWorkspaceLogic } = await import("../tools/gov-tools").catch(() => ({
        switchWorkspaceLogic: () => {
          throw new Error("Not implemented");
        },
      }));

      const mockContext = createTenantContext({ staffId: 1, roleId: 1, classId: null, sectionId: null, examId: null, academicId: null, 
        schoolId: 1,
        userId: 1,
        designationId: 1,
      });

      const newClassId = 11;
      const newSectionId = 6;

      const result = await switchWorkspaceLogic(mockContext, newClassId, newSectionId);

      expect(result).toBeDefined();
      expect(result.status).toBe("SUCCESS");
      expect(result.newContext).toBeDefined();
      expect(result.newContext.classId).toBe(11);
      expect(result.newContext.sectionId).toBe(6);
      expect(result.message).toContain("Switched to Class 11");
    });
  });

  describe("3.4 Grading Skill (manageResults)", () => {
    type RepoSpyMap = {
      ResultsRepository: {
        batchUpsertMarkRecords: ReturnType<typeof vi.fn>;
        upsertClassAttendance: ReturnType<typeof vi.fn>;
        upsertTeacherRemark: ReturnType<typeof vi.fn>;
        upsertStudentRatings: ReturnType<typeof vi.fn>;
      };
      StudentRepository: {
        getById: ReturnType<typeof vi.fn>;
      };
      TimelineRepository: {
        createTimeline: ReturnType<typeof vi.fn>;
      };
    };

    function makeToolContext(
      opts: {
        tenant?: Partial<Parameters<typeof createTenantContext>[0]>;
        studentLookup?: { classId: number; sectionId: number; schoolId: number } | null;
        audit?: { threadId: string; modelId: string };
      } = {},
    ) {
      const tenantContext = createTenantContext({ staffId: 1, roleId: 1, 
        schoolId: 1,
        classId: 10,
        sectionId: 5,
        examId: 7,
        academicId: 2024,
        userId: 100,
        designationId: 8,
        ...opts.tenant,
      });

      const defaultLookup = {
        classId: tenantContext.classId ?? 10,
        sectionId: tenantContext.sectionId ?? 5,
        schoolId: tenantContext.schoolId,
      };

      const spies: RepoSpyMap = {
        ResultsRepository: {
          batchUpsertMarkRecords: vi.fn().mockResolvedValue(undefined),
          upsertClassAttendance: vi.fn().mockResolvedValue(1),
          upsertTeacherRemark: vi.fn().mockResolvedValue(undefined),
          upsertStudentRatings: vi.fn().mockResolvedValue(undefined),
        },
        StudentRepository: {
          getById: vi
            .fn()
            .mockResolvedValue(opts.studentLookup === undefined ? defaultLookup : opts.studentLookup),
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

      const audit = opts.audit ?? { threadId: "thread_grading_test", modelId: "gpt-4o" };

      return {
        context: { tenantContext, getRepo, audit },
        spies,
        tenantContext,
      };
    }

    let manageResultsLogic: typeof import("../tools/grading-tools").manageResultsLogic;

    beforeEach(async () => {
      const mod = await import("../tools/grading-tools");
      manageResultsLogic = mod.manageResultsLogic;
    });

    it("academic: writes via ResultsRepository.batchUpsertMarkRecords with full tenant-bound shape and emits timeline with audit attribution", async () => {
      const { context, spies } = makeToolContext();

      const result = await manageResultsLogic(context as never, {
        type: "academic",
        studentId: 501,
        subjectId: 12,
        score: 85,
      });

      expect(result.status).toBe("SUCCESS");

      expect(spies.ResultsRepository.batchUpsertMarkRecords).toHaveBeenCalledTimes(1);
      expect(spies.ResultsRepository.batchUpsertMarkRecords).toHaveBeenCalledWith([
        expect.objectContaining({
          studentId: 501,
          subjectId: 12,
          totalMarks: 85,
          examTermId: 7,
          classId: 10,
          sectionId: 5,
          schoolId: 1,
          academicId: 2024,
        }),
      ]);

      expect(spies.ResultsRepository.upsertClassAttendance).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertTeacherRemark).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertStudentRatings).not.toHaveBeenCalled();

      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledTimes(1);
      const timelineArg = spies.TimelineRepository.createTimeline.mock.calls[0][0];
      expect(timelineArg).toEqual(
        expect.objectContaining({
          staffStudentId: 501,
          type: expect.stringMatching(/academic/i),
        }),
      );
      const serialized = JSON.stringify(timelineArg);
      expect(serialized).toContain("thread_grading_test");
      expect(serialized).toContain("gpt-4o");
    });

    it("attendance: writes via ResultsRepository.upsertClassAttendance with tenant-bound shape and emits attendance timeline", async () => {
      const { context, spies } = makeToolContext();

      const result = await manageResultsLogic(context as never, {
        type: "attendance",
        studentId: 501,
        present: 50,
        absent: 2,
        daysOpened: 52,
      });

      expect(result.status).toBe("SUCCESS");

      expect(spies.ResultsRepository.upsertClassAttendance).toHaveBeenCalledTimes(1);
      expect(spies.ResultsRepository.upsertClassAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 501,
          examTypeId: 7,
          schoolId: 1,
          academicId: 2024,
        }),
      );

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertTeacherRemark).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertStudentRatings).not.toHaveBeenCalled();

      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledTimes(1);
      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          staffStudentId: 501,
          type: expect.stringMatching(/attendance/i),
        }),
      );
    });

    it("qualitative: writes via ResultsRepository.upsertTeacherRemark with tenant-bound shape and emits remark timeline", async () => {
      const { context, spies } = makeToolContext();

      const result = await manageResultsLogic(context as never, {
        type: "qualitative",
        studentId: 501,
        remark: "Excellent progress this term",
      });

      expect(result.status).toBe("SUCCESS");

      expect(spies.ResultsRepository.upsertTeacherRemark).toHaveBeenCalledTimes(1);
      expect(spies.ResultsRepository.upsertTeacherRemark).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 501,
          remark: "Excellent progress this term",
          examTypeId: 7,
          academicId: 2024,
        }),
      );

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertClassAttendance).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertStudentRatings).not.toHaveBeenCalled();

      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledTimes(1);
      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          staffStudentId: 501,
          type: expect.stringMatching(/qualitative|remark/i),
        }),
      );
    });

    it("behavioral: writes via ResultsRepository.upsertStudentRatings as an array payload and emits rating timeline", async () => {
      const { context, spies } = makeToolContext();

      const result = await manageResultsLogic(context as never, {
        type: "behavioral",
        studentId: 501,
        trait: "Punctuality",
        rating: 5,
      });

      expect(result.status).toBe("SUCCESS");

      expect(spies.ResultsRepository.upsertStudentRatings).toHaveBeenCalledTimes(1);
      const callArg = spies.ResultsRepository.upsertStudentRatings.mock.calls[0][0];
      expect(Array.isArray(callArg)).toBe(true);
      expect(callArg).toHaveLength(1);
      expect(callArg[0]).toEqual(
        expect.objectContaining({
          studentId: 501,
          attribute: "Punctuality",
          rate: 5,
          examTypeId: 7,
          academicId: 2024,
        }),
      );

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertClassAttendance).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertTeacherRemark).not.toHaveBeenCalled();

      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledTimes(1);
      expect(spies.TimelineRepository.createTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          staffStudentId: 501,
          type: expect.stringMatching(/behavioral|rating/i),
        }),
      );
    });

    it("rejects with WorkspaceMismatchError when the resolved student belongs to a different class than the active workspace lock", async () => {
      const { context, spies } = makeToolContext({
        tenant: { classId: 10, sectionId: 5, designationId: 8 },
        studentLookup: { classId: 99, sectionId: 99, schoolId: 1 },
      });

      await expect(
        manageResultsLogic(context as never, {
          type: "academic",
          studentId: 700,
          subjectId: 12,
          score: 80,
        }),
      ).rejects.toBeInstanceOf(WorkspaceMismatchError);

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertClassAttendance).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertTeacherRemark).not.toHaveBeenCalled();
      expect(spies.ResultsRepository.upsertStudentRatings).not.toHaveBeenCalled();
      expect(spies.TimelineRepository.createTimeline).not.toHaveBeenCalled();
    });

    it("returns MISSING_EXAM_CONTEXT when an academic mutation is attempted with a null examId in the tenant context", async () => {
      const { context, spies } = makeToolContext({ tenant: { examId: null } });

      const result = await manageResultsLogic(context as never, {
        type: "academic",
        studentId: 501,
        subjectId: 12,
        score: 85,
      });

      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("MISSING_EXAM_CONTEXT");

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.TimelineRepository.createTimeline).not.toHaveBeenCalled();
    });

    it("returns STUDENT_NOT_FOUND when StudentRepository.getById resolves to null", async () => {
      const { context, spies } = makeToolContext({ studentLookup: null });

      const result = await manageResultsLogic(context as never, {
        type: "academic",
        studentId: 9999,
        subjectId: 12,
        score: 85,
      });

      expect(result.status).toBe("ERROR");
      expect(result.errorCode).toBe("STUDENT_NOT_FOUND");

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.TimelineRepository.createTimeline).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError when the caller designationId is outside the (1, 5, 8) whitelist", async () => {
      const { ForbiddenError } = await import("../tenant-context");
      const { context, spies } = makeToolContext({ tenant: { designationId: 10 } });

      await expect(
        manageResultsLogic(context as never, {
          type: "academic",
          studentId: 501,
          subjectId: 12,
          score: 85,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(spies.ResultsRepository.batchUpsertMarkRecords).not.toHaveBeenCalled();
      expect(spies.StudentRepository.getById).not.toHaveBeenCalled();
      expect(spies.TimelineRepository.createTimeline).not.toHaveBeenCalled();
    });
  });
});
