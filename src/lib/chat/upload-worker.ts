// Worker to handle file uploads off the main thread
// This will be used to perform fetch requests for file uploads without blocking the UI

import type { UploadedData } from "$lib/types/chat-types";
import type { ClassSection } from "$lib/types/result-types";
interface UploadRequest {
  fileId: string;
  file?: File;
  filename?: string;
  classId?: number;
  sectionId?: number;
}

// Listen for messages from the main thread
self.onmessage = async function (e) {
  const { fileId, file, filename, classId, sectionId }: UploadRequest = e.data;
  console.log({ fileId, file, filename, classId, sectionId });
  try {
    const formData = new FormData();
    if (filename) formData.append("filename", filename);
    if (file) formData.append("file", file);
    if (classId) formData.append("classId", classId.toString());
    if (sectionId) formData.append("sectionId", sectionId.toString());

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data, status, filename: name, success, error } = await response.json();
    if (!success) {
      throw new Error(`Upload failed: ${error}`);
    }

    const result: UploadedData = {
      id: fileId,
      filename: name || filename || "",
      success,
      status,
      data,
    };

    self.postMessage(result);
  } catch (error) {
    const result: UploadedData = {
      id: fileId,
      filename: filename || "",
      success: false,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error occurred during upload",
    };
    // Post the error back to the main thread
    self.postMessage(result);
  }
};
