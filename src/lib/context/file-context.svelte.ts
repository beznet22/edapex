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

  references = $state<{ key: string; name: string; type: "file" | "dir" }[]>([]);

  addReference = (ref: { key: string; name: string; type: "file" | "dir" }) => {
    if (!this.references.find(r => r.key === ref.key)) {
      this.references = [...this.references, ref];
    }
  };

  removeReference = (key: string) => {
    this.references = this.references.filter((r) => r.key !== key);
  };

  #selectedContext: SelectedClass;

  constructor(uploads: UploadedData[], selectedClass: SelectedClass, public doUpload?: boolean) {
    this.rehydrate(uploads);
    this.#selectedContext = selectedClass;
  }

  rehydrate(uploads: UploadedData[]) {
    this.uploads = uploads;
  }

  get selectedClass() {
    return this.#selectedContext.data;
  }

  set selectedClass(v: ClassSection | null) {
    this.#selectedContext.data = v;
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
      const filename = studentData?.studentName || file.name;
      
      const upload: UploadedData = {
        id: fileId,
        filename,
        originalName: file.name,
        status: "uploading",
        success: false,
        url: URL.createObjectURL(file), // Generate local preview URL
        type: file.type, // Pass type so UI correctly renders the thumbnail
        data: studentData?.studentName ? { fullName: studentData.studentName } : undefined
      };

      // Find an existing UI element using a reliable identifier (evaluate student.name or filename)
      const existingIdx = this.uploads.findIndex(u => {
        if (studentData?.studentName) {
           return u.filename === `${studentData.studentName}.jpg` || 
                  u.filename === studentData.studentName || 
                  (u.data && (u.data as any).fullName === studentData.studentName);
        }
        return u.filename === filename || u.originalName === file.name;
      });

      if (existingIdx !== -1) {
         // Preserve existing ID to maintain UI reactivity and prevent orphaned components
         upload.id = this.uploads[existingIdx].id;
         this.uploads[existingIdx] = upload;
      } else {
         this.uploads = [...this.uploads, upload];
      }

      // Important: Use upload.id here as it might have been reassigned to the existing ID
      const activeId = upload.id;
      const worker = this.#initWoeker(activeId, upload.filename);
      const { classId, sectionId, className, sectionName } = this.selectedClass || {};
      worker.postMessage({
        fileId: activeId,
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
    params.append("fileId", upload.id);

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
      // Always update the upload state to ensure UI stops the loading spinner
      // We explicitly map only the new fields so that we don't destructively overwrite
      // optimistic properties like filename, data, and url if the worker returns an error or empty
      this.uploads = this.uploads.map((u) =>
        u.id === fileId ? { 
          ...u, 
          id: data.id || u.id, 
          status: data.status,
          success: data.success,
          error: data.error,
          filename: data.filename || u.filename,
          url: data.url || u.url,
          data: data.data || u.data,
          originalName: data.originalName || u.originalName,
          token: data.token || u.token
        } : u
      );

      if (!data.success) {
        // If HTTP request failed or pure error from worker
        toast.error(data.error || "Upload failed");
        return;
      }

      if (data.status === "error") {
        toast.error(data.error || "Failed to extract file. File saved, pending extraction.");
      } else if (data.status === "uploaded") {
        toast.info("File saved, pending extraction");
      } else if (["extracted", "approved", "published"].includes(data.status)) {
        toast.success("File uploaded successfully");
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
