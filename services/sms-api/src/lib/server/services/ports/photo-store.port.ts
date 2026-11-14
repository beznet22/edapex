export interface PhotoObject {
  readonly body: ReadableStream;
  readonly contentType: string | null;
  readonly etag: string;
  readonly size: number;
}

export interface PhotoStore {
  put(
    key: string,
    bytes: ArrayBuffer | Uint8Array,
    contentType: string,
    sha256: string
  ): Promise<void>;
  get(key: string): Promise<PhotoObject | null>;
  head(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
