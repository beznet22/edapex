import { describe, expect, it } from "vitest";

import { compareTasks, deriveTaskState, needsPerson } from "@edapex/contracts";
import { NO_SIGNALS } from "@edapex/contracts";

/**
 * The Tasks surface derives everything it renders from shared contracts, so what
 * is worth testing here is that it agrees with them — the derivation itself is
 * covered in `packages/contracts`.
 */
describe("tasks surface derivation", () => {
  it("sorts by triage rank, not by insertion order", () => {
    const rows = [
      { state: deriveTaskState({ ...NO_SIGNALS, resolved: true }), createdAt: 1 },
      { state: deriveTaskState({ ...NO_SIGNALS, openQuestion: true }), createdAt: 900 },
      { state: deriveTaskState({ ...NO_SIGNALS, running: true }), createdAt: 5 }
    ];
    expect([...rows].sort(compareTasks).map((row) => row.state)).toEqual([
      "needs_you",
      "running",
      "done"
    ]);
  });

  it("counts only states a person can act on", () => {
    const states = ["needs_you", "blocked", "running", "didnt_work", "done"] as const;
    // Same predicate the surface uses for its header badge.
    expect(states.filter(needsPerson)).toHaveLength(2);
  });

  it("never reports done from silence", () => {
    // An unfinished task with no signals is not a success.
    expect(deriveTaskState(NO_SIGNALS)).not.toBe("done");
  });
});
