// --- Helper Functions ---

import { sql } from "drizzle-orm";
import { genSaltSync, hashSync, compareSync } from "bcrypt-ts";
import { getRequestEvent } from "$app/server";
import type { DeviceInfo } from "$lib/types/auth-types";

// --- Auth Helpers ---
export const hashPwd = (pwd: string, rounds = 10) => hashSync(pwd, genSaltSync(rounds));
export const checkPwd = (plain: string, hash?: string | null) => !!hash && compareSync(plain, hash);
export const now = () => Math.floor(Date.now() / 1000);

export function getDevice(): DeviceInfo {
  const evt = getRequestEvent();
  const ua = evt.request.headers.get("user-agent") || "";
  const ip = evt.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || evt.getClientAddress();
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome")
    ? "Chrome"
    : ua.includes("Firefox")
    ? "Firefox"
    : ua.includes("Safari")
    ? "Safari"
    : "Other";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac")
    ? "macOS"
    : ua.includes("Linux")
    ? "Linux"
    : ua.includes("Android")
    ? "Android"
    : /iPhone|iPad/.test(ua)
    ? "iOS"
    : "Other";
  return { browser, os, ip };
}

/**
 * JSON Array Aggregation Builder
 * A mini builder pattern for creating JSON_ARRAYAGG SQL expressions
 *
 * @example
 * const titles = jsonArrayAgg(smExamSetups.examTitle)
 *   .distinct()
 *   .orderBy(smExamSetups.id)
 *   .build<string[]>();
 *
 * const marks = jsonArrayAgg(smMarkStores.totalMarks)
 *   .orderBy(smExamSetups.id)
 *   .build<number[]>();
 */
export function jsonArrayAgg(column: any) {
  let isDistinct = false;
  let orderByColumn: any = null;

  return {
    distinct() {
      isDistinct = true;
      return this;
    },
    orderBy(col: any) {
      orderByColumn = col;
      return this;
    },
    build<T = any>() {
      if (isDistinct && orderByColumn) {
        return sql<T>`JSON_ARRAYAGG(DISTINCT ${column} ORDER BY ${orderByColumn})`;
      } else if (isDistinct) {
        return sql<T>`JSON_ARRAYAGG(DISTINCT ${column})`;
      } else if (orderByColumn) {
        return sql<T>`JSON_ARRAYAGG(${column} ORDER BY ${orderByColumn})`;
      } else {
        return sql<T>`JSON_ARRAYAGG(${column})`;
      }
    },
  };
}

import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Convert an image file to base64 data URL
 * @param imagePath - Path to the image file (relative to project root or absolute)
 * @param fallbackPath - Optional fallback path if the main image doesn't exist
 * @returns Base64 data URL string or empty string if file not found
 */
export function imageToBase64(imagePath: string, fallbackPath?: string): string {
  try {
    let fullPath = imagePath;

    // If path starts with '/', treat it as relative to static directory
    if (imagePath.startsWith("/")) {
      fullPath = join(process.cwd(), "static", imagePath.substring(1));
    } else if (!imagePath.startsWith("/") && !imagePath.includes(":")) {
      // Relative path - resolve from project root
      fullPath = join(process.cwd(), imagePath);
    }

    // Check if file exists, try fallback if provided
    if (!existsSync(fullPath) && fallbackPath) {
      if (fallbackPath.startsWith("/")) {
        fullPath = join(process.cwd(), "static", fallbackPath.substring(1));
      } else {
        fullPath = join(process.cwd(), fallbackPath);
      }
    }

    // If still doesn't exist, return empty string
    if (!existsSync(fullPath)) {
      console.warn(`Image not found: ${imagePath}`);
      return "";
    }

    // Read the file
    const imageBuffer = readFileSync(fullPath);

    // Determine MIME type from file extension
    const mimeType = getMimeType(fullPath);

    // Convert to base64
    const base64 = imageBuffer.toString("base64");

    // Return data URL
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Error converting image to base64: ${imagePath}`, error);
    return "";
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();

  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
  };

  return mimeTypes[ext || ""] || "image/jpeg";
}

/**
 * Convert multiple images to base64 in parallel
 * @param imagePaths - Array of image paths
 * @returns Array of base64 data URLs
 */
export function imagesToBase64(imagePaths: string[]): string[] {
  return imagePaths.map((path) => imageToBase64(path));
}

/**
 * Convert image URL or path to base64
 * Handles both local files and already base64 encoded strings
 * @param imageSource - Image path or existing base64 string
 * @param fallbackPath - Optional fallback path
 * @returns Base64 data URL string
 */
export function ensureBase64Image(imageSource: string, fallbackPath?: string): string {
  // If already base64, return as is
  if (imageSource.startsWith("data:image/")) {
    return imageSource;
  }

  // If it's a URL (http/https), return as is (can't convert server-side)
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    console.warn(`Cannot convert remote URL to base64: ${imageSource}`);
    return imageSource;
  }

  // Convert local file to base64
  return imageToBase64(imageSource, fallbackPath);
}

/**
 * Convert SvelteKit page body and head to HTML string
 * @param body - SvelteKit page body
 * @param head - SvelteKit page head
 * @returns HTML string
 */
export function pageToHtml(body: string, head: string) {
  const cssPath = join(process.cwd(), "src/lib/components/template/style.css");
  const cssContent = readFileSync(cssPath, "utf-8");

  return `
        <!DOCTYPE html>
        <html>
          <head>
            ${head}
            <style>${cssContent}</style>
          </head>
          <body>${body}</body>
        </html>
      `;
}
