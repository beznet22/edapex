import { getContext, setContext } from "svelte";
import ImageCompressorWorker from "$lib/workers/image-compressor.worker.ts?worker";
import { toast } from "svelte-sonner";
import { IMAGE_COMPRESSION_DEFAULTS, type ImageCompressionDefaults } from "$lib/compression.config";

const IMAGE_CONTEXT_KEY = Symbol("image-compression-context");

export interface CompressionStats {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    duration: number;
    wasConverted: boolean;
}

export type CompressionOptions = Partial<ImageCompressionDefaults>;
export { IMAGE_COMPRESSION_DEFAULTS };


export class ImageContext {
    lastStats = $state<CompressionStats | null>(null);
    isCompressing = $state(false);

    #worker: Worker | null = null;
    #pendingResolves = new Map<string, (file: File) => void>();

    constructor() {
        if (typeof window !== 'undefined') {
            this.#initWorker();
        }
    }

    #initWorker() {
        this.#worker = new ImageCompressorWorker();
        this.#worker.onmessage = (e) => {
            const { id, file, stats, error } = e.data;
            this.isCompressing = this.#pendingResolves.size > 1;
            this.lastStats = stats;

            if (error) {
                console.error("Compression worker error:", error);
            }

            const resolve = this.#pendingResolves.get(id);
            if (resolve) {
                resolve(file);
                this.#pendingResolves.delete(id);
            }
        };
    }

    compress = async (file: File, options: CompressionOptions = {}): Promise<File> => {
        if (!file.type.startsWith("image/")) return file;

        // Check if we need to initialize or re-initialize worker
        if (!this.#worker) this.#initWorker();

        const id = Math.random().toString(36).substring(2, 11);
        this.isCompressing = true;

        return new Promise((resolve) => {
            this.#pendingResolves.set(id, resolve);
            this.#worker?.postMessage({
                id,
                file,
                options: {
                    maxWidth: options.maxWidth ?? IMAGE_COMPRESSION_DEFAULTS.maxWidth,
                    maxHeight: options.maxHeight ?? IMAGE_COMPRESSION_DEFAULTS.maxHeight,
                    quality: options.quality ?? IMAGE_COMPRESSION_DEFAULTS.quality,
                    maxSizeKB: options.maxSizeKB ?? IMAGE_COMPRESSION_DEFAULTS.maxSizeKB,
                    convertPngThreshold: options.convertPngThreshold ?? IMAGE_COMPRESSION_DEFAULTS.convertPngThreshold,
                }
            });
        });
    };

    setContext = () => {
        setContext(IMAGE_CONTEXT_KEY, this);
    };

    static fromContext(): ImageContext {
        const context = getContext<ImageContext>(IMAGE_CONTEXT_KEY);
        if (!context) {
            throw new Error("ImageContext must be used within a provider");
        }
        return context;
    }
}

export const useImageCompression = () => {
    return ImageContext.fromContext();
};
