import { describe, expect, it } from "vitest";
import {
  checkStaffPhoto,
  STAFF_PHOTO_EXTENSIONS,
  STAFF_PHOTO_MAX_BYTES,
} from "$lib/server/people/staff-photo";

const MB = 1024 * 1024;

describe("staff photo policy", () => {
  it("accepts JPEG, PNG and WebP with an extension chosen from MIME", () => {
    expect(checkStaffPhoto("image/jpeg", 1024)).toEqual({ ok: true, extension: "jpg" });
    expect(checkStaffPhoto("image/png", 1024)).toEqual({ ok: true, extension: "png" });
    expect(checkStaffPhoto("image/webp", 1024)).toEqual({ ok: true, extension: "webp" });
    expect(STAFF_PHOTO_EXTENSIONS["image/jpeg"]).toBe("jpg");
  });

  it("rejects other MIME types even when they look like images", () => {
    for (const mime of ["image/gif", "image/svg+xml", "application/pdf", "text/plain", ""]) {
      expect(checkStaffPhoto(mime, 1024)).toEqual({
        ok: false,
        error: "Photo must be a JPEG, PNG or WebP image",
      });
    }
  });

  it("rejects empty files", () => {
    expect(checkStaffPhoto("image/png", 0)).toEqual({ ok: false, error: "Photo is empty" });
    expect(checkStaffPhoto("image/png", Number.NaN)).toEqual({
      ok: false,
      error: "Photo is empty",
    });
  });

  it("enforces the 5 MB ceiling exactly", () => {
    expect(checkStaffPhoto("image/png", STAFF_PHOTO_MAX_BYTES)).toEqual({
      ok: true,
      extension: "png",
    });
    expect(checkStaffPhoto("image/png", STAFF_PHOTO_MAX_BYTES + 1)).toEqual({
      ok: false,
      error: "Photo must be 5 MB or smaller",
    });
    expect(checkStaffPhoto("image/png", 4 * MB)).toMatchObject({ ok: true });
  });
});
