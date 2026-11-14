import { PortError } from "../errors";
import type { ArchiveStoreEntry, ArchiveStorePort } from "../ports";

const PAGE_SIZE = 1000;

export class R2ArchiveStore implements ArchiveStorePort {
  constructor(private readonly bucket: R2Bucket | undefined) {}

  private requireBucket(): R2Bucket {
    if (this.bucket === undefined) {
      throw new PortError("archive", "R2 MEDIA binding is not configured", false);
    }
    return this.bucket;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    try {
      await this.requireBucket().put(key, bytes, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { encoding: "json" }
      });
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("archive", "R2 archive write failed", true, { cause: error });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const object = await this.requireBucket().get(key);
      if (object === null) return null;
      return new Uint8Array(await object.arrayBuffer());
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("archive", "R2 archive read failed", true, { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.requireBucket().delete(key);
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("archive", "R2 archive delete failed", true, { cause: error });
    }
  }

  async list(prefix: string): Promise<readonly ArchiveStoreEntry[]> {
    try {
      const bucket = this.requireBucket();
      const entries: ArchiveStoreEntry[] = [];
      let cursor: string | undefined;
      for (;;) {
        const options =
          cursor === undefined
            ? { prefix, limit: PAGE_SIZE }
            : { prefix, cursor, limit: PAGE_SIZE };
        const page = await bucket.list(options);
        entries.push(...page.objects.map((object) => ({ key: object.key, size: object.size })));
        if (!page.truncated) return entries;
        cursor = page.cursor;
        if (cursor === undefined) return entries;
      }
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("archive", "R2 archive listing failed", true, { cause: error });
    }
  }
}

export const createArchiveStore = (bucket: R2Bucket | undefined): ArchiveStorePort =>
  new R2ArchiveStore(bucket);
