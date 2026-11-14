import { describe, expect, it } from "vitest";

import { transformDump } from "../../scripts/migration/transform/index.mjs";
import { buildDumpFixture } from "../fixtures/migration/rows";

const DIGEST = "a".repeat(64);

function transform() {
  return transformDump(buildDumpFixture(), {
    digest: DIGEST,
    now: 1_700_000_000,
    schoolId: 1,
    currentAcademicId: 4,
    targetAcademicId: 5,
    parentArchiveKey: "migration/parents/removed-test.ndjson",
    sha256: () => "email-hash"
  });
}

function rowsOf(result: ReturnType<typeof transform>, table: string): Record<string, unknown>[] {
  const value = result.tables.get(table);
  expect(value).toBeDefined();
  return [...(value?.rows ?? [])];
}

function byNumericId(rows: readonly Record<string, unknown>[]): Map<number, Record<string, unknown>> {
  return new Map(rows.map((row) => [Number(row.id), row]));
}

describe("migration transform", () => {
  it("reports the fixture's integrity findings", () => {
    const result = transform();
    expect(result.findings.R1).toBe(1);
    expect(result.findings.R2).toBe(2);
    expect(result.findings.R3).toBe(1);
    expect(result.findings.F1).toBe(1);
    expect(result.findings.F2).toBe(2);
    expect(result.findings.D1).toBe(1);
    expect(result.findings.D2).toBe(1);
    expect(result.findings.P3).toBe(3);
    expect(result.findings.P4).toBe(4);
    expect(result.findings.PASSWORDS).toBe(8);
    expect(result.findings.TERM).toBe(3);
  });

  it("normalises one current record per student", () => {
    const result = transform();
    const records = rowsOf(result, "student_records");
    const defaultsByStudent = new Map<number, number>();
    for (const record of records) {
      const studentId = Number(record.student_id);
      const count = defaultsByStudent.get(studentId) ?? 0;
      defaultsByStudent.set(studentId, count + (Number(record.is_default) === 1 ? 1 : 0));
    }
    for (const count of defaultsByStudent.values()) expect(count).toBe(1);
    const studentTwo = byNumericId(rowsOf(result, "student_records")).get(4);
    expect(studentTwo?.is_default).toBe(1);
    expect(byNumericId(rowsOf(result, "student_records")).get(3)?.is_default).toBe(0);
  });

  it("backfills placement and points current_record_id at the winner", () => {
    const result = transform();
    const students = byNumericId(rowsOf(result, "sm_students"));
    expect(students.get(1)?.class_id).toBe(12);
    expect(students.get(1)?.current_record_id).toBe(1);
    expect(students.get(2)?.class_id).toBe(12);
    expect(students.get(2)?.current_record_id).toBe(4);
    expect(students.get(5)?.current_record_id).toBeNull();
  });

  it("dedupes parents, deletes childless rows, placeholders the dangling child", () => {
    const result = transform();
    const parents = byNumericId(rowsOf(result, "sm_parents"));
    expect(parents.has(5)).toBe(false);
    expect(parents.has(3)).toBe(false);
    expect(parents.get(4)?.guardians_name).toBe("Parent Four");
    const placeholder = [...parents.values()].find((row) =>
      String(row.guardians_name).startsWith("PLACEHOLDER")
    );
    expect(placeholder).toBeDefined();
    const students = byNumericId(rowsOf(result, "sm_students"));
    expect(students.get(2)?.parent_id).toBe(4);
    expect(students.get(5)?.parent_id).toBe(Number(placeholder?.id));
    expect(result.resolutions.some((row) => row.reason === "D1_DEDUPED")).toBe(true);
    expect(result.resolutions.some((row) => row.reason === "F2_DELETED")).toBe(true);
  });

  it("creates claimable parent users and deactivates orphan users", () => {
    const result = transform();
    const users = rowsOf(result, "users");
    for (const user of users) expect(user.password).toBe(DIGEST);
    expect(users.every((user) => user.email_verified_at === null)).toBe(true);
    const parentUsers = users.filter((user) => user.usertype === "parent");
    expect(parentUsers.length).toBeGreaterThanOrEqual(4);
    const orphan = users.find((user) => user.email === "orphan@example.test");
    expect(orphan?.active_status).toBe(0);
    expect(orphan?.claim_status).toBe("flagged");
    const duplicate = users.filter((user) => user.email === "dup@example.test");
    expect(duplicate.every((user) => user.claim_status === "flagged")).toBe(true);
  });

  it("splits settings into 12 active columns plus extras", () => {
    const result = transform();
    const settings = rowsOf(result, "sm_general_settings")[0];
    expect(settings).toBeDefined();
    if (settings === undefined) throw new Error("settings fixture missing");
    expect(settings.identity).toBe("");
    expect(Object.keys(JSON.parse(String(settings.extras))).sort()).toEqual([
      "extra_one",
      "extra_two"
    ]);
  });

  it("splits term titles and keeps sequences per academic year", () => {
    const result = transform();
    const terms = rowsOf(result, "sm_exam_types");
    const yearFour = terms.filter((term) => term.academic_id === 4);
    expect(yearFour.map((term) => term.sequence).sort()).toEqual([1, 2]);
    const names = yearFour.map((term) => String(term.name));
    expect(names.some((name) => name === "FIRST TERM")).toBe(true);
    expect(names.some((name) => name.startsWith("FIRST TERM (LEGACY"))).toBe(true);
    expect(terms.every((term) => !String(term.name).endsWith(" -"))).toBe(true);
    expect(terms.every((term) => term.starts_on === null && term.ends_on === null)).toBe(true);
    expect(terms.every((term) => term.status === "closed")).toBe(true);
  });

  it("makes chat group ids unique strings and re-points memberships", () => {
    const result = transform();
    const groups = rowsOf(result, "chat_groups");
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
    expect(groups.every((group) => typeof group.id === "string")).toBe(true);
    const members = rowsOf(result, "chat_group_users");
    expect(members.every((member) => typeof member.group_id === "string")).toBe(true);
  });

  it("exports timelines and classifies photos without loading them", () => {
    const result = transform();
    expect(rowsOf(result, "sm_student_timelines")).toHaveLength(0);
    expect(result.timelines.exports).toHaveLength(1);
    expect(result.timelines.exports[0]?.rows).toBe(1);
    expect(result.photos.map((photo) => photo.kind).sort()).toEqual([
      "IMAGE",
      "IMAGE",
      "PDF_NOT_PHOTO"
    ]);
  });

  it("marks the source year active and the historical year archived", () => {
    const result = transform();
    const years = byNumericId(rowsOf(result, "sm_academic_years"));
    expect(years.get(4)?.status).toBe("active");
    expect(years.get(1)?.status).toBe("archived");
    const classes = byNumericId(rowsOf(result, "sm_classes"));
    expect(classes.get(13)?.class_name).toBe("NURSERY 1");
    expect(classes.get(22)?.class_name).toBe("MIDDLE BASIC 6");
    expect(classes.get(13)?.stage).toBe("EARLY_YEARS");
    expect(classes.get(22)?.stage).toBe("MIDDLE_BASIC");
  });
});
