import type { UploadedData } from "$lib/types/chat-types";
import { generateId } from "ai";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";
import UploadWorker from "$lib/chat/upload-worker.ts?worker";
import type { index } from "drizzle-orm/gel-core";
import { doExtraction } from "$lib/api/assessment.remote";
import type { ClassSection } from "$lib/types/result-types";
import { page } from "$app/state";
import { goto, replaceState } from "$app/navigation";
import { localStore } from "$lib/utils";
import { getResources } from "$lib/api/chat.remote";

import { SelectedClass } from "./sync.svelte";
const FILES_CONTEXT_KEY = Symbol("attachments-context");

export class FilesContext {
  files = $state<File[]>([]);
  uploads = $state<UploadedData[]>([]);
  fileInputRef = $state<HTMLInputElement | null>(null);
  openModal = $state(false);
  openResourceModal = $state(false);
  openFileStoreModal = $state(false);

  constructor(uploads: UploadedData[], public doUpload?: boolean) {
    this.rehydrate(uploads);
  }

  rehydrate(uploads: UploadedData[]) {
    this.uploads = uploads;
  }

  get selectedClass() {
    return SelectedClass.fromContext().data;
  }

  set selectedClass(v: ClassSection | null) {
    SelectedClass.fromContext().data = v;
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
    const incoming = Array.from(files);
    this.files = [...this.files, ...incoming];
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
    studentData?: {
      studentId?: number;
      studentName?: string;
      admissionNo?: number;
      isStudentPhoto?: boolean;
    }
  ) => {
    this.files = [...this.files, ...files];
    this.#upload(files, studentData);
  };

  #upload = (
    files: File[],
    studentData?: {
      studentId?: number;
      studentName?: string;
      admissionNo?: number;
      isStudentPhoto?: boolean;
    }
  ) => {
    for (const file of files) {
      const fileId = generateId(); // Unique ID per file (not per batch)
      const upload: UploadedData = {
        id: fileId,
        filename: studentData?.studentName ? `${studentData.studentName}.jpg` : file.name,
        originalName: file.name,
        status: "uploading",
        success: false,
      };

      this.uploads = [...this.uploads, upload];
      const worker = this.#initWoeker(fileId, upload.filename);
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
        isStudentPhoto: studentData?.isStudentPhoto,
        originalName: file.name,
      });
    }
  };

  retryUpload = (upload: UploadedData, selectedClass?: ClassSection) => {
    upload.status = "retrying";
    upload.success = false;
    this.updateUpload(upload);
    toast.info(`Retrying extraction for ${upload.filename}...`);
    console.log("Retrying upload: ", upload);

    // If it's a permanent file, we might not have the original File object
    // but the backend handles "retry by filename" if it exists in UPLOADS_DIR.
    // However, if it was already "done", we might not need to retry unless we want to re-extract.

    const worker = this.#initWoeker(upload.id, upload.filename);
    const { classId, sectionId, className, sectionName } = selectedClass || this.selectedClass || {};
    worker.postMessage({
      fileId: upload.id,
      filename: upload.filename,
      classId,
      sectionId,
      className,
      sectionName,
      originalName: upload.originalName,
    });
  };

  loadResources = async () => {
    const { className, sectionName } = this.selectedClass || {};

    try {
      let result;
      if (className && sectionName) {
        result = await getResources({ className, sectionName });
      } else {
        result = await getResources({});
      }
      if (result.success) {
        this.uploads = result.resources;
      }
    } catch (error) {
      console.error("Failed to load resources:", error);
    }
  };

  deleteFile = async (upload: UploadedData) => {
    const params = new URLSearchParams();
    if (upload.status === "pending" || upload.status === "error") {
      params.append("filename", upload.filename);
    } else if (upload.status === "done") {
      params.append("fileId", upload.id);
    }

    try {
      const resp = await fetch(`/api/uploads?${params.toString()}`, {
        method: "DELETE",
      });

      if (resp.ok) {
        this.uploads = this.uploads.filter((u) => u.id !== upload.id);
        toast.success("File deleted");
      } else {
        toast.error("Failed to delete file");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("An error occurred while deleting the file");
    }
  };

  #initWoeker = (fileId: string, name: string) => {
    const worker = new UploadWorker({ name: `upload-worker-${generateId()}` });
    worker.onmessage = ({ data }: MessageEvent<UploadedData>) => {
      if (!data.success) {
        const existing = this.uploads.find((u) => u.id === fileId);
        if (existing) {
          this.updateUpload({ ...existing, status: "error", success: false, error: data.error });
        }
        // Don't remove from this.files, just show error in UI
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
