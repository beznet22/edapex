import { describe, expect, it } from "vitest";

import {
  groupQuarantine,
  quarantineCsv,
  quarantineDocument
} from "../../src/lib/server/services/migration/quarantine";
import type { QuarantineRow } from "../../src/lib/server/services/migration/quarantine";

const rows: readonly QuarantineRow[] = [
  {
    studentId: 1,
    fullName: "Ada, One",
    admissionNo: 10,
    guardianName: "Guardian One",
    guardianPhone: "0801",
    className: "MIDDLE BASIC 6",
    reason: "UNPLACED"
  },
  {
    studentId: 2,
    fullName: "Beta Two",
    admissionNo: 11,
    guardianName: "Guardian Two",
    guardianPhone: "0802",
    className: "MIDDLE BASIC 6",
    reason: "NO_CURRENT_RECORD"
  },
  {
    studentId: 3,
    fullName: "Gamma Three",
    admissionNo: 12,
    guardianName: "Guardian Three",
    guardianPhone: "0803",
    className: "NO CLASS",
    reason: "NO_CURRENT_RECORD"
  }
];

describe("quarantine report", () => {
  it("groups by class and preserves the required columns", () => {
    const view = groupQuarantine(5, rows);
    expect(view.total).toBe(3);
    expect(view.groups.map((group) => group.className)).toEqual([
      "MIDDLE BASIC 6",
      "NO CLASS"
    ]);
    const document = quarantineDocument(view, 1000);
    expect(document.templateVersion).toBe("quarantine-v1");
    expect(document.total).toBe(3);
    expect(document.columns).toContain("guardian_phone");
  });

  it("escapes commas and prints one CSV row per student", () => {
    const csv = quarantineCsv(groupQuarantine(5, rows));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "student_name,admission_no,guardian_name,guardian_phone,class,reason"
    );
    expect(lines).toHaveLength(4);
    expect(csv).toContain('"Ada, One"');
  });
});
