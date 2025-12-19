// Worker to handle file uploads off the main thread
// This will be used to perform fetch requests for file uploads without blocking the UI

import type { UploadedData } from "$lib/types/chat-types";
interface UploadRequest {
  fileId: string;
  file?: File;
  name: string;
}

// Listen for messages from the main thread
self.onmessage = async function (e) {
  const { fileId, file, name }: UploadRequest = e.data;
  console;
  try {
    const formData = new FormData();
    if (name) formData.append("filename", name);
    if (file) formData.append("file", file);

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data, status, filename } = await response.json();
    const result: UploadedData = {
      id: fileId,
      filename,
      success: status === "pending" || status === "done",
      status,
      data,
    };

    self.postMessage(result);
  } catch (error) {
    const result: UploadedData = {
      id: fileId,
      filename: name,
      success: false,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error occurred during upload",
    };

    // Post the error back to the main thread
    self.postMessage(result);
  }
};
