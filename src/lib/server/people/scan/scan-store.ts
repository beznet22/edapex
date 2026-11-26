import { and, eq } from "drizzle-orm";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { getDatabase } from "$lib/server/db";
import { teacherRemarks } from "$lib/server/db/sms-schema";
import { assertWritableKey } from "./scan-access";
import {
  parseEnvelope,
  serializeEnvelope,
  type ScanEnvelope,
  type ScanStatusKey,
} from "./scan-types";

/**
 * `storage/` is a persisted Docker volume (`compose.yml`); `static/uploads` is publicly served,
 * so scans must never land there. The path is built from numeric IDs plus a capture id only —
 * no admission number, so renumbering cannot orphan a file (plan §5).
 */
export const SCAN_STORAGE_ROOT = "storage/marks-scans";

const ID_SEGMENT = /^\d+$/;
const CAPTURE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface ScanPathParts {
  schoolId: number;
  academicId: number;
  examTypeId: number;
  studentId: number;
  captureId: string;
}

export const assertSafeId = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label} for scan path: ${String(value)}`);
  }
  return value;
};

export const assertSafeCaptureId = (captureId: string): string => {
  if (!CAPTURE_ID.test(captureId)) {
    throw new Error(`Invalid captureId: ${captureId}`);
  }
  return captureId;
};

/** Relative path stored in the envelope, e.g. `storage/marks-scans/1/4/2/802/<uuid>.jpg`. */
export const buildScanPath = (parts: ScanPathParts): string => {
  const segments = [
    String(assertSafeId(parts.schoolId, "schoolId")),
    String(assertSafeId(parts.academicId, "academicId")),
    String(assertSafeId(parts.examTypeId, "examTypeId")),
    String(assertSafeId(parts.studentId, "studentId")),
  ];
  return [SCAN_STORAGE_ROOT, ...segments, `${assertSafeCaptureId(parts.captureId)}.jpg`].join("/");
};

/**
 * Resolves a stored relative path to an absolute one, rejecting traversal and anything outside
 * the scan root. Every read goes through this — a path is never trusted from the client.
 */
export const resolveScanPath = (relativePath: string, cwd = process.cwd()): string => {
  if (relativePath.startsWith("/") || relativePath.includes("..") || relativePath.includes("\\")) {
    throw new Error("Unsafe scan path");
  }

  const rootSegments = SCAN_STORAGE_ROOT.split("/");
  const segments = relativePath.split("/");

  if (segments.length !== rootSegments.length + 5) {
    throw new Error("Unexpected scan path depth");
  }
  if (!rootSegments.every((expected, index) => segments[index] === expected)) {
    throw new Error("Scan path is outside the scan root");
  }
  if (!segments.slice(rootSegments.length, -1).every((segment) => ID_SEGMENT.test(segment))) {
    throw new Error("Unexpected scan path segment");
  }
  if (!CAPTURE_ID.test(segments.at(-1)!.replace(/\.jpg$/, "")) || !segments.at(-1)!.endsWith(".jpg")) {
    throw new Error("Unexpected scan filename");
  }

  const root = resolve(cwd, SCAN_STORAGE_ROOT);
  const absolute = resolve(cwd, relativePath);
  if (!absolute.startsWith(root + sep)) {
    throw new Error("Scan path escapes storage root");
  }
  return absolute;
};

export const scanFileExists = async (
  relativePath: string,
  cwd = process.cwd()
): Promise<boolean> => {
  try {
    const info = await stat(resolveScanPath(relativePath, cwd));
    return info.isFile();
  } catch {
    return false;
  }
};

export interface SaveScanFileInput {
  relativePath: string;
  bytes: Buffer;
  cwd?: string;
}

export interface SavedScanFile {
  path: string;
  bytes: number;
}

export const saveScanFile = async (input: SaveScanFileInput): Promise<SavedScanFile> => {
  const absolute = resolveScanPath(input.relativePath, input.cwd ?? process.cwd());
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, input.bytes, { flag: "wx" });
  return { path: input.relativePath, bytes: input.bytes.length };
};

export const readScanFile = async (
  relativePath: string,
  cwd = process.cwd()
): Promise<Buffer> => readFile(resolveScanPath(relativePath, cwd));


export interface ScanKey {
  studentId: number;
  examTypeId: number;
  academicId: number;
}

/**
 * Reads the envelope for one (student, exam, academic). Returns null for a missing row, a row
 * with no metadata, or metadata that is not a valid envelope — legacy and corrupt values are
 * indistinguishable to callers, which is what keeps `not_uploaded` cheap.
 */
export async function readScanEnvelope(key: ScanKey): Promise<ScanEnvelope | null> {
  const db = await getDatabase();
  const [row] = await db
    .select({ metadata: teacherRemarks.metadata })
    .from(teacherRemarks)
    .where(
      and(
        eq(teacherRemarks.studentId, key.studentId),
        eq(teacherRemarks.examTypeId, key.examTypeId),
        eq(teacherRemarks.academicId, key.academicId)
      )
    )
    .limit(1);
  return parseEnvelope(row?.metadata);
}

export interface WriteScanEnvelopeInput extends ScanKey {
  envelope: ScanEnvelope;
}

/**
 * Writes the envelope without touching `remark`.
 *
 * `ON DUPLICATE KEY UPDATE` sets only `metadata` and `updatedAt`, mirroring
 * `ResultsRepository.upsertTeacherRemark` (which sets only `remark`). The two writers therefore
 * never clobber each other. Refuses to write a nullable key (see `assertWritableKey`).
 */
export async function writeScanEnvelope(input: WriteScanEnvelopeInput): Promise<void> {
  const key = assertWritableKey(input);
  const db = await getDatabase();
  await db
    .insert(teacherRemarks)
    .values({
      studentId: key.studentId,
      examTypeId: key.examTypeId,
      academicId: key.academicId,
      metadata: serializeEnvelope(input.envelope),
    })
    .onDuplicateKeyUpdate({
      set: { metadata: serializeEnvelope(input.envelope), updatedAt: new Date() },
    });
}
