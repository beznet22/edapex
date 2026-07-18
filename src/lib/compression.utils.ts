/**
 * Image compression helpers — client-safe (no Node.js imports).
 *
 * These utilities are consumed by the in-browser image compressor and
 * the task worker's upload pipeline. The core `compressImage` function
 * uses OffscreenCanvas (available in workers and modern browsers) and
 * is imported directly by the task worker. The legacy `compressIfImage`
 * wrapper is kept for ChatComposer backward compat.
 */
import {
  IMAGE_COMPRESSION_DEFAULTS,
  COMPRESSION_SKIP_THRESHOLD_BYTES,
  type ImageCompressionDefaults
} from "./compression.config";

export type CompressionOptions = Partial<ImageCompressionDefaults>;
export { IMAGE_COMPRESSION_DEFAULTS, COMPRESSION_SKIP_THRESHOLD_BYTES };

export type CompressionResult = {
  file: File;
  stats: {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    wasConverted: boolean;
  };
};

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
 * Compress a single image file using OffscreenCanvas.
 * Non-image files are returned as-is. Small images are skipped.
 * Callable from workers (task worker) or main thread.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = IMAGE_COMPRESSION_DEFAULTS,
): Promise<CompressionResult> {
  if (!file.type.startsWith("image/")) {
    return { file, stats: { originalSize: file.size, compressedSize: file.size, ratio: 1, wasConverted: false } };
  }
  if (file.size < COMPRESSION_SKIP_THRESHOLD_BYTES) {
    return { file, stats: { originalSize: file.size, compressedSize: file.size, ratio: 1, wasConverted: false } };
  }
  return compressImageCore(file, options);
}

/**
 * Core compression — OffscreenCanvas-based pipeline.
 */
async function compressImageCore(
  file: File,
  options: CompressionOptions,
): Promise<CompressionResult> {
  const {
    maxWidth = IMAGE_COMPRESSION_DEFAULTS.maxWidth,
    maxHeight = IMAGE_COMPRESSION_DEFAULTS.maxHeight,
    quality = IMAGE_COMPRESSION_DEFAULTS.quality,
    maxSizeKB = IMAGE_COMPRESSION_DEFAULTS.maxSizeKB,
    convertPngThreshold = IMAGE_COMPRESSION_DEFAULTS.convertPngThreshold,
  } = options;

  let orientation = 1;
  if (file.type === "image/jpeg") {
    orientation = await getOrientation(file);
  }

  const bitmap = await decodeImage(file);
  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;

  let targetType = file.type;
  let wasConverted = false;
  if (file.type === "image/png" && file.size > convertPngThreshold) {
    targetType = "image/jpeg";
    wasConverted = true;
  }

  let outWidth = srcWidth;
  let outHeight = srcHeight;
  if (outWidth > maxWidth || outHeight > maxHeight) {
    const scale = Math.min(maxWidth / outWidth, maxHeight / outHeight);
    outWidth = Math.round(outWidth * scale);
    outHeight = Math.round(outHeight * scale);
  }

  const canvas = new OffscreenCanvas(outWidth, outHeight);
  const ctx = canvas.getContext("2d", { alpha: targetType === "image/png" });
  if (!ctx) throw new Error("Could not get 2d context");

  if (targetType === "image/png") {
    ctx.clearRect(0, 0, outWidth, outHeight);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, outWidth, outHeight);
  }

  ctx.save();
  applyOrientation(ctx, orientation, outWidth, outHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
  ctx.restore();
  bitmap.close();

  let compressedBlob = await canvas.convertToBlob({ type: targetType, quality });

  if (
    maxSizeKB > 0 &&
    compressedBlob.size > maxSizeKB * 1024 &&
    (targetType === "image/jpeg" || targetType === "image/webp")
  ) {
    let lo = 0.1;
    let hi = quality;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      compressedBlob = await canvas.convertToBlob({ type: targetType, quality: mid });
      if (Math.abs(compressedBlob.size / 1024 - maxSizeKB) < maxSizeKB * 0.1) break;
      if (compressedBlob.size > maxSizeKB * 1024) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
  }

  const resultFile = new File([compressedBlob], file.name, {
    type: targetType,
    lastModified: Date.now(),
  });

  if (resultFile.size >= file.size && targetType === file.type) {
    return { file, stats: { originalSize: file.size, compressedSize: file.size, ratio: 1, wasConverted: false } };
  }

  return {
    file: resultFile,
    stats: {
      originalSize: file.size,
      compressedSize: resultFile.size,
      ratio: resultFile.size / file.size,
      wasConverted,
    },
  };
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { colorSpaceConversion: "none" });
    } catch {
      return await createImageBitmap(file);
    }
  }
  throw new Error("createImageBitmap not available");
}

async function getOrientation(file: File): Promise<number> {
  try {
    const buffer = await file.slice(0, 65536).arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint16(0, false) !== 0xFFD8) return 1;
    let offset = 2;
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xFFE1) {
        const segLen = view.getUint16(offset, false);
        if (offset + segLen > view.byteLength) return 1;
        if (view.getUint32(offset + 2, false) !== 0x45786966) return 1;
        const tiffOffset = offset + 8;
        const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
        const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
        const ifdStart = tiffOffset + ifdOffset;
        if (ifdStart + 2 > view.byteLength) return 1;
        const tagCount = view.getUint16(ifdStart, littleEndian);
        for (let i = 0; i < tagCount; i++) {
          const entryOffset = ifdStart + 2 + i * 12;
          if (entryOffset + 12 > view.byteLength) return 1;
          if (view.getUint16(entryOffset, littleEndian) === 0x0112) {
            return view.getUint16(entryOffset + 8, littleEndian);
          }
        }
        return 1;
      } else if ((marker & 0xFF00) !== 0xFF00) {
        break;
      } else {
        offset += view.getUint16(offset, false);
      }
    }
  } catch {
    /* skip orientation */
  }
  return 1;
}

function applyOrientation(
  ctx: OffscreenCanvasRenderingContext2D,
  orientation: number,
  w: number,
  h: number,
) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, w, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, w, h); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, h); break;
  }
}

/**
 * Thin wrapper: compress a file if it is an image AND larger than the
 * skip threshold. Delegates to the provided `compress` callback.
 * Kept for ChatComposer backward compat.
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
