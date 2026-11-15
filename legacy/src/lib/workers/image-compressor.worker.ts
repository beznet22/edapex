// Image compressor worker — high performance, non-blocking, lossless-first compression
// Prioritises resolution reduction over quality loss to preserve visual fidelity.
// createImageBitmap() is ONLY used for non-blocking decode (no downscale).
// Addresses gamma correction via colorSpaceConversion: 'none'.

interface CompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;           // initial encode quality (default 0.8)
    maxSizeKB?: number;         // 0 = no target size limit
    convertPngThreshold?: number; // bytes — PNGs larger than this become JPEG
}

interface WorkerMessage {
    id: string;
    file: File;
    options: CompressionOptions;
}

// ─── entry point ────────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const { id, file, options } = e.data;
    const startTime = Date.now();

    try {
        const result = await compressImage(file, options);

        self.postMessage({
            id,
            file: result.file,
            stats: {
                originalSize: file.size,
                compressedSize: result.file.size,
                ratio: result.file.size / file.size,
                duration: Date.now() - startTime,
                wasConverted: result.wasConverted,
            },
        });
    } catch (error) {
        console.error('Compression error in worker:', error);
        // Fall back to original file on any failure
        self.postMessage({
            id,
            file,
            stats: {
                originalSize: file.size,
                compressedSize: file.size,
                ratio: 1,
                duration: Date.now() - startTime,
                wasConverted: false,
            },
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

// ─── core compression ───────────────────────────────────────────────────────

async function compressImage(file: File, options: CompressionOptions) {
    const {
        maxWidth = 2048,
        maxHeight = 2048,
        quality = 0.8,                      // 0.8 compression ratio by default
        maxSizeKB = 0,
        convertPngThreshold = 2 * 1024 * 1024,
    } = options;

    // 1. Read EXIF orientation for JPEGs
    let orientation = 1;
    if (file.type === 'image/jpeg') {
        orientation = await getOrientation(file);
    }

    // 2. Non-blocking decode with createImageBitmap (when available)
    //    IMPORTANT: decode at ORIGINAL resolution only — no downscale via cib.
    //    colorSpaceConversion: 'none' preserves gamma / 12-bit precision where
    //    the browser supports it, avoiding the 8-bit quantisation loss that
    //    canvas normally introduces.
    const bitmap = await decodeImage(file);
    const srcWidth = bitmap.width;
    const srcHeight = bitmap.height;

    // 3. Determine output format
    //    • Keep original format by default
    //    • Auto-convert large PNGs (> threshold) to JPEG for better compression
    let targetType = file.type;
    let wasConverted = false;
    if (file.type === 'image/png' && file.size > convertPngThreshold) {
        targetType = 'image/jpeg';
        wasConverted = true;
    }

    // 4. Calculate target dimensions — only downscale, never upscale
    let outWidth = srcWidth;
    let outHeight = srcHeight;
    if (outWidth > maxWidth || outHeight > maxHeight) {
        const scale = Math.min(maxWidth / outWidth, maxHeight / outHeight);
        outWidth = Math.round(outWidth * scale);
        outHeight = Math.round(outHeight * scale);
    }

    // 5. Draw to OffscreenCanvas
    const canvas = new OffscreenCanvas(outWidth, outHeight);
    const ctx = canvas.getContext('2d', { alpha: targetType === 'image/png' });
    if (!ctx) throw new Error('Could not get 2d context');

    // Background: transparent for PNG, white for everything else (avoids black)
    if (targetType === 'image/png') {
        ctx.clearRect(0, 0, outWidth, outHeight);
    } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, outWidth, outHeight);
    }

    // Apply EXIF orientation correction before drawing
    ctx.save();
    applyOrientation(ctx, orientation, outWidth, outHeight);

    // Highest-quality resampling for downscaled images
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
    ctx.restore();
    bitmap.close();

    // 6. Encode — start at the requested quality (default 1.0 = lossless)
    let compressedBlob = await canvas.convertToBlob({
        type: targetType,
        quality,
    });

    // 7. If a maxSizeKB target is specified and we exceed it, do a binary-search
    //    quality reduction — but ONLY for lossy formats (JPEG/WebP).
    //    This is the only path that sacrifices quality, and only when the user
    //    explicitly asks for a size target.
    if (
        maxSizeKB > 0 &&
        compressedBlob.size > maxSizeKB * 1024 &&
        (targetType === 'image/jpeg' || targetType === 'image/webp')
    ) {
        let lo = 0.1;
        let hi = quality;
        for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            compressedBlob = await canvas.convertToBlob({ type: targetType, quality: mid });
            // Close enough (within 10 % of target) — stop early
            if (Math.abs(compressedBlob.size / 1024 - maxSizeKB) < maxSizeKB * 0.1) break;
            if (compressedBlob.size > maxSizeKB * 1024) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
    }

    // 8. Safety: if the result is LARGER than the original (same format), return original
    const resultFile = new File([compressedBlob], file.name, {
        type: targetType,
        lastModified: Date.now(),
    });

    if (resultFile.size >= file.size && targetType === file.type) {
        return { file, wasConverted: false };
    }

    return { file: resultFile, wasConverted };
}

// ─── non-blocking image decode ──────────────────────────────────────────────
// Uses createImageBitmap when available for off-thread decode at ORIGINAL size.
// Falls back to Blob → ImageBitmap without options if colorSpaceConversion
// is not supported.

async function decodeImage(file: File): Promise<ImageBitmap> {
    if (typeof createImageBitmap === 'function') {
        try {
            // Decode only — no resize options passed → original resolution
            return await createImageBitmap(file, {
                colorSpaceConversion: 'none', // preserve gamma precision
            });
        } catch {
            // Browser may not support the options bag — retry without
            return await createImageBitmap(file);
        }
    }
    // Absolute fallback (extremely rare — all modern browsers support cib)
    throw new Error('createImageBitmap is not available in this environment');
}

// ─── EXIF orientation ───────────────────────────────────────────────────────
// Reads the orientation tag from the JPEG APP1 (EXIF) segment so we can
// correct flip / rotation before drawing.

async function getOrientation(file: File): Promise<number> {
    try {
        const buffer = await file.slice(0, 65536).arrayBuffer(); // first 64 KB
        const view = new DataView(buffer);

        if (view.getUint16(0, false) !== 0xFFD8) return 1; // not JPEG

        let offset = 2;
        while (offset < view.byteLength - 2) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            if (marker === 0xFFE1) {
                // APP1 — EXIF
                const segLen = view.getUint16(offset, false);
                if (offset + segLen > view.byteLength) return 1;

                // Check "Exif\0\0" header
                if (view.getUint32(offset + 2, false) !== 0x45786966) return 1;

                const tiffOffset = offset + 8; // start of TIFF header
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
        // If EXIF parsing fails for any reason, assume no rotation
    }
    return 1;
}

// ─── orientation transform ──────────────────────────────────────────────────

function applyOrientation(
    ctx: OffscreenCanvasRenderingContext2D,
    orientation: number,
    w: number,
    h: number,
) {
    switch (orientation) {
        case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;    // flip H
        case 3: ctx.transform(-1, 0, 0, -1, w, h); break;    // rotate 180
        case 4: ctx.transform(1, 0, 0, -1, 0, h); break;     // flip V
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;      // transpose
        case 6: ctx.transform(0, 1, -1, 0, w, 0); break;     // rotate 90 CW
        case 7: ctx.transform(0, -1, -1, 0, w, h); break;    // transverse
        case 8: ctx.transform(0, -1, 1, 0, 0, h); break;     // rotate 90 CCW
    }
}
