/**
 * Image compression helpers — client-safe (no Node.js imports).
 *
 * These utilities are consumed by every client component that handles
 * file uploads with the in-browser image compressor (see
 * `src/lib/context/image.context.svelte.ts`). Centralised so:
 *   - Filename extension is always reconciled with the (possibly
 *     post-compression) MIME type — the worker auto-converts large PNGs
 *     to JPEG, and the server uses the filename extension to derive
 *     the saved `ext` (see `/api/uploads/+server.ts:106`).
 *   - The compression short-circuit and threshold logic lives in one
 *     place — keeps `ChatComposer`, `filestore`, and any future upload
 *     surface consistent.
 */
import {
  IMAGE_COMPRESSION_DEFAULTS,
  COMPRESSION_SKIP_THRESHOLD_BYTES,
  type ImageCompressionDefaults
} from "./compression.config";

export type CompressionOptions = Partial<ImageCompressionDefaults>;
export { IMAGE_COMPRESSION_DEFAULTS, COMPRESSION_SKIP_THRESHOLD_BYTES };

/**
 * Map a MIME type to a filename extension (no leading dot).
 * Returns empty string for unknown / non-image types — the caller
 * decides whether to fall back to the original extension.
 */
export function extFromMime(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "";
}

/**
 * Build a safe filename whose extension matches the (possibly
 * post-compression) MIME type. Preserves the original basename.
 * Returns the original name unchanged for non-image types.
 */
export function filenameForMime(originalName: string, mime: string): string {
  if (mime && mime.startsWith("image/")) {
    const ext = extFromMime(mime);
    if (ext) {
      return originalName.replace(/\.[^.]+$/, "") + "." + ext;
    }
  }
  return originalName;
}

/**
 * Compress a file if it is an image AND larger than the skip threshold.
 * - Non-image files (PDF, etc.) pass through unchanged.
 * - Sub-100KB images skip the worker round-trip — they'd shrink
 *   marginally and the worker's setUp/decode cost outweighs the win.
 * - Otherwise delegates to the in-browser image compressor worker
 *   with the shared `IMAGE_COMPRESSION_DEFAULTS`. The worker has its
 *   own fallback that returns the original file on any compression
 *   failure (see `image-compressor.worker.ts:41-54`), so the caller
 *   always gets a usable `File`.
 */
export async function compressIfImage(
  file: File,
  compress: (file: File, options: CompressionOptions) => Promise<File>,
  options: CompressionOptions = IMAGE_COMPRESSION_DEFAULTS,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < COMPRESSION_SKIP_THRESHOLD_BYTES) return file;
  return compress(file, options);
}

/**
 * Compact human-readable byte formatter. Duplicated from
 * `filestore/+page.svelte:159-165` so the upload card can format
 * per-file size without an extra import. Server-side formatters live
 * elsewhere; this is the browser-only one.
 */
export function formatBytes(bytes: number | undefined): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
