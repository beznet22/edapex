/**
 * Image compression defaults — client-safe (no Node.js imports).
 *
 * These are consumed by the in-browser image compressor worker
 * (`src/lib/workers/image-compressor.worker.ts`) and by any UI surface
 * that needs to reference the same numbers (e.g. ChatComposer).
 *
 * `IMAGE_COMPRESSION_DEFAULTS` is the source of truth for resolution
 * caps, JPEG quality, and the auto-convert threshold (PNGs larger than
 * `convertPngThreshold` are re-encoded as JPEG for better compression).
 * `COMPRESSION_SKIP_THRESHOLD_BYTES` short-circuits the worker round-trip
 * for tiny images that wouldn't shrink meaningfully.
 */

export interface ImageCompressionDefaults {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maxSizeKB: number;
  convertPngThreshold: number;
}

export const IMAGE_COMPRESSION_DEFAULTS: ImageCompressionDefaults = {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 0.8,
  maxSizeKB: 0,
  convertPngThreshold: 2 * 1024 * 1024,
};

export const COMPRESSION_SKIP_THRESHOLD_BYTES = 100 * 1024;
