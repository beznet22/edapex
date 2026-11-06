import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smStudents } from "../../src/lib/server/db/schema";
import { app } from "../../src/lib/server/http/app";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { StudentPhotoService } from "../../src/lib/server/services/media";
import { PortError, ValidationError } from "../../src/lib/server/services/errors";
import { sha256Hex } from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: StudentPhotoService;

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
const pngBytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    StudentPhotoService,
    createServiceContext({ DB: env.DB, MEDIA: env.MEDIA }, tenantOf(school))
  );
});

describe("student photo storage", () => {
  it("stores a content-addressed image in R2 and keeps the URL relative", async () => {
    const result = await service.save({
      studentId: school.studentId,
      file: new Blob([pngBytes], { type: "image/png" })
    });

    expect(result.photoUrl).toMatch(/^\/uploads\/students\/[a-f0-9]{64}\.png$/);
    expect(result.photoUrl).toBe(`/uploads/students/${result.contentHash}.png`);
    expect(result.contentType).toBe("image/png");
    expect(result.cached).toBe(false);

    const stored = await env.MEDIA.get(result.photoUrl.slice(1));
    expect(stored).not.toBeNull();
    if (stored === null) return;
    const bytes = new Uint8Array(await stored.arrayBuffer());
    await expect(sha256Hex(bytes)).resolves.toBe(result.contentHash);

    const rows = await db
      .select({ studentPhoto: smStudents.studentPhoto })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(rows[0]?.studentPhoto).toBe(result.photoUrl);
  });

  it("dedupes identical bytes and returns the existing object", async () => {
    const first = await service.save({
      studentId: school.studentId,
      file: new Blob([pngBytes], { type: "image/png" })
    });
    const second = await service.save({
      studentId: school.studentId,
      file: new Blob([pngBytes], { type: "image/png" })
    });

    expect(second.cached).toBe(true);
    expect(second.photoUrl).toBe(first.photoUrl);
  });

  it("rejects PDFs and non-images", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\nnot a photo");
    await expect(
      service.save({
        studentId: school.studentId,
        file: new Blob([pdf], { type: "application/pdf" })
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails visibly when the R2 binding is absent", async () => {
    const unbound = createService(
      StudentPhotoService,
      createServiceContext({ DB: env.DB }, tenantOf(school))
    );
    await expect(
      unbound.save({
        studentId: school.studentId,
        file: new Blob([pngBytes], { type: "image/png" })
      })
    ).rejects.toBeInstanceOf(PortError);
  });
});

describe("GET /uploads/students/:file", () => {
  it("serves the image with immutable cache headers", async () => {
    const stored = await service.save({
      studentId: school.studentId,
      file: new Blob([pngBytes], { type: "image/png" })
    });
    const file = stored.photoUrl.split("/").pop();
    expect(file).toBeDefined();

    const response = await app.request(
      `/uploads/students/${file ?? ""}`,
      undefined,
      { DB: env.DB, MEDIA: env.MEDIA }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("etag")).not.toBeNull();
    const bytes = new Uint8Array(await response.arrayBuffer());
    await expect(sha256Hex(bytes)).resolves.toBe(stored.contentHash);
  });

  it("returns 404 for a missing object or a non-hash filename", async () => {
    const missing = "0".repeat(64);
    await expect(
      app.request(`/uploads/students/${missing}.png`, undefined, {
        DB: env.DB,
        MEDIA: env.MEDIA
      })
    ).resolves.toMatchObject({ status: 404 });

    await expect(
      app.request("/uploads/students/not-a-photo.png", undefined, {
        DB: env.DB,
        MEDIA: env.MEDIA
      })
    ).resolves.toMatchObject({ status: 404 });
  });
});
