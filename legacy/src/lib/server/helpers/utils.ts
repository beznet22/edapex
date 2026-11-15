// --- Helper Functions ---

import { sql } from "drizzle-orm";
import { genSaltSync, hashSync, compareSync } from "bcrypt-ts";
import { getRequestEvent } from "$app/server";
import type { DeviceInfo } from "$lib/types/auth-types";
import css from "$lib/components/template/style.css?inline";

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
 * Convert image URL or path to base64
 * Handles both local files and already base64 encoded strings
 * @param imageSource - Image path or existing base64 string
 * @param fallbackPath - Optional fallback path
 * @returns Base64 data URL string
 */
export function ensureBase64Image(imageSource: string, fallbackPath?: string): string {
  if (imageSource.startsWith("data:image/")) {
    return imageSource;
  }
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    console.warn(`Cannot convert remote URL to base64: ${imageSource}`);
    return imageSource;
  }

  return readFileToBase64DataUrl(imageSource, fallbackPath);
}

function readFileToBase64DataUrl(imagePath: string, fallbackPath?: string): string {
  try {
    const resolvePath = (p: string) => {
      if (existsSync(p)) return p;

      const projectPath = join(process.cwd(), p.startsWith("/") ? p.substring(1) : p);
      if (existsSync(projectPath)) return projectPath;

      const staticPath = join(process.cwd(), "static", p.startsWith("/") ? p.substring(1) : p);
      if (existsSync(staticPath)) return staticPath;

      return null;
    };

    let fullPath = resolvePath(imagePath);

    if (!fullPath && fallbackPath) {
      console.log("Image not found, trying fallback:", fallbackPath);
      fullPath = resolvePath(fallbackPath);
    }

    if (!fullPath) {
      console.warn(`Image not found: ${imagePath}`);
      return "";
    }

    const imageBuffer = readFileSync(fullPath);
    const mimeType = getMimeType(fullPath);

    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error converting image to base64: ${imagePath}`, error);
    return "";
  }
}

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
 * Convert SvelteKit page body and head to HTML string
 * @param body - SvelteKit page body
 * @param head - SvelteKit page head
 * @returns HTML string
 */
export function pageToHtml(body: string, head: string) {
  return `
        <!DOCTYPE html>
        <html>
          <head>
            ${head}
            <style>${css}</style>
          </head>
          <body>${body}</body>
        </html>
      `;
}
