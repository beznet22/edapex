import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createSessionToken,
  isRecord,
  makeAdmin,
  numberField,
  request,
  stringField,
  tenantHeaders,
  testApp
} from "./support/http";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
});

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected a JSON object");
  return body;
};

describe("workspace capability endpoint", () => {
  it("returns the authenticated teacher manifest", async () => {
    const session = await createSessionToken(`user${school.schoolId}@example.test`);
    const response = await request(
      testApp(),
      "/api/v1/agent/capabilities",
      { headers: tenantHeaders(school, session.cookie) }
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(stringField(body, "role")).toBe("teacher");
    const packs = Array.isArray(body.packs) ? body.packs : [];
    expect(packs.length).toBe(1);
  });
});

describe("admin issue endpoint", () => {
  it("rejects non-admin access and serves the queue to an admin", async () => {
    const session = await createSessionToken(`user${school.schoolId}@example.test`);
    const denied = await request(
      testApp(),
      "/api/v1/admin/issues",
      { headers: tenantHeaders(school, session.cookie) }
    );
    expect(denied.status).toBe(403);

    await makeAdmin(school);
    const allowed = await request(
      testApp(),
      "/api/v1/admin/issues",
      { headers: tenantHeaders(school, session.cookie) }
    );
    expect(allowed.status).toBe(200);
    const body = await readJson(allowed);
    expect(numberField(body, "total")).not.toBeNull();
    expect(numberField(body, "page")).toBe(1);
  });
});
