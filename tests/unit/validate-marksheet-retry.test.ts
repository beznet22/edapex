import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the mastra module before importing the tool. We control
// documentAgent.generate() via the `documentAgentMock` object.
const documentAgentMock = vi.fn();

vi.mock('$lib/server/mastra/index', () => ({
  get mastra() {
    return {
      getAgent: (name: string) => {
        if (name === 'document') {
          return { generate: documentAgentMock };
        }
        return undefined;
      }
    };
  }
}));

// Mock the workspace filesystem so writes don't hit the real disk.
const writeFileMock = vi.fn(async () => {});
const addEntryMock = vi.fn(async () => {});
vi.mock('$lib/server/mastra/storage/workspaces', () => ({
  get tenantWorkspace() {
    return {
      resolveFilesystem: async () => ({ writeFile: writeFileMock })
    };
  }
}));
vi.mock('$lib/server/mastra/storage/workspaces/manifest-store', () => ({
  addEntry: addEntryMock
}));
vi.mock('$lib/server/helpers/chat-helper', () => ({
  buildWorkspaceRequestContext: () => ({})
}));

// Import after mocks
const { validateMarksheetTool } = await import('$lib/server/mastra/tools/operations/reporting/marksheet/validate-marksheet');
const { marksheetSchema } = await import('$lib/schema/marksheet');

function makeTenant() {
  return {
    schoolId: 1,
    classId: 18,
    sectionId: 6,
    academicId: 4,
    examTypeId: 6,
    staffId: 4,
    userId: 4,
    role: 'admin',
    selectedClassId: 18,
    selectedSectionId: 6,
    className: 'LOWER BASIC 2',
    sectionName: 'B',
    academicYearTitle: '2025/2026'
  };
}

function makeRequestContext() {
  const store = new Map<string, unknown>();
  store.set('tenantContext', makeTenant());
  return {
    get: <T = unknown>(key: string): T | undefined => store.get(key) as T | undefined,
    set: (key: string, value: unknown) => store.set(key, value),
    store
  };
}

function minimalValidJson(): Record<string, unknown> {
  return {
    school: { id: 1, name: 'Test School', email: 'a@b.c', phone: '123', city: 'City', state: 'State', title: 'Title', vacation_date: '2026-01-01' },
    student: {
      id: 188, examId: 6, fullName: 'Test Student', gender: 'M', parentEmail: 'p@p.c',
      parentName: 'Parent', term: 'SECOND TERM', title: 'Term Report',
      category: 'LOWERBASIC', className: 'LOWER BASIC 2', sectionName: 'B',
      adminNo: 225, sessionYear: '2025/2026', daysOpened: 100, daysAbsent: 0,
      daysPresent: 100, token: ''
    },
    subjects: [{ subjectId: 21, subjectCode: 'MTH', teacherId: 4, title: 'Mathematics', type: 'CORE' }],
    records: [{
      studentId: 188, resultId: 0, subjectId: 21, subject: 'Mathematics', subjectCode: 'MTH',
      titleIds: [1, 2, 3, 4],
      titles: ['MTA', 'CA', 'REPORT', 'EXAM'],
      markIds: [1, 2, 3, 4],
      marks: [25, 8, 8, 39],
      fullMarks: [30, 10, 10, 50],
      totalScore: 80,
      grade: 'A',
      category: 'LOWERBASIC',
      learningOutcome: null,
      objectives: null
    }],
    score: {
      total: 80,
      average: 80,
      position: 1,
      outOf: 1,
      maxScores: 100,
      classAverage: {
        min: { value: '60' },
        max: { value: '95' }
      }
    },
    ratings: [{ attribute: 'Punctuality', rate: 5, color: 'green', remark: 'Good' }],
    remark: { remark: 'Well done' },
    examType: { id: 6, title: 'SECOND TERM EXAMINATION - MCH/2026' },
    academicId: 4,
    formattedMarkdown: '# Test'
  };
}

beforeEach(() => {
  documentAgentMock.mockReset();
  writeFileMock.mockClear();
  addEntryMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('validate-marksheet retry-with-feedback', () => {
  it('returns ok on the first attempt when JSON is valid', async () => {
    const valid = minimalValidJson();
    documentAgentMock.mockResolvedValueOnce({ text: JSON.stringify(valid), object: valid });

    const result = await validateMarksheetTool.execute(
      { studentId: 188, correctedMarkdown: '# Test' },
      { requestContext: makeRequestContext() as never }
    );

    expect(documentAgentMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(writeFileMock).toHaveBeenCalledWith(
      'marksheets/188.json',
      expect.any(String),
      expect.objectContaining({ recursive: true })
    );
  });

  it('retries with explicit feedback when first attempt returns invalid JSON', async () => {
    // Attempt 1: returns a JSON with missing fields
    const invalid = { school: 'wrong type', student: { id: 188 } };
    documentAgentMock.mockResolvedValueOnce({ text: JSON.stringify(invalid), object: invalid });
    // Attempt 2: returns a fully-valid JSON after seeing the feedback
    const valid = minimalValidJson();
    documentAgentMock.mockResolvedValueOnce({ text: JSON.stringify(valid), object: valid });

    const result = await validateMarksheetTool.execute(
      { studentId: 188, correctedMarkdown: '# Test' },
      { requestContext: makeRequestContext() as never }
    );

    expect(documentAgentMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    // Second prompt should include feedback from first failure
    const secondCall = documentAgentMock.mock.calls[1][0] as string;
    expect(secondCall).toMatch(/Attempt 1 failed/);
    expect(secondCall).toMatch(/school/);
  });

  it('catches structuredOutput MastraError and re-prompts with the parsed issues', async () => {
    // Attempt 1: throws MastraError with validation issues
    const err1 = new Error(
      'Structured output validation failed: - school: Invalid input: expected object, received string\n' +
        '- student.id: Invalid input: expected number, received undefined'
    );
    documentAgentMock.mockRejectedValueOnce(err1);
    // Attempt 2: returns a valid JSON
    const valid = minimalValidJson();
    documentAgentMock.mockResolvedValueOnce({ text: JSON.stringify(valid), object: valid });

    const result = await validateMarksheetTool.execute(
      { studentId: 188, correctedMarkdown: '# Test' },
      { requestContext: makeRequestContext() as never }
    );

    expect(documentAgentMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    // Second prompt should contain the parsed issues
    const secondCall = documentAgentMock.mock.calls[1][0] as string;
    expect(secondCall).toMatch(/Attempt 1 failed/);
    expect(secondCall).toMatch(/school/);
    expect(secondCall).toMatch(/student\.id/);
  });

  it('exhausts 3 attempts and returns unresolved errors when no attempt succeeds', async () => {
    documentAgentMock.mockResolvedValue({ text: '{"school":"wrong"}', object: { school: 'wrong' } });

    const result = (await validateMarksheetTool.execute(
      { studentId: 188, correctedMarkdown: '# Test' },
      { requestContext: makeRequestContext() as never }
    )) as { ok: false; errors: unknown[]; unresolvedErrors: Array<{ path: string; message: string }> };

    expect(documentAgentMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    expect(result.unresolvedErrors.length).toBeGreaterThan(0);
    // No file should be written when validation fails
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('sleeps on rate-limit errors and retries within the 3-attempt budget', async () => {
    vi.useFakeTimers();
    const rateLimitErr = new Error(
      'Rate limit reached for model `llama-3.1-8b-instant`. Please try again in 2s.'
    );
    documentAgentMock.mockRejectedValueOnce(rateLimitErr);
    const valid = minimalValidJson();
    documentAgentMock.mockResolvedValueOnce({ text: JSON.stringify(valid), object: valid });

    const promise = validateMarksheetTool.execute(
      { studentId: 188, correctedMarkdown: '# Test' },
      { requestContext: makeRequestContext() as never }
    );

    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(documentAgentMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });
});

describe('marksheetSchema sanity', () => {
  it('accepts the minimal valid JSON constructed for the test', async () => {
    const valid = minimalValidJson();
    const parsed = await marksheetSchema.safeParseAsync(valid);
    expect(parsed.success).toBe(true);
  });
});
