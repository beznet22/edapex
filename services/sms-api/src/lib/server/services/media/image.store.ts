import type { PhotoStore } from "../ports/photo-store.port";
import { sha256Hex } from "../crypto/digest";
import { ValidationError } from "../errors";

/**
 * The one place an uploaded image is validated and stored.
 *
 * Student photos had this inline; staff photos need exactly the same rules. Duplicating it
 * would let the two drift — one accepting WebP while the other rejects it, or a size cap
 * changed in one place only. The rules are the kind that must be identical, because the
 * person uploading has no way to tell which object type they are talking to.
 *
 * Validation reads **magic bytes**, never the declared MIME type: a browser will happily
 * label a `.exe` as `image/png`, and the filename is caller-controlled.
 */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoKind = "students" | "staff";

export interface StoredImage {
  readonly photoUrl: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly bytes: number;
  /** True when identical bytes were already in the store. */
  readonly cached: boolean;
}

interface ImageType {
  readonly contentType: string;
  readonly ext: "jpg" | "png" | "webp";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const asciiAt = (bytes: Uint8Array, offset: number, value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
};

export const detectImageType = (bytes: Uint8Array): ImageType | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  if (bytes.length >= 12 && asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
};

/** Accepts a stored URL for either object kind; used by the "adopt" paths. */
export const photoUrlPattern = (kind: PhotoKind): RegExp =>
  new RegExp(`^/uploads/${kind}/([a-f0-9]{64})\\.(jpe?g|png|webp)$`, "i");

/**
 * Validates `file`, writes it content-addressed, and returns the URL to persist.
 *
 * Does **not** touch a row. The caller owns that write, because the compensation differs:
 * a student photo failure must delete a freshly written object, while a staff photo failure
 * may not. Keeping the row write outside means the store stays a pure function of bytes.
 */
export async function storePhoto(
  photos: PhotoStore,
  kind: PhotoKind,
  file: Blob
): Promise<StoredImage> {
  if (file.size === 0) {
    throw new ValidationError("The uploaded photo is empty", "file");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new ValidationError("Photos must be 5 MB or smaller", "file");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImageType(bytes);
  if (image === null) {
    throw new ValidationError("Photos must be JPEG, PNG or WebP images", "file");
  }

  const contentHash = await sha256Hex(bytes);
  const key = `uploads/${kind}/${contentHash}.${image.ext}`;
  const photoUrl = `/${key}`;
  const cached = await photos.head(key);
  if (!cached) {
    await photos.put(key, bytes, image.contentType, contentHash);
  }

  return {
    photoUrl,
    contentHash,
    contentType: image.contentType,
    bytes: bytes.byteLength,
    cached
  };
}

/** Best-effort removal of an object written for a row update that then failed. */
export async function discardPhoto(
  photos: PhotoStore,
  stored: StoredImage
): Promise<void> {
  if (stored.cached) return;
  try {
    await photos.delete(stored.photoUrl.replace(/^\//, ""));
  } catch {
    // Content-addressed objects are shared and harmless if the cleanup misses.
  }
}
