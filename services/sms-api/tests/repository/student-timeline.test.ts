import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createTimeline,
  createTimelineIfNotExist,
  deleteTimeline,
  findTimelineById,
  listTimelinesByExam,
  listTimelinesByStudent,
  updateTimeline,
  upsertTimelines
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

describe("student timelines", () => {
  it("creates, reads and updates a timeline", async () => {
    const id = await createTimeline(first, {
      staffStudentId: schools[0].studentId,
      title: "First observation",
      date: "2026-10-01",
      description: "Settled well",
      type: "general",
      visibleToStudent: 1,
      activeStatus: 1
    });
    expect(id).toBeGreaterThan(0);

    const rows = await listTimelinesByStudent(first, schools[0].studentId);
    expect(rows.map((row) => row.id)).toEqual([id]);
    await expect(findTimelineById(first, id)).resolves.toMatchObject({
      title: "First observation"
    });

    await updateTimeline(first, id, { title: "Updated observation" });
    await expect(findTimelineById(first, id)).resolves.toMatchObject({
      title: "Updated observation"
    });
  });

  it("creates only once per student, type and year", async () => {
    const existing = await createTimelineIfNotExist(first, {
      staffStudentId: schools[0].studentId,
      type: "general",
      title: "Duplicate"
    });
    const rows = await listTimelinesByStudent(first, schools[0].studentId);
    expect(existing).toBe(rows[0]?.id);
    expect(rows).toHaveLength(1);
  });

  it("upserts the year's timeline and reads exam-scoped entries", async () => {
    const id = await upsertTimelines(first, {
      staffStudentId: schools[0].studentId,
      title: "Year summary",
      type: `exam-${schools[0].termId}`
    });
    const exams = await listTimelinesByExam(first, schools[0].studentId, schools[0].termId);
    expect(exams.map((row) => row.id)).toEqual([id]);

    const again = await upsertTimelines(first, {
      staffStudentId: schools[0].studentId,
      title: "Year summary updated",
      type: `exam-${schools[0].termId}`
    });
    expect(again).toBe(id);
  });

  it("deletes only its own tenant's timeline", async () => {
    const rows = await listTimelinesByStudent(first, schools[0].studentId);
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("fixture timeline missing");

    await expect(findTimelineById(second, id)).resolves.toBeNull();
    await deleteTimeline(first, id);
    await expect(findTimelineById(first, id)).resolves.toBeNull();
  });

  it("returns nothing for another tenant's student", async () => {
    await expect(
      listTimelinesByStudent(second, schools[0].studentId)
    ).resolves.toEqual([]);
  });
});
