import { studentDataSchema } from "$lib/schema/result";
import type { UploadedData } from "$lib/types/chat-types";
import { generateId } from "ai";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";

const FILES_CONTEXT_KEY = Symbol("attachments-context");

export class FilesContext {
  files = $state<File[]>([]);
  uploads = $state<UploadedData[]>([]);
  fileInputRef = $state<HTMLInputElement | null>(null);
  openModal = $state(false);

  constructor(
    public doUpload?: boolean,
    private accept?: string,
    private maxFiles?: number,
    private maxFileSize?: number
  ) {}

  openFileDialog = () => {
    if (!this.fileInputRef) {
      toast.error("File input ref is not set");
      return;
    }
    this.fileInputRef?.click();
  };

  oprnFileDropZone = () => {
    this.openModal = true;
  };

  #matchesAccept = (file: File): boolean => {
    if (!this.accept || this.accept.trim() === "") {
      return true;
    }
    if (this.accept.includes("image/*")) {
      return file.type.startsWith("image/");
    }
    return true;
  };

  toDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => reject(new Error("Failed to read attachment"));
      reader.readAsDataURL(file);
    });
  };

  onchange = (event: Event) => {
    let files = (event.target as HTMLInputElement).files;
    if (!files) return;
    if (files) this.add(files);
  };

  add = async (files: File[] | FileList) => {
    const incoming = Array.from(files);

    // ✅ 1. Filter by accepted type
    const accepted = this.accept ? incoming.filter((f) => this.#matchesAccept(f)) : incoming;

    if (!accepted.length) {
      toast.error("No attachments match the accepted types.");
      return;
    }

    // ✅ 2. Filter by max size
    const sized = this.maxFileSize ? accepted.filter((f) => f.size <= this.maxFileSize!) : accepted;

    if (!sized.length) {
      toast.error("All attachments exceed the maximum size.");
      return;
    }

    // ✅ 3. Enforce max attachment count
    const capacity =
      typeof this.maxFiles === "number" ? Math.max(0, this.maxFiles - this.files.length) : undefined;

    const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;

    if (typeof capacity === "number" && sized.length > capacity) {
      toast.error("Too many attachments. Some were not added.");
    }

    // ✅ 4. Upload or create blob URLs
    if (this.doUpload) this.#upload(capped);
    this.files = [...this.files, ...capped];
  };

  #upload = (files: File[]) => {
    // const { default: WorkerConstructor } = await import('$lib/chat/upload-worker.ts?worker');
    // Remove the id parameter
    for (const file of files) {
      const fileId = generateId(); // Unique ID per file (not per batch)
      const upload = {
        id: fileId,
        filename: file.name,
        mediaType: file.type,
        success: false,
      };

      // Add to uploads immediately with unique ID
      this.uploads = [...this.uploads, upload];
      const worker = new Worker(new URL("../chat/upload-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<UploadedData>) => {
        if (!data.success) {
          this.uploads = this.uploads.filter((u) => u.id !== fileId);
          toast.error("File upload failed. Please try again.");
          return;
        }

        // Update only this specific file's status
        this.uploads = this.uploads.map((u) => (u.id === fileId ? { ...u, ...data, success: true } : u));
        console.log(`Upload success for ${file.name}:`, data);
        const result = studentDataSchema.parse(data.studentData);
        console.log("Upload success: ", { result });
      };

      worker.onerror = (error) => {
        console.error(`Upload error for ${file.name}:`, error);
        this.uploads = this.uploads.filter((u) => u.id !== fileId);
        toast.error(`Failed to upload ${file.name}`);
      };

      worker.postMessage({ id: fileId, file });
    }
  };

  removeAll = () => {
    this.clear();
  };

  remove = (index: number) => {
    this.files = this.files.filter((_, i) => i !== index);
    this.uploads = this.uploads.filter((_, i) => i !== index);
    if (this.fileInputRef) {
      this.fileInputRef.value = "";
    }
  };

  updateUpload = (upload: UploadedData) => {
    this.uploads = [...this.uploads.filter((u) => u.id !== upload.id), upload];
  };

  clear = () => {
    this.files = [];
    this.uploads = [];
  };

  setContext = () => {
    setContext(FILES_CONTEXT_KEY, this);
  };

  static fromContext(): FilesContext {
    let context = getContext<FilesContext>(FILES_CONTEXT_KEY);
    if (!context) {
      throw new Error("FilesContext must be used within a PromptInput");
    }
    return context;
  }
}

export const useFiles = () => {
  let context = FilesContext.fromContext();
  return context.files;
};

export const useFileInputRef = () => {
  let context = FilesContext.fromContext();
  return context.fileInputRef;
};

export const useFileActions = () => {
  return FilesContext.fromContext();
};
