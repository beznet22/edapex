import type { UploadedData } from "$lib/types/chat-types";
import { generateId } from "ai";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";
import type { index } from "drizzle-orm/gel-core";
import { doExtraction } from "$lib/api/assessment.remote";
import type { ClassSection } from "$lib/types/result-types";
import { page } from "$app/state";
import { goto, replaceState } from "$app/navigation";
import { localStore } from "$lib/utils/index";
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

  references = $state<{ key: string; name: string; type: "file" | "dir"; mimeType?: string; fileId?: string; contentHash?: string; }[]>([]);

  addReference = (ref: { key: string; name: string; type: "file" | "dir"; mimeType?: string; fileId?: string; contentHash?: string; }) => {
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
    // The file pill renders from this.files regardless of class selection.
    // The server falls back to _system/ when no class is active, so we
    // allow the upload to proceed and surface a hint to the user instead
    // of silently swallowing the file.
    if (!this.selectedClass || !this.selectedClass.classId || !this.selectedClass.sectionId) {
      toast.warning("No class selected — file will land in _system/. Pick a class to scope it.");
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

  // Upload files with optional student data
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
      const activeName = upload.filename;
      const { classId, sectionId } = this.selectedClass || {};
      void this.#performUpload({
        fileId: activeId,
        file,
        filename,
        classId,
        sectionId,
        studentData,
        originalName: file.name,
        displayName: activeName,
      });
    }
  };

  retryUpload = (upload: UploadedData, selectedClass?: ClassSection) => {
    upload.status = "retrying";
    upload.success = false;
    this.updateUpload(upload);
    toast.info(`Retrying extraction for ${upload.filename}...`);
    console.log("Retrying upload: ", upload);

    const { classId, sectionId } = selectedClass || this.selectedClass || {};
    const studentData = upload.data?.fullName
      ? { studentName: String(upload.data.fullName), isStudentPhoto: false }
      : undefined;

    void this.#performUpload({
      fileId: upload.id,
      file: undefined,
      filename: upload.filename,
      classId,
      sectionId,
      studentData,
      originalName: upload.originalName ?? upload.filename,
      displayName: upload.filename,
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

  #performUpload = async (params: {
    fileId: string;
    file: File | undefined;
    filename: string;
    classId: number | null | undefined;
    sectionId: number | null | undefined;
    studentData?: {
      studentId?: number;
      studentName?: string;
      admissionNo?: number;
      isStudentPhoto?: boolean;
    };
    originalName: string;
    displayName: string;
  }) => {
    const { fileId, file, filename, classId, sectionId, studentData, originalName, displayName } = params;
    try {
      if (!file) {
        throw new Error("Cannot retry: original file is no longer available. Re-select the file.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("filename", filename);
      formData.append("kind", studentData?.isStudentPhoto ? "studentPhoto" : "document");
      if (classId != null) formData.append("classId", String(classId));
      if (sectionId != null) formData.append("sectionId", String(sectionId));
      if (studentData?.studentId) formData.append("studentId", String(studentData.studentId));
      if (studentData?.admissionNo) formData.append("admissionNo", String(studentData.admissionNo));

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errMsg = `Upload failed: HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.message) errMsg = errData.message;
          else if (errData.error) errMsg = errData.error;
        } catch (e) {
          void e;
        }
        throw new Error(errMsg);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.message || "Upload failed");
      }

      const ext = filename.split(".").pop() ?? file.name.split(".").pop() ?? "bin";
      const resolvedUrl: string = studentData?.isStudentPhoto
        ? result.photoUrl ?? `/uploads/students/${result.contentHash ?? fileId}.${ext}`
        : `/api/file/photos/${result.contentHash ?? fileId}.${ext}`;

      const resolvedId: string = result.documentId ?? result.fileId ?? fileId;

      this.uploads = this.uploads.map((u) =>
        u.id === fileId
          ? {
              ...u,
              id: resolvedId,
              status: "uploaded",
              success: true,
              url: resolvedUrl,
              filename,
              data: { ...(u.data ?? {}), ...result },
              originalName,
              token: result.token,
            }
          : u,
      );

      toast.info("File saved, pending extraction");
      console.log(`Upload success for ${displayName}:`, result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error occurred during upload";
      const existing = this.uploads.find((u) => u.id === fileId);
      if (existing) {
        this.updateUpload({ ...existing, status: "error", success: false, error: errMsg });
      }
      toast.error(errMsg);
      console.error(`Upload error for ${displayName}:`, error);
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
