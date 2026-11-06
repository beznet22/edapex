import type { ArchiveDocument } from "../../../schema/archive";
import { archiveDocumentSchema } from "../../../schema/archive";

export const ARCHIVE_OBJECT_PREFIX = "schools";

export function archiveObjectKey(params: {
  readonly schoolId: number;
  readonly sessionId: number;
  readonly studentId: number;
  readonly version: number;
}): string {
  return `${ARCHIVE_OBJECT_PREFIX}/${params.schoolId}/sessions/${params.sessionId}/students/${params.studentId}/v${params.version}.json`;
}

export function archiveManifestKey(schoolId: number, sessionId: number): string {
  return `${ARCHIVE_OBJECT_PREFIX}/${schoolId}/sessions/${sessionId}/manifest.json`;
}

/** Canonical bytes: fixed key order comes from the builder, not the JSON API. */
export function encodeArchiveDocument(document: ArchiveDocument): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document));
}

export type ArchiveDecodeResult =
  | { readonly kind: "ok"; readonly document: ArchiveDocument }
  | { readonly kind: "unsupported"; readonly schemaVersion: number }
  | { readonly kind: "invalid" };

export async function decodeArchiveDocument(
  bytes: Uint8Array
): Promise<ArchiveDecodeResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { kind: "invalid" };
  }
  if (!isRecord(parsed)) return { kind: "invalid" };
  const version = parsed["schemaVersion"];
  if (typeof version !== "number") return { kind: "invalid" };
  if (version !== 1) return { kind: "unsupported", schemaVersion: version };
  const result = await archiveDocumentSchema.safeParseAsync(parsed);
  return result.success ? { kind: "ok", document: result.data } : { kind: "invalid" };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
