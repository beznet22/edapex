// Worker to handle file uploads off the main thread
// This will be used to perform fetch requests for file uploads without blocking the UI

import type { TaskData, UploadedData } from "$lib/types/chat-types";
interface UploadRequest {
  id: string;
  file: File;
}

// Listen for messages from the main thread
self.onmessage = async function (e) {
  const { id, file }: UploadRequest = e.data;
  console.log("UploadID: ", id);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const task = await response.json();
    console.log("Task: ", task);
    const result: UploadedData = {
      id,
      filename: file.name,
      mediaType: file.type,     
      success: task.status === "queued" || task.status === "done",
      data: task
    };
    // Post the result back to the main thread
    self.postMessage(result);
  } catch (error) {
    const result: UploadedData = {
      id,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred during upload",
      data: {
        taskId: id,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error occurred during upload",
      },
    };

    // Post the error back to the main thread
    self.postMessage(result);
  }
};
