import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smStudents } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  isRecord,
  login,
  request,
  setPassword,
  stringField,
  tenantHeaders,
  testApp
} from "./support/http";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
const pngBytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));

const db = database(env);
const app = testApp();
let school: SeededSchool;
let cookie: string;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "secret");
  cookie = await login(app, "user1@example.test", "secret");
});

const photoUrlOf = async (response: Response): Promise<string> => {
  const body: unknown = await response.json();
  const url = stringField(body, "photoUrl");
  if (url === null) throw new Error("photo response has no photoUrl");
  return url;
};

describe("student photo routes", () => {
  it("uploads, claims and removes a content-addressed photo", async () => {
    const form = new FormData();
    form.set("file", new File([pngBytes], "avatar.png", { type: "image/png" }));
    const upload = await request(
      app,
      `/api/v1/students/${school.studentId}/photo`,
      {
        method: "PUT",
        headers: tenantHeaders(school, cookie),
        body: form
      }
    );
    expect(upload.status).toBe(200);
    const photoUrl = await photoUrlOf(upload);
    expect(photoUrl).toMatch(/^\/uploads\/students\/[a-f0-9]{64}\.png$/);

    const stored = await env.MEDIA.get(photoUrl.slice(1));
    expect(stored).not.toBeNull();
    const rows = await db
      .select({ studentPhoto: smStudents.studentPhoto })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(rows[0]?.studentPhoto).toBe(photoUrl);

    const claim = await request(
      app,
      `/api/v1/students/${school.studentId}/photo/claim`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({ url: photoUrl })
      }
    );
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({
      studentId: school.studentId,
      photoUrl
    });

    const remove = await request(
      app,
      `/api/v1/students/${school.studentId}/photo`,
      {
        method: "DELETE",
        headers: tenantHeaders(school, cookie)
      }
    );
    expect(remove.status).toBe(204);
    const cleared = await db
      .select({ studentPhoto: smStudents.studentPhoto })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(cleared[0]?.studentPhoto).toBeNull();
  });

  it("rejects a non-image upload with the file path", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new TextEncoder().encode("%PDF-1.7\nnot a photo")], "book.pdf", {
        type: "application/pdf"
      })
    );
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/photo`,
      {
        method: "PUT",
        headers: tenantHeaders(school, cookie),
        body: form
      }
    );
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "VALIDATION_FAILED" });
    expect(isRecord(body) && typeof body["message"] === "string").toBe(true);
    expect(stringField(body, "message")).toContain("file");
  });

  it("rejects a missing file", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/photo`,
      {
        method: "PUT",
        headers: tenantHeaders(school, cookie),
        body: new FormData()
      }
    );
    expect(response.status).toBe(400);
    expect(stringField(await response.json(), "message")).toContain("file");
  });

  it("returns 404 for a claim whose object is missing", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/photo/claim`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          url: `/uploads/students/${"a".repeat(64)}.png`
        })
      }
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "NOT_FOUND" });
  });

  it("rejects a claim URL that is not content-addressed", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/photo/claim`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({ url: "https://example.com/avatar.png" })
      }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });
});
