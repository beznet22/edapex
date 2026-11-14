import { describe, expect, it } from "vitest";

import {
  STUDENT_CODE_ALPHABET,
  STUDENT_CODE_LENGTH,
  formatStudentCode,
  generateStudentCode,
  normaliseCode
} from "../../src/lib/server/services";

describe("student code normalisation", () => {
  it("generates 12 unambiguous Crockford characters", () => {
    const codes = new Set<string>();
    for (let index = 0; index < 10_000; index += 1) {
      const code = generateStudentCode();
      expect(code).toHaveLength(STUDENT_CODE_LENGTH);
      for (const character of code) {
        expect(STUDENT_CODE_ALPHABET).toContain(character);
      }
      codes.add(code);
    }
    expect(codes.size).toBe(10_000);
  });

  it("folds separators and the Crockford look-alikes", () => {
    expect(normaliseCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normaliseCode("il-o0-1234-5678")).toBe("110012345678");
    expect(normaliseCode("  ABCD EFGH JKMN  ")).toBe("ABCDEFGHJKMN");
  });

  it("prints groups of four and leaves short input alone", () => {
    expect(formatStudentCode("ABCDEFGHJKMN")).toBe("ABCD-EFGH-JKMN");
    expect(formatStudentCode("ABC")).toBe("ABC");
  });
});
