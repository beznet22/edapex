export interface ArchiveStoreEntry {
  readonly key: string;
  readonly size: number;
}

/**
 * Archive objects are byte payloads keyed by school/session/student/version.
 * The port deliberately exposes no presigned URLs: reads always pass through
 * the checksum verification in the archive service.
 */
export interface ArchiveStorePort {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<readonly ArchiveStoreEntry[]>;
}
