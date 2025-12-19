import type { UploadedData } from "$lib/types/chat-types";
import { generateId } from "ai";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";
import UploadWorker from "$lib/chat/upload-worker.ts?worker";
import type { index } from "drizzle-orm/gel-core";

const FILES_CONTEXT_KEY = Symbol("attachments-context");

export class FilesContext {
  files = $state<File[]>([]);
  uploads = $state<UploadedData[]>([]);
  fileInputRef = $state<HTMLInputElement | null>(null);
  openModal = $state(false);

  constructor(uploads: UploadedData[], public doUpload?: boolean) {
    this.uploads = uploads;
  }

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
    if (this.doUpload) this.#upload(incoming);
    this.files = [...this.files, ...incoming];
  };

  #upload = (files: File[] | string[], id?: string) => {
    for (const file of files) {
      const fileId = id ?? generateId(); // Unique ID per file (not per batch)
      const name = typeof file === "string" ? file : file.name;
      const upload: UploadedData = {
        id: fileId,
        filename: name,
        status: "started",
        success: false,
      };

      if (id) {
        this.updateUpload(upload);
      } else {
        this.uploads = [...this.uploads, upload];
      }
      const worker = new UploadWorker({ name: `upload-worker-${fileId}` });
      worker.onmessage = ({ data }: MessageEvent<UploadedData>) => {
        if (!data.success) {
          this.uploads = this.uploads.filter((u) => u.id !== fileId);
          console.error(`Upload failed: `, data.error);
          toast.error("File upload failed. Please try again.");
          return;
        }

        // Update only this specific file's status
        this.uploads = this.uploads.map((u) =>
          u.id === fileId ? { ...u, ...data, success: true, status: data.status } : u
        );
        console.log(`Upload success for ${name}:`, data);
      };

      worker.onerror = (error) => {
        console.error(`Upload error for ${name}:`, error);
        this.uploads = this.uploads.filter((u) => u.id !== fileId);
        toast.error(`Failed to upload ${name}`);
      };

      if (typeof file === "string") {
        worker.postMessage({ id, name });
        continue;
      }
      worker.postMessage({ fileId, file, name });
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

  retryUpload = (upload: UploadedData) => {
    this.#upload([upload.filename], upload.id);
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
