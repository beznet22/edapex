import { randomUUID } from "node:crypto";
import { buildScanPath, saveScanFile } from "./scan-store";
import { createEnvelope, serializeEnvelope } from "./scan-types";

/**
 * Server-side capture validation and storage.
 *
 * The client compresses to ~220 KB at 1600 px (§3c) and already strips EXIF as a side effect of
 * canvas re-encoding, but a client is never trusted: the server sniffs magic bytes, enforces its
 * own size cap, and strips metadata again before anything is written.
 */

export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

export type ImageKind = "image/jpeg" | "image/png";

export class CaptureRejectedError extends Error {
  constructor(
    message: string,
    readonly code:
      | "TOO_LARGE"
      | "NOT_AN_IMAGE"
      | "UNSUPPORTED_TYPE"
      | "METADATA_STRIP_FAILED"
      | "MISSING_DIMENSIONS"
  ) {
    super(message);
    this.name = "CaptureRejectedError";
  }
}

/** Magic bytes only — the declared MIME type and filename extension are ignored entirely. */
export const sniffImageKind = (bytes: Buffer): ImageKind | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }
  return null;
};

/**
 * Removes APP1 (EXIF + XMP) and APP13 (Photoshop IRB, which can carry IPTC and location)
 * segments from a JPEG. APP0/JFIF and APP2/ICC are kept — they affect rendering, not privacy.
 * Pure buffer surgery, so no image library is needed and the pixels are untouched.
 */
export const stripJpegMetadata = (bytes: Buffer): Buffer => {
  if (sniffImageKind(bytes) !== "image/jpeg") {
    throw new CaptureRejectedError("Not a JPEG", "NOT_AN_IMAGE");
  }

  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset < bytes.length - 3) {
    if (bytes[offset] !== 0xff) {
      // Not a marker: the remaining bytes are entropy-coded scan data; copy the rest verbatim.
      parts.push(bytes.subarray(offset));
      return Buffer.concat(parts);
    }

    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset));
      return Buffer.concat(parts);
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(offset));
      return Buffer.concat(parts);
    }

    if (offset + 4 > bytes.length) {
      throw new CaptureRejectedError("Truncated JPEG segment", "METADATA_STRIP_FAILED");
    }
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) {
      throw new CaptureRejectedError("Corrupt JPEG segment length", "METADATA_STRIP_FAILED");
    }

    const dropSegment = marker === 0xe1 || marker === 0xed;
    if (!dropSegment) parts.push(bytes.subarray(offset, end));
    offset = end;
  }

  throw new CaptureRejectedError("JPEG has no scan data", "METADATA_STRIP_FAILED");
};

/**
 * Removes PNG eXIf/tEXt/iTXt/zTXt chunks. IHDR/PLTE/IDAT/IEND and colour chunks are preserved.
 */
export const stripPngMetadata = (bytes: Buffer): Buffer => {
  if (sniffImageKind(bytes) !== "image/png") {
    throw new CaptureRejectedError("Not a PNG", "NOT_AN_IMAGE");
  }

  const signature = bytes.subarray(0, 8);
  const parts: Buffer[] = [signature];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      throw new CaptureRejectedError("Truncated PNG chunk", "METADATA_STRIP_FAILED");
    }
    const drop = type === "eXIf" || type === "tEXt" || type === "iTXt" || type === "zTXt";
    if (!drop) parts.push(bytes.subarray(offset, end));
    if (type === "IEND") break;
    offset = end;
  }

  return Buffer.concat(parts);
};

export interface CaptureInput {
  bytes: Buffer;
  studentId: number;
  examTypeId: number;
  schoolId: number;
  academicId: number;
  classId: number;
  sectionId: number;
  captureId?: string;
  source: "camera" | "rescan";
  /** Test-only override; production always uses `process.cwd()`. */
  cwd?: string;
}

export interface CaptureOutput {
  captureId: string;
  path: string;
  bytes: number;
  kind: ImageKind;
  metadata: string;
}

/**
 * Validates, strips metadata, writes the file and returns the `queued` envelope.
 *
 * The file is written with `flag: "wx"`, so a replayed `captureId` cannot silently overwrite an
 * existing capture — the caller treats `EEXIST` as "already captured" and returns 202.
 */
export async function prepareCapture(input: CaptureInput): Promise<CaptureOutput> {
  if (input.bytes.length === 0) {
    throw new CaptureRejectedError("Empty upload", "NOT_AN_IMAGE");
  }
  if (input.bytes.length > MAX_CAPTURE_BYTES) {
    throw new CaptureRejectedError(
      `Image exceeds ${MAX_CAPTURE_BYTES} bytes`,
      "TOO_LARGE"
    );
  }

  const kind = sniffImageKind(input.bytes);
  if (!kind) {
    throw new CaptureRejectedError("Upload is not a JPEG or PNG", "NOT_AN_IMAGE");
  }

  const cleaned = kind === "image/jpeg"
    ? stripJpegMetadata(input.bytes)
    : stripPngMetadata(input.bytes);

  const dimensions = kind === "image/jpeg"
    ? readJpegDimensions(cleaned)
    : readPngDimensions(cleaned);
  if (!dimensions) {
    throw new CaptureRejectedError("Could not read image dimensions", "MISSING_DIMENSIONS");
  }

  const captureId = input.captureId ?? randomUUID();
  const path = buildScanPath({
    schoolId: input.schoolId,
    academicId: input.academicId,
    examTypeId: input.examTypeId,
    studentId: input.studentId,
    captureId,
  });

  const saved = await saveScanFile({ relativePath: path, bytes: cleaned, cwd: input.cwd });

  const envelope = createEnvelope({
    captureId,
    document: { path, bytes: saved.bytes, width: dimensions.width, height: dimensions.height },
  });

  return {
    captureId,
    path,
    bytes: saved.bytes,
    kind,
    metadata: serializeEnvelope(envelope),
  };
}

/**
 * JPEG dimensions come from the SOFn marker. The client sends its own dimensions, but the server
 * reads them rather than trusting a form field.
 */
export const readJpegDimensions = (
  bytes: Buffer
): { width: number; height: number } | null => {
  if (sniffImageKind(bytes) !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
};

/** PNG dimensions live in the IHDR chunk, always first: width and height are bytes 8-15 of it. */
export const readPngDimensions = (
  bytes: Buffer
): { width: number; height: number } | null => {
  if (sniffImageKind(bytes) !== "image/png") return null;
  if (bytes.length < 24) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
