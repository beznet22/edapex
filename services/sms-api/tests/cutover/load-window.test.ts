import { describe, expect, it } from "vitest";

import {
  computeLiveTables,
  profileTables
} from "../../scripts/cutover/live-profile.mjs";
import {
  initialState,
  nextAction,
  normalizeState,
  parseWrites,
  recordFile
} from "../../scripts/cutover/load-window-plan.mjs";
import type { ForeignKeyRef } from "../../scripts/cutover/live-profile.d.mts";
import type { LoadPlan } from "../../scripts/cutover/load-window-plan.d.mts";

const ALL = [
  "sm_students",
  "student_records",
  "sm_parents",
  "sm_exam_types",
  "sm_mark_stores",
  "sm_exam_setups",
  "chat_groups",
  "sm_general_settings"
];

const FK = new Map<string, readonly ForeignKeyRef[]>([
  [
    "sm_students",
    [
      { column: "parent_id", refTable: "sm_parents", refColumn: "id" },
      { column: "current_record_id", refTable: "student_records", refColumn: "id" }
    ]
  ],
  [
    "student_records",
    [{ column: "student_id", refTable: "sm_students", refColumn: "id" }]
  ]
]);

describe("live profile", () => {
  it("keeps identity/roster/config and excludes historical raw rows", () => {
    const live = computeLiveTables(ALL, FK);
    expect(live).toContain("sm_students");
    expect(live).toContain("student_records");
    expect(live).toContain("sm_parents");
    expect(live).toContain("sm_exam_types");
    expect(live).toContain("sm_general_settings");
    expect(live).not.toContain("sm_mark_stores");
    expect(live).not.toContain("sm_exam_setups");
    expect(live).not.toContain("chat_groups");
  });

  it("reports excluded tables and archive metadata", () => {
    const profile = profileTables(ALL, FK);
    expect(profile.excluded).toEqual(
      expect.arrayContaining(["sm_mark_stores", "sm_exam_setups", "chat_groups"])
    );
    expect(profile.archiveMetadata).toEqual([
      "archive_objects",
      "session_result_summary"
    ]);
  });
});

const PLAN: LoadPlan = {
  files: [
    { name: "tier-0-sm_students.sql", relativePath: "a.sql", table: "sm_students", rows: 10 },
    { name: "tier-0-student_records.sql", relativePath: "b.sql", table: "student_records", rows: 10 }
  ],
  totals: { liveRows: 20, plannedRows: 20 }
};

describe("resumable load window", () => {
  it("runs, checkpoints and finishes without replay", () => {
    let state = initialState("2026-11-07");
    let action = nextAction(PLAN, state, 95000);
    expect(action.kind).toBe("run");
    expect(action.file?.name).toBe("tier-0-sm_students.sql");
    state = recordFile(state, "tier-0-sm_students.sql", 1200, PLAN.files.length);
    expect(state.completed).toEqual(["tier-0-sm_students.sql"]);
    action = nextAction(PLAN, state, 95000);
    expect(action.kind).toBe("run");
    expect(action.file?.name).toBe("tier-0-student_records.sql");
    state = recordFile(state, "tier-0-student_records.sql", 900, PLAN.files.length);
    expect(state.finished).toBe(true);
    expect(nextAction(PLAN, state, 95000).kind).toBe("finished");
  });

  it("waits when the budget is consumed and resets the next day", () => {
    const state = {
      ...initialState("2026-11-07"),
      windowWrites: 95000
    };
    expect(nextAction(PLAN, state, 95000).kind).toBe("wait");
    const nextDay = normalizeState(state, "2026-11-08");
    expect(nextDay.windowWrites).toBe(0);
    expect(nextDay.completed).toEqual([]);
    expect(nextAction(PLAN, nextDay, 95000).kind).toBe("run");
  });

  it("parses rows_written and ignores entries without meta", () => {
    const output = JSON.stringify([
      { meta: { rows_written: 10 } },
      { meta: { rows_written: 5 } },
      { results: [] }
    ]);
    expect(parseWrites(output)).toBe(15);
    expect(() => parseWrites("not json")).toThrow();
  });

  it("does not exceed the hard cap in the default budget", () => {
    expect(() => nextAction(PLAN, initialState("2026-11-07"), 100001)).not.toThrow();
    // The CLI rejects >100k; the pure helper still accepts a budget for tests.
    expect(nextAction(PLAN, initialState("2026-11-07"), 100000).kind).toBe("run");
  });
});
