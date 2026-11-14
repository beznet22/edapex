import { describe, expect, it } from "vitest";

import {
  matchStudent,
  type MatchContext,
  type MatchEvidence,
  type RosterCandidate
} from "../../src/lib/server/services/domain";

const roster: readonly RosterCandidate[] = [
  { id: 1, name: "TEST STUDENT", admissionNo: 123 },
  { id: 2, name: "OTHER STUDENT", admissionNo: 456 }
];

const context: MatchContext = {
  className: "K1",
  sectionName: "C",
  category: "NURSERY"
};

const evidence = (overrides: Partial<MatchEvidence> = {}): MatchEvidence => ({
  fullName: "TEST STUDENT",
  admissionNo: null,
  classLabel: "1C",
  category: "NURSERY",
  ...overrides
});

describe("student matcher", () => {
  it("suggests a unique name match and flags the class label mismatch", () => {
    const result = matchStudent(evidence(), roster, context);

    expect(result.status).toBe("suggested");
    expect(result.studentId).toBe(1);
    expect(result.method).toBe("name");
    expect(result.warnings).toContain("class_label_mismatch");
  });

  it("uses an exact admission number as corroboration, never as the only key", () => {
    const result = matchStudent(
      evidence({ fullName: "STUDENT TEST", admissionNo: "ADM/123" }),
      roster,
      context
    );

    expect(result.status).toBe("suggested");
    expect(result.studentId).toBe(1);
    expect(result.method).toBe("admission_no");
  });

  it("does not suggest when a non-empty admission number disagrees", () => {
    const result = matchStudent(
      evidence({ admissionNo: "999" }),
      roster,
      context
    );

    expect(result.status).toBe("ambiguous");
    expect(result.studentId).toBeNull();
    expect(result.candidates[0]?.reasons).toContain("admission_mismatch");
  });

  it("marks duplicate names ambiguous instead of guessing", () => {
    const result = matchStudent(
      evidence(),
      [
        { id: 10, name: "TEST STUDENT", admissionNo: null },
        { id: 11, name: "TEST STUDENT", admissionNo: null }
      ],
      context
    );

    expect(result.status).toBe("ambiguous");
    expect(result.studentId).toBeNull();
    expect(result.warnings).toContain("duplicate_name");
  });

  it("returns unbound when no candidate is close enough", () => {
    const result = matchStudent(
      evidence({ fullName: "NOBODY AT ALL" }),
      roster,
      context
    );

    expect(result.status).toBe("unbound");
    expect(result.studentId).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("flags a category mismatch", () => {
    const result = matchStudent(
      evidence({ category: "GRADEK" }),
      roster,
      context
    );
    expect(result.warnings).toContain("category_mismatch");
  });
});
