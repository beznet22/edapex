import type { UploadedData } from "$lib/types/chat-types";
import { generateId } from "ai";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";
import UploadWorker from "$lib/chat/upload-worker.ts?worker";
import type { index } from "drizzle-orm/gel-core";
import { doExtraction } from "$lib/api/result.remote";
import type { ClassSection } from "$lib/types/result-types";
import { page } from "$app/state";
import { goto, replaceState } from "$app/navigation";
import { localStore } from "$lib/utils";

const FILES_CONTEXT_KEY = Symbol("attachments-context");

export class FilesContext {
  files = $state<File[]>([]);
  uploads = $state<UploadedData[]>([]);
  fileInputRef = $state<HTMLInputElement | null>(null);
  openModal = $state(false);
  openResourceModal = $state(false);
  #selectedClass = $state<ClassSection | null>(null);

  constructor(uploads: UploadedData[], public doUpload?: boolean) {
    this.uploads = uploads;
    this.selectedClass = localStore("selected-class");
  }

  get selectedClass() {
    return this.#selectedClass ?? localStore("selected-class");
  }

  set selectedClass(v: ClassSection | null) {
    if (!v) return;
    localStore("selected-class", v);
    this.#selectedClass = v;
  }

  openFileDialog = () => {
    if (!this.fileInputRef) {
      toast.error("File input ref is not set");
      return;
    }
    this.fileInputRef?.click();
  };

  openFileDropZone = () => {
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

  onchange = async (event: Event) => {
    if (!this.selectedClass || !this.selectedClass.classId || !this.selectedClass.sectionId) {
      toast.error("Please select a class");
      return;
    }

    let files = (event.target as HTMLInputElement).files;
    if (!files?.length) return;
    this.files = [...this.files, ...files];
    const incoming = Array.from(files);
    this.#upload(incoming);
  };

  add = async (files: File[] | FileList) => {
    const incoming = Array.from(files);
    if (this.doUpload) this.#upload(incoming);
    this.files = [...this.files, ...incoming];
  };

  // Upload files with optional student data (used by drop-zone)
  uploadWithStudentData = (
    files: File[],
    studentData?: { studentId?: number; studentName?: string; admissionNo?: number }
  ) => {
    this.files = [...this.files, ...files];
    this.#upload(files, studentData);
  };

  #upload = (
    files: File[],
    studentData?: { studentId?: number; studentName?: string; admissionNo?: number }
  ) => {
    for (const file of files) {
      const fileId = generateId(); // Unique ID per file (not per batch)
      const upload: UploadedData = {
        id: fileId,
        filename: file.name,
        status: "uploading",
        success: false,
      };

      this.uploads = [...this.uploads, upload];
      const worker = this.#initWoeker(fileId, file.name);
      const { classId, sectionId, className, sectionName } = this.selectedClass || {};
      worker.postMessage({
        fileId,
        file,
        classId,
        sectionId,
        className,
        sectionName,
        studentId: studentData?.studentId,
        studentName: studentData?.studentName,
        admissionNo: studentData?.admissionNo,
      });
    }
  };

  retryUpload = (upload: UploadedData, selectedClass?: ClassSection) => {
    upload.status = "retrying";
    upload.success = false;
    this.updateUpload(upload);
    console.log("Retrying upload: ", upload);
    const worker = this.#initWoeker(upload.id, upload.filename);

    const { classId, sectionId, className, sectionName } = selectedClass || {};
    worker.postMessage({
      fileId: upload.id,
      filename: upload.filename,
      classId,
      sectionId,
      className,
      sectionName,
    });
  };

  #initWoeker = (fileId: string, name: string) => {
    const worker = new UploadWorker({ name: `upload-worker-${generateId()}` });
    worker.onmessage = ({ data }: MessageEvent<UploadedData>) => {
      if (!data.success) {
        const existing = this.uploads.find((u) => u.id === fileId);
        if (existing) {
          this.updateUpload({ ...existing, status: "error", success: false, error: data.error });
        }
        this.files = this.files.filter((u) => u.name !== name);
        console.log(`Upload failed: `, data.error);
        toast.error(data.error!);
        return;
      }

      // Update only this specific file's status
      this.uploads = this.uploads.map((u) =>
        u.id === fileId ? { ...u, ...data, success: true, status: data.status } : u
      );

      if (data.status === "pending") {
        toast.error("File saved retry extraction");
      }

      if (data.status === "done") {
        toast.success("File uploaded successfully");
        // this.openModal = false;
        console.log(`Upload success for ${name}:`, data);
      }
    };

    worker.onerror = (error) => {
      console.error(`Upload error for ${name}:`, error);
      const existing = this.uploads.find((u) => u.id === fileId);
      if (existing) {
        this.updateUpload({ ...existing, status: "error", success: false });
      }
      toast.error(`Failed to upload ${name}`);
    };

    return worker;
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
    const index = this.uploads.findIndex((u) => u.id === upload.id);
    if (index !== -1) {
      this.uploads[index] = upload;
    }
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
