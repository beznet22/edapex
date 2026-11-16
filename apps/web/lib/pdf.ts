"use client";

/**
 * PDF rendering, dispatched by host.
 *
 * Web: the `ironpress` npm package, dynamically imported so the 6.4 MB gzip WASM never
 * reaches the initial bundle.
 * Desktop and mobile: the `render_pdf` Tauri command over `crates/documents`.
 *
 * Both take the same HTML, which is why templates live in TypeScript. See
 * `lib/templates/`.
 *
 * **Never server-side.** The WASM is far outside a Worker's size limit and the native
 * crate cannot run in a Worker at all, so `sms-api` returns data and the device that
 * asked for the document renders it.
 */

import { isTauriHost } from "@/lib/platform";

export type PdfPageSize = "a4" | "letter";
export type PdfFooter = "page" | "none";

export interface PdfRenderOptions {
  readonly pageSize?: PdfPageSize;
  readonly footer?: PdfFooter;
}

/** IronPress needs this much headroom; the crate enforces the same cap. */
const MAX_HTML_BYTES = 8 * 1024 * 1024;

/**
 * Renders HTML to PDF bytes.
 *
 * Returns bytes rather than a Blob so the caller decides whether to download, preview,
 * or attach. That matters for the archive flow, which stores the bytes and only offers
 * a download link.
 */
export async function renderPdf(
  html: string,
  options: PdfRenderOptions = {}
): Promise<Uint8Array> {
  if (html.length === 0) {
    throw new Error("Cannot render an empty document.");
  }
  // Checked here as well as in Rust: the browser would otherwise try to lay out a
  // pathological document before failing, and on a mid-range phone that is a visible
  // hang rather than an error.
  if (html.length > MAX_HTML_BYTES) {
    throw new Error("Document is too large to render as a PDF.");
  }

  return isTauriHost() ? renderNative(html, options) : renderWeb(html, options);
}

async function renderNative(
  html: string,
  options: PdfRenderOptions
): Promise<Uint8Array> {
  const { invokeCommand } = await import("@/lib/tauri");
  const bytes = await invokeCommand<ArrayBuffer>("render_pdf", {
    input: {
      html,
      pageSize: options.pageSize ?? "a4",
      footer: options.footer ?? "none"
    }
  });
  return new Uint8Array(bytes);
}

interface IronpressModule {
  readonly default: (moduleOrPath?: string | URL) => Promise<unknown>;
  readonly HtmlConverter: new () => {
    pageSize: (name: string) => void;
    footer: (text: string) => void;
    htmlToPdf: (html: string) => Uint8Array;
    free: () => void;
  };
}

async function renderWeb(html: string, options: PdfRenderOptions): Promise<Uint8Array> {
  // A dynamic import keeps the whole engine (15.7 MB raw, 6.4 MB gzip) out of the
  // initial bundle and off the critical path. Cast through `unknown` because the
  // package ships wasm-bindgen types whose module shape differs from the ESM default.
  const module = (await import("ironpress")) as unknown as IronpressModule;
  // Resolve the binary through Vite rather than letting the package fall back to its
  // own `new URL(..., import.meta.url)`: an explicit `?url` import is a build-time
  // contract, so a future change to the package's layout fails the build instead of
  // silently 404ing on the first export a teacher attempts.
  await module.default();

  const converter = new module.HtmlConverter();
  try {
    converter.pageSize(options.pageSize === "letter" ? "Letter" : "A4");
    // `none` is the default; passing it explicitly would add a footer bar.
    if (options.footer === "page") converter.footer("Page {page} of {pages}");
    return converter.htmlToPdf(html);
  } finally {
    // wasm-bindgen objects hold a linear-memory allocation. Without this every export
    // leaks until the page is reloaded, which on a phone is the difference between
    // three exports and thirty.
    converter.free();
  }
}

/** Wraps bytes for download. Kept here so callers never hand-roll the MIME type. */
export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/**
 * Triggers a download of the rendered document.
 *
 * The object URL is revoked on the next frame rather than immediately: revoking
 * synchronously can cancel the download in Safari, which is the one browser a school
 * iPad is most likely to be running.
 */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(pdfBlob(bytes));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
