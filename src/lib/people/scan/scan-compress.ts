import { compressImage, type CompressionResult } from "$lib/compression.utils";
import type { ImageCompressionDefaults } from "$lib/compression.config";

/**
 * Scanner compression settings (plan §3c).
 *
 * 1600 px is the lowest cap with stable, complete extraction: at 1280 px the model returned a
 * whole subject missing in one run and two wrong cells in the next, on identical bytes. Verified
 * through the real `OffscreenCanvas` path in Chrome — 209–224 KB output at 2/114 cells wrong,
 * identical to the higher-resolution baseline.
 *
 * `maxSizeKB: 0` is deliberate. A byte target would trade away DPI to hit a number, and accuracy
 * depends on DPI, not file size.
 */
export const SCAN_COMPRESSION: Partial<ImageCompressionDefaults> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8,
  maxSizeKB: 0,
};

export interface ScanCompressionOutcome {
  file: File;
  bytes: number;
  originalBytes: number;
  /** True when the image was already smaller than 1600 px on its long edge. */
  upscaled: false;
}

/**
 * Compresses a capture for upload. Reuses the existing pipeline unchanged: EXIF orientation is
 * applied before drawing and stripped as a side effect of canvas re-encoding.
 */
export async function compressScan(file: File): Promise<ScanCompressionOutcome & CompressionResult> {
  const result = await compressImage(file, SCAN_COMPRESSION);
  return {
    ...result,
    bytes: result.file.size,
    originalBytes: result.stats.originalSize,
    upscaled: false,
  };
}
