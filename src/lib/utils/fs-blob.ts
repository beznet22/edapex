import { STATIC_DIR, UPLOADS_DIR } from "$lib/constants";
import { writeFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

export interface FsBlobResult {
  url: string;
  pathname: string;
  contentType: string;
}

/**
 * Custom file system blob storage that mimics @vercel/blob API
 */
export async function put(
  filename: string,
  buffer: ArrayBuffer | Buffer,
  opts: {
    access: "public" | "private";
    token?: string;
    contentType?: string;
  } = { access: "private" }
): Promise<FsBlobResult> {
  const uploadsDir = opts.access === "public" ? STATIC_DIR : UPLOADS_DIR;
  const tokenPath = opts.token || "";
  const filePath = join(uploadsDir, tokenPath, filename);

  // Ensure the full directory path exists (including token subdirectory)
  try {
    const fileDir = join(uploadsDir, tokenPath);
    await mkdir(fileDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create uploads directory:", error);
    throw new Error("Failed to create upload directory");
  }

  try {
    const fileBuffer = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;
    await writeFile(filePath, fileBuffer);
  } catch (error) {
    console.log("File path: ", filePath);
    console.error("Failed to save file:", error);
    throw new Error("Failed to save file");
  }

  // Return blob-like result matching @vercel/blob API
  const url = `/${tokenPath}/${filename}`;
  return {
    url,
    pathname: `${tokenPath}/${filename}`,
    contentType: opts.contentType || "application/octet-stream",
  };
}

/**
 * Delete a file from the uploads directory (optional additional function)
 */
export async function del(pathname: string): Promise<void> {
  if (!pathname) return;
  const filePath = join(UPLOADS_DIR, pathname);

  try {
    const { unlink } = await import("fs/promises");
    await unlink(filePath);
  } catch (error) {
    console.error("Failed to delete file:", error);
    throw error;
  }
}

/**
 * Get file info (optional additional function)
 */
export async function head(pathname: string): Promise<{ size: number; uploadedAt: Date }> {
  const filePath = join(UPLOADS_DIR, pathname);

  try {
    const stats = await stat(filePath);

    return {
      size: stats.size,
      uploadedAt: stats.mtime,
    };
  } catch (error) {
    console.error("Failed to get file info:", error);
    throw new Error("Failed to get file info");
  }
}

/**
 * Get file content and metadata
 */
export async function get(pathname: string): Promise<{
  buffer: Buffer;
  contentType: string;
  size: number;
  uploadedAt: Date;
}> {
  const filePath = join(UPLOADS_DIR, pathname);

  try {
    const { readFile, stat } = await import("fs/promises");
    const [fileBuffer, fileStats] = await Promise.all([readFile(filePath), stat(filePath)]);

    // Determine content type based on file extension
    const ext = pathname.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";

    // all supported file types
    switch (ext) {
      case "jpg":
      case "jpeg":
        contentType = "image/jpeg";
        break;
      case "png":
        contentType = "image/png";
        break;
      case "gif":
        contentType = "image/gif";
        break;
      case "webp":
        contentType = "image/webp";
        break;
      case "svg":
        contentType = "image/svg+xml";
        break;
      case "bmp":
        contentType = "image/bmp";
        break;
      case "ico":
        contentType = "image/x-icon";
        break;
      case "pdf":
        contentType = "application/pdf";
        break;
      case "txt":
        contentType = "text/plain";
        break;
      case "csv":
        contentType = "text/csv";
        break;
      case "json":
        contentType = "application/json";
        break;
      case "html":
        contentType = "text/html";
        break;
      case "md":
        contentType = "text/markdown";
        break;
      case "doc":
        contentType = "application/msword";
        break;
      case "docx":
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      case "xls":
        contentType = "application/vnd.ms-excel";
        break;
      case "xlsx":
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "ppt":
    }

    return {
      buffer: fileBuffer,
      contentType,
      size: fileStats.size,
      uploadedAt: fileStats.mtime,
    };
  } catch (error) {
    console.error("Failed to get file:", error);
    throw new Error("Failed to get file");
  }
}
