import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { reportSettings } from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findReportSettings,
  upsertReportSettings
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

describe("report settings repository", () => {
  it("returns null before the first write", async () => {
    await expect(findReportSettings(first)).resolves.toBeNull();
  });

  it("upserts one row per school and re-reads the payload", async () => {
    const payload = JSON.stringify({ principalName: "First Principal" });
    await upsertReportSettings(first, payload, 1_700_000_000);

    const row = await findReportSettings(first);
    expect(row?.schoolId).toBe(schools[0].schoolId);
    expect(row?.payload).toBe(payload);
    expect(row?.updatedAt).toBe(1_700_000_000);

    const nextPayload = JSON.stringify({ principalName: "Second Principal" });
    await upsertReportSettings(first, nextPayload, 1_700_000_100);
    await expect(findReportSettings(first)).resolves.toMatchObject({
      payload: nextPayload,
      updatedAt: 1_700_000_100
    });
  });

  it("keeps tenants isolated", async () => {
    await upsertReportSettings(second, JSON.stringify({ principalName: "Other" }), 1_700_000_000);

    await expect(findReportSettings(first)).resolves.toMatchObject({
      payload: JSON.stringify({ principalName: "Second Principal" })
    });
    await expect(findReportSettings(second)).resolves.toMatchObject({
      payload: JSON.stringify({ principalName: "Other" })
    });

    const rows = await db
      .select()
      .from(reportSettings)
      .where(eq(reportSettings.schoolId, schools[1].schoolId));
    expect(rows).toHaveLength(1);
  });
});
