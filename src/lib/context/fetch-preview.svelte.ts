import JSZip from "jszip";

export type Preview = {
  images: string[];
  pdfUrl: string | null;
  pdfName: string | null;
};

const cache = new Map<string, Preview>();

class PreviewContext {
  preview: Preview | null = $state(null);
  currentIndex = $state(0);

  constructor(private url: string) {}

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

  fetch = async () => {
    try {
      const preview = await this.#fetchPreview();
      if (!preview) return;
      this.#setPreview(preview);
    } catch (err) {
      console.error("Error fetching preview: ", err);
    }
  };

  clear = () => {
    if (this.preview) {
      this.#revoke(this.preview);
    }
    this.preview = null;
  };

   #setPreview = (preview: Preview) => {
    this.preview = preview;
    this.currentIndex = 0;
    if (preview.pdfName) {
      cache.set(preview.pdfName, preview);
    }
  };

  #revoke = (preview: Preview) => {
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
      console.log("ZIP Blob: ", zipBlob);
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
