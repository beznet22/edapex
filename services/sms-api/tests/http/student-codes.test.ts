import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authCodes, users } from "../../src/lib/server/db/schema";
import { sha256Hex } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  isRecord,
  login,
  request,
  tenantHeaders,
  testApp
} from "./support/http";
import { cookiePair } from "./support/auth";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let cookie: string;

const jsonHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...extra,
  "content-type": "application/json"
});

const issueBody = (studentIds: readonly number[]) =>
  JSON.stringify({ studentIds });

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await db.insert(users).values({
    id: 101,
    fullName: "Code Administrator",
    email: "code-admin@example.test",
    password: await sha256Hex("admin-secret"),
    isAdministrator: "yes",
    schoolId: 1
  });
  cookie = await login(app, "code-admin@example.test", "admin-secret");
});

describe("student code routes", () => {
  it("requires a tenant and an administrator", async () => {
    const missingTenant = await request(app, "/api/v1/admin/student-codes/issue", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: issueBody([school.studentId])
    });
    expect(missingTenant.status).toBe(400);
    expect(await missingTenant.json()).toMatchObject({ error: "VALIDATION_FAILED" });

    await db.insert(users).values({
      id: 180,
      fullName: "Plain Staff",
      email: "plain@example.test",
      password: await sha256Hex("plain-secret"),
      schoolId: 1
    });
    const plainCookie = await login(app, "plain@example.test", "plain-secret");
    const forbidden = await request(app, "/api/v1/admin/student-codes/issue", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, plainCookie)),
      body: issueBody([school.studentId])
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: "FORBIDDEN" });
  });

  it("issues a code and stores only the hash", async () => {
    const response = await request(app, "/api/v1/admin/student-codes/issue", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: issueBody([school.studentId])
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const codes =
      isRecord(body) && Array.isArray(body["codes"]) ? body["codes"] : [];
    const first = codes[0];
    if (!isRecord(first) || typeof first["code"] !== "string") {
      throw new Error("issue did not return a code");
    }
    expect(first["studentId"]).toBe(school.studentId);

    const [row] = await db
      .select({ codeHash: authCodes.codeHash })
      .from(authCodes)
      .where(
        and(
          eq(authCodes.subjectId, school.studentId),
          isNull(authCodes.revokedAt)
        )
      );
    expect(row?.codeHash).toBe(await sha256Hex(first["code"]));
  });

  it("prints a CSV sheet at issuance", async () => {
    const response = await request(app, "/api/v1/admin/student-codes/issue", {
      method: "POST",
      headers: jsonHeaders({
        ...tenantHeaders(school, cookie),
        accept: "text/csv"
      }),
      body: issueBody([school.studentId])
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const csv = await response.text();
    const [header, line] = csv.split("\n");
    expect(header).toBe("student_name,admission_no,class,section,code");
    expect(line).toContain("Student 1");
  });

  it("signs a student in with a code and revokes on reissue", async () => {
    const issue = await request(app, "/api/v1/admin/student-codes/issue", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: issueBody([school.studentId])
    });
    const issueBodyJson: unknown = await issue.json();
    const code =
      isRecord(issueBodyJson) &&
      Array.isArray(issueBodyJson["codes"]) &&
      isRecord(issueBodyJson["codes"][0]) &&
      typeof issueBodyJson["codes"][0]["code"] === "string"
        ? issueBodyJson["codes"][0]["code"]
        : null;
    if (code === null) throw new Error("issue did not return a code");

    const loginResponse = await request(app, "/api/v1/auth/code", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code })
    });
    expect(loginResponse.status).toBe(200);
    const session = cookiePair(loginResponse, "__Host-edapex_session");
    if (session === null) throw new Error("code login did not set a session");
    expect((await request(app, "/api/v1/me", { headers: { cookie: session } })).status).toBe(
      200
    );

    const reissue = await request(app, `/api/v1/admin/student-codes/${school.studentId}/reissue`, {
      method: "POST",
      headers: tenantHeaders(school, cookie)
    });
    expect(reissue.status).toBe(200);

    expect(
      (await request(app, "/api/v1/auth/code", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ code })
      })).status
    ).toBe(401);
    expect((await request(app, "/api/v1/me", { headers: { cookie: session } })).status).toBe(
      401
    );

    const reissued: unknown = await reissue.json();
    const newCode =
      isRecord(reissued) &&
      isRecord(reissued["code"]) &&
      typeof reissued["code"]["code"] === "string"
        ? reissued["code"]["code"]
        : null;
    if (newCode === null) throw new Error("reissue did not return a code");

    const mobile = await request(app, "/api/v1/auth/mobile/code", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code: newCode })
    });
    expect(mobile.status).toBe(200);
    const mobileBody: unknown = await mobile.json();
    expect(isRecord(mobileBody) && typeof mobileBody["token"] === "string").toBe(true);
  });

  it("revokes a code and rejects malformed or unknown input", async () => {
    const revoke = await request(app, `/api/v1/admin/student-codes/${school.studentId}`, {
      method: "DELETE",
      headers: tenantHeaders(school, cookie)
    });
    expect(revoke.status).toBe(204);

    const malformed = await request(app, "/api/v1/auth/code", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code: "nope" })
    });
    expect(malformed.status).toBe(401);
    expect(await malformed.json()).toMatchObject({ error: "UNAUTHENTICATED" });

    const missing = await request(app, "/api/v1/admin/student-codes/999999/reissue", {
      method: "POST",
      headers: tenantHeaders(school, cookie)
    });
    expect(missing.status).toBe(404);
  });

  it("validates the issue body", async () => {
    const empty = await request(app, "/api/v1/admin/student-codes/issue", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: JSON.stringify({ studentIds: [] })
    });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });
});
