//! PDF rendering for desktop and mobile.
//!
//! Web uses the `ironpress` npm package, lazily imported; this command is the native
//! half of the same contract. The template lives in TypeScript so both hosts render
//! identical markup — a report card produced on a phone must match the one produced in
//! a browser tab byte-for-byte in layout, and sharing the template is the only way to
//! guarantee that without maintaining two of them.

use edapex_documents::{html_to_pdf, PageSize, PdfOptions};
use serde::Deserialize;
use tauri::ipc::Response;

use crate::state::HostState;

/// Mirrors `PdfOptions` in `apps/web/lib/pdf.ts`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPdfInput {
    html: String,
    #[serde(default)]
    page_size: Option<String>,
    #[serde(default)]
    footer: Option<String>,
}

/// Returns PDF bytes as a raw response.
///
/// Deliberately not base64-in-JSON: a full report card is a few hundred KB, and base64
/// inflates it by a third while forcing a second copy through the IPC bridge. The raw
/// response path hands the WebView a byte array it can wrap in a `Blob` directly.
#[tauri::command]
pub fn render_pdf(_state: tauri::State<'_, HostState>, input: RenderPdfInput) -> Result<Response, String> {
    let page_size = match input.page_size.as_deref() {
        None | Some("a4") => PageSize::A4,
        Some("letter") => PageSize::Letter,
        Some(other) => return Err(format!("unsupported page size: {other}")),
    };

    let footer = match input.footer.as_deref() {
        None => None,
        Some("") => None,
        Some("page" | "default") => Some("Page {page} of {pages}"),
        Some(other) => return Err(format!("unsupported footer preset: {other}")),
    };

    let options = PdfOptions {
        page_size,
        footer,
        ..PdfOptions::default()
    };

    let bytes = html_to_pdf(&input.html, options).map_err(|error| error.to_string())?;
    Ok(Response::new(bytes))
}
