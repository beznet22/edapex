import JSZip from "jszip";

export type Preview = {
  images: string[];
  pdfUrl: string | null;
  pdfName: string | null;
};

const cache = new Map<string, Preview>();
const pendingRequests = new Map<string, Promise<Preview | null>>();

class PreviewContext {
  url = $state("");
  preview: Preview | null = $state(null);
  currentIndex = $state(0);

  constructor(url: string) {
    this.url = url;
  }

  next = () => {
    if (!this.preview) return;
    if (this.currentIndex < this.preview.images.length - 1) {
      this.currentIndex++;
    }
  };

  prev = () => {
    if (!this.preview) return;
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
  };

  #isFetching = false;
  #lastFetchedUrl = "";

  fetch = async () => {
    if (!this.url || this.#isFetching) return;

    // 1. Check completed cache
    const cached = cache.get(this.url);
    if (cached) {
      this.preview = cached;
      this.currentIndex = 0;
      return;
    }

    // 2. Check pending requests
    const pending = pendingRequests.get(this.url);
    if (pending) {
      try {
        const preview = await pending;
        if (preview) {
          this.preview = preview;
          this.currentIndex = 0;
        }
      } catch (err) {
        console.error("Error awaiting pending preview: ", err);
      }
      return;
    }

    // 3. Start new fetch
    this.#isFetching = true;
    const fetchPromise = (async () => {
      try {
        const preview = await this.#fetchPreview();
        if (preview) {
          cache.set(this.url, preview);
        }
        return preview;
      } finally {
        pendingRequests.delete(this.url);
      }
    })();

    pendingRequests.set(this.url, fetchPromise);

    try {
      const preview = await fetchPromise;
      if (preview) {
        this.preview = preview;
        this.currentIndex = 0;
      }
    } catch (err) {
      console.error("Error fetching preview: ", err);
    } finally {
      this.#isFetching = false;
    }
  };

  clear = () => {
    // We don't revoke here because we use a global cache now
    // revoking would break other components using the same cached preview
    this.preview = null;
    this.#lastFetchedUrl = "";
  };

  #setPreview = (preview: Preview) => {
    this.preview = preview;
    this.currentIndex = 0;
    if (this.url) {
      cache.set(this.url, preview);
    }
  };

  #revoke = (preview: Preview) => {
    // Only revoke if we really want to purge the cache
    preview.images.forEach((url) => URL.revokeObjectURL(url));
    if (preview.pdfUrl) {
      URL.revokeObjectURL(preview.pdfUrl);
    }
  };

  async #fetchPreview(): Promise<Preview | null> {
    if (!this.url) return null;

    try {
      const response = await fetch(this.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ZIP: ${response.status} ${response.statusText}`);
      }

      const zipBlob = await response.blob();
      if (!zipBlob) throw new Error("Failed to fetch ZIP");
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipBlob);

      // Find PDF file
      const pdfFileName = Object.keys(zipContent.files).find((fileName) =>
        fileName.toLowerCase().endsWith(".pdf")
      );

      let pdfUrl: string | null = null;
      let pdfName: string | null = null;
      if (pdfFileName) {
        const pdfFile = zipContent.file(pdfFileName);
        if (pdfFile) {
          const pdfData = await pdfFile.async("blob");
          pdfUrl = URL.createObjectURL(pdfData);
          pdfName = pdfFileName;
        }
      }

      // Extract all image files (excluding PDF files)
      const imageFiles = Object.keys(zipContent.files).filter(
        (fileName) =>
          (fileName.toLowerCase().endsWith(".jpeg") ||
            fileName.toLowerCase().endsWith(".jpg") ||
            fileName.toLowerCase().endsWith(".png")) &&
          !fileName.toLowerCase().endsWith(".pdf")
      );

      // Sort the files to ensure proper order
      imageFiles.sort();

      // Convert each image file to a data URL
      const images = await Promise.all(
        imageFiles.map(async (fileName) => {
          const file = zipContent.file(fileName);
          if (file) {
            const imageData = await file.async("blob");
            return URL.createObjectURL(imageData);
          }
          return null;
        })
      );

      return { images: images.filter((url) => url !== null) as string[], pdfUrl, pdfName };
    } catch (err: unknown) {
      console.error("Error processing ZIP file:", err);
      throw err;
    }
  }
}

export const usePreview = (url: string) => {
  return new PreviewContext(url);
};
