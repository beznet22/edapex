// Worker to handle file uploads off the main thread
// This will be used to perform fetch requests for file uploads without blocking the UI

import type { UploadedData } from "$lib/types/chat-types";

interface UploadRequest {
  fileId: string;
  file?: File;
  filename?: string;
  classId?: number;
  sectionId?: number;
  className?: string;
  sectionName?: string;
  studentId?: number;
  studentName?: string;
  admissionNo?: number;
  isStudentPhoto?: boolean;
  originalName?: string;
}

// Listen for messages from the main thread
self.onmessage = async function (e) {
  const {
    fileId,
    file,
    filename,
    classId,
    sectionId,
    className,
    sectionName,
    studentId,
    studentName,
    admissionNo,
    isStudentPhoto,
    originalName,
  }: UploadRequest = e.data;
  console.log({
    fileId,
    file,
    filename,
    classId,
    sectionId,
    className,
    sectionName,
    studentId,
    studentName,
    admissionNo,
  });
  try {
    const formData = new FormData();
    if (filename) formData.append("filename", filename);
    if (file) formData.append("file", file);
    if (classId) formData.append("classId", classId.toString());
    if (sectionId) formData.append("sectionId", sectionId.toString());
    if (className) formData.append("className", className);
    if (sectionName) formData.append("sectionName", sectionName);
    if (studentId) formData.append("studentId", studentId.toString());
    if (studentName) formData.append("studentName", studentName);
    if (admissionNo) formData.append("admissionNo", admissionNo.toString());
    if (isStudentPhoto) formData.append("isStudentPhoto", isStudentPhoto.toString());
    if (fileId) formData.append("fileId", fileId);

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errMsg = `HTTP error! status: ${response.status}`;
      try {
        const errData = await response.json();
        if (errData.message) errMsg = errData.message;
        else if (errData.error) errMsg = errData.error;
      } catch (e) {}
      throw new Error(errMsg);
    }

    const { data, status, filename: name, success, error, url, token } = await response.json();
    if (!success) {
      throw new Error(error || "Upload failed");
    }

    const result: UploadedData = {
      id: fileId,
      filename: name || filename || "",
      success,
      status,
      data,
      originalName,
      error,
      url,
      token,
    };

    self.postMessage(result);
  } catch (error) {
    const result: UploadedData = {
      id: fileId,
      filename: filename || "",
      success: false,
      status: "error",
      originalName,
      error: error instanceof Error ? error.message : "Unknown error occurred during upload",
    };
    // Post the error back to the main thread
    self.postMessage(result);
  }
};
