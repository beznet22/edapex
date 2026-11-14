import {
  archiveManifestSchema,
  type ArchiveManifest,
  type ArchiveManifestGap,
  type ArchiveStatus
} from "../../../schema/archive";

export interface ManifestObjectInput {
  readonly studentId: number;
  readonly objectKey: string;
  readonly checksum: string;
  readonly bytes: number;
  readonly version: number;
  readonly status: ArchiveStatus;
}

export interface BuildManifestParams {
  readonly schoolId: number;
  readonly sessionId: number;
  readonly generatedAt: number;
  readonly expectedStudentIds: readonly number[];
  readonly objects: readonly ManifestObjectInput[];
  readonly terms: readonly number[];
  readonly extraGaps?: readonly ArchiveManifestGap[];
}

/** Coverage is computed from the index and the session roster, never guessed. */
export function buildArchiveManifest(params: BuildManifestParams): ArchiveManifest {
  const archivedIds = new Set(
    params.objects
      .filter((object) => object.status !== "quarantined")
      .map((object) => object.studentId)
  );
  const quarantinedIds = new Set(
    params.objects
      .filter((object) => object.status === "quarantined")
      .map((object) => object.studentId)
  );
  const expected = new Set(params.expectedStudentIds);
  const missing = [...expected]
    .filter((studentId) => !archivedIds.has(studentId) && !quarantinedIds.has(studentId))
    .sort((a, b) => a - b);

  const gaps: ArchiveManifestGap[] = [
    ...missing.map((studentId) => ({ studentId, reason: "missing" as const })),
    ...params.objects
      .filter((object) => object.status === "quarantined")
      .map((object) => ({ studentId: object.studentId, reason: "checksum_mismatch" as const })),
    ...(params.extraGaps ?? [])
  ];

  return archiveManifestSchema.parse({
    schemaVersion: 1,
    schoolId: params.schoolId,
    sessionId: params.sessionId,
    generatedAt: params.generatedAt,
    students: {
      total: expected.size,
      archived: archivedIds.size,
      quarantined: quarantinedIds.size,
      missing
    },
    terms: [...params.terms],
    objects: params.objects.map((object) => ({
      studentId: object.studentId,
      key: object.objectKey,
      checksum: object.checksum,
      bytes: object.bytes,
      version: object.version,
      status: object.status
    })),
    gaps
  });
}

export function encodeManifest(manifest: ArchiveManifest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(manifest));
}

export function parseManifest(bytes: Uint8Array): ArchiveManifest | null {
  try {
    const parsed = archiveManifestSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
