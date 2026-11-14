import { PortError } from "../errors";
import type { PhotoObject, PhotoStore } from "../ports";

export class R2PhotoStore implements PhotoStore {
  constructor(private readonly bucket: R2Bucket | undefined) {}

  private requireBucket(): R2Bucket {
    if (this.bucket === undefined) {
      throw new PortError("photos", "R2 MEDIA binding is not configured", false);
    }
    return this.bucket;
  }

  async put(
    key: string,
    bytes: ArrayBuffer | Uint8Array,
    contentType: string,
    sha256: string
  ): Promise<void> {
    try {
      await this.requireBucket().put(key, bytes, {
        httpMetadata: {
          contentType,
          cacheControl: "public, max-age=31536000, immutable"
        },
        customMetadata: { sha256 }
      });
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("photos", "R2 photo upload failed", true, { cause: error });
    }
  }

  async get(key: string): Promise<PhotoObject | null> {
    try {
      const object = await this.requireBucket().get(key);
      if (object === null) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? null,
        etag: object.httpEtag,
        size: object.size
      };
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("photos", "R2 photo read failed", true, { cause: error });
    }
  }

  async head(key: string): Promise<boolean> {
    try {
      return (await this.requireBucket().head(key)) !== null;
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("photos", "R2 photo lookup failed", true, { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.requireBucket().delete(key);
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("photos", "R2 photo delete failed", true, { cause: error });
    }
  }
}

export const createPhotoStore = (bucket: R2Bucket | undefined): PhotoStore =>
  new R2PhotoStore(bucket);
