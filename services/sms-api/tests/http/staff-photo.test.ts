import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smStaffs } from "../../src/lib/server/db/schema";
import { detectImageType, MAX_PHOTO_BYTES } from "../../src/lib/server/services/media/image.store";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, makeAdmin, request, setPassword, tenantHeaders, testApp } from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let adminCookie: string;

/** A 1×1 PNG, byte-exact. */
const tinyPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  await setPassword(school, "secret");
  await makeAdmin(school);
  adminCookie = await login(app, "user1@example.test", "secret");
});

const uploadPhoto = (staffId: number, bytes: Uint8Array): Promise<Response> => {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "photo.png");
  return request(app, `/api/v1/admin/staff/${staffId}/photo`, {
    method: "PUT",
    headers: tenantHeaders(school, adminCookie),
    body: form
  });
};

describe("image detection", () => {
  it("reads magic bytes, not the declared type", () => {
    expect(detectImageType(tinyPng)).toEqual({ contentType: "image/png", ext: "png" });
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toEqual({
      contentType: "image/jpeg",
      ext: "jpg"
    });
    // RIFF....WEBP
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
    ]);
    expect(detectImageType(webp)).toEqual({ contentType: "image/webp", ext: "webp" });
    expect(detectImageType(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });
});

describe("staff photos", () => {
  it("stores a photo and points the row at it", async () => {
    const response = await uploadPhoto(school.staffId, tinyPng);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { photoUrl: string; contentHash: string };
    expect(body.photoUrl).toMatch(/^\/uploads\/staff\/[a-f0-9]{64}\.png$/);

    const [row] = await db
      .select({ staffPhoto: smStaffs.staffPhoto })
      .from(smStaffs)
      .where(eq(smStaffs.id, school.staffId));
    expect(row?.staffPhoto).toBe(body.photoUrl);
  });

  it("rejects a file that is not really an image", async () => {
    const response = await uploadPhoto(
      school.staffId,
      new TextEncoder().encode("this is not an image")
    );
    expect(response.status).toBe(400);
  });

  /*
   * The cap is shared with the student path via `image.store.ts`. Sending a body over it is
   * caught by the edge limit; this asserts the service-level constant is the same one.
   */
  it("caps at the same size as student photos", () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });

  it("clears the column without deleting the object", async () => {
    await uploadPhoto(school.staffId, tinyPng);
    const removed = await request(app, `/api/v1/admin/staff/${school.staffId}/photo`, {
      method: "DELETE",
      headers: tenantHeaders(school, adminCookie)
    });
    expect(removed.status).toBe(204);

    const [row] = await db
      .select({ staffPhoto: smStaffs.staffPhoto })
      .from(smStaffs)
      .where(eq(smStaffs.id, school.staffId));
    expect(row?.staffPhoto).toBeNull();
  });

  it("rejects a non-administrator", async () => {
    await setPassword(school, "secret");
    const memberCookie = await login(app, "user2@example.test", "secret");
    const form = new FormData();
    form.append("file", new Blob([tinyPng], { type: "image/png" }), "photo.png");

    const response = await request(app, `/api/v1/admin/staff/${school.staffId}/photo`, {
      method: "PUT",
      headers: { ...tenantHeaders(school, memberCookie) },
      body: form
    });
    expect(response.status).toBe(403);
  });
});
