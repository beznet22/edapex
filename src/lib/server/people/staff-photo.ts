/**
 * Pure policy helpers for `/api/uploads` `kind=staffPhoto`.
 *
 * Kept separate from the SvelteKit handler so the MIME/size/extension rules
 * are unit-testable without constructing a request or touching the filesystem.
 */

export const STAFF_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const STAFF_PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type StaffPhotoCheck = { ok: true; extension: string } | { ok: false; error: string };

export function checkStaffPhoto(mimeType: string, size: number): StaffPhotoCheck {
  const extension = STAFF_PHOTO_EXTENSIONS[mimeType];
  if (!extension) {
    return { ok: false, error: "Photo must be a JPEG, PNG or WebP image" };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Photo is empty" };
  }
  if (size > STAFF_PHOTO_MAX_BYTES) {
    return { ok: false, error: "Photo must be 5 MB or smaller" };
  }
  return { ok: true, extension };
}
