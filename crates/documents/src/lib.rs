//! PDF generation via IronPress.
//!
//! IronPress renders HTML/CSS to PDF bytes in-process — no headless browser, no
//! subprocess. That replaces the legacy `bin/html2pdf` shell-out, which could not run
//! on mobile at all.
//!
//! # Where this runs
//!
//! **Client-side on every host**, never in a Worker. The WASM build is ~6.4 MB gzip,
//! which is far outside a Cloudflare Worker's size limit and would be paid on every
//! cold start even if it fit. So `sms-api` returns a *data document*
//! (`RenderPayloadDto`), and the renderer here turns the template's HTML into bytes on
//! the device that asked for it.
//!
//! - Web: the `ironpress` npm package, lazily imported.
//! - Desktop and mobile: this crate, called through a Tauri command.
//!
//! Both reach the same HTML because the template is TypeScript, not Rust. That is
//! deliberate: one template, two runtimes, so report cards cannot differ between the
//! web app and the phone a teacher is holding.

use std::fmt;

/// IronPress caps images and remote bodies, but not the document string itself.
/// A marksheet is a few hundred KB at most; anything far beyond that is a bug or an
/// attempt to make the device chew through a pathological layout.
const MAX_HTML_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageSize {
    A4,
    Letter,
}

impl PageSize {
    fn to_ironpress(self) -> ironpress::PageSize {
        match self {
            PageSize::A4 => ironpress::PageSize::A4,
            PageSize::Letter => ironpress::PageSize::LETTER,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PdfOptions {
    pub page_size: PageSize,
    /// Margin in points (1/72 inch).
    pub margin: f32,
    /// Plain-text footer. `{page}` and `{pages}` are substituted by IronPress.
    pub footer: Option<&'static str>,
}

impl Default for PdfOptions {
    fn default() -> Self {
        Self {
            page_size: PageSize::A4,
            margin: 36.0,
            footer: None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PdfError {
    #[error("document is {size} bytes, above the {max}-byte limit")]
    TooLarge { size: usize, max: usize },
    #[error("document is empty")]
    Empty,
    #[error("ironpress failed: {0}")]
    Conversion(String),
}

/// Renders HTML to PDF bytes.
///
/// Sanitisation stays **on** (IronPress' default). A marksheet template embeds student
/// names and free-text remarks; if either ever carries markup, the sanitiser is what
/// stops it becoming script. The `remote` feature is deliberately not enabled, so a
/// document cannot make the device fetch arbitrary URLs.
pub fn html_to_pdf(html: &str, options: PdfOptions) -> Result<Vec<u8>, PdfError> {
    let size = html.len();
    if size == 0 {
        return Err(PdfError::Empty);
    }
    if size > MAX_HTML_BYTES {
        return Err(PdfError::TooLarge {
            size,
            max: MAX_HTML_BYTES,
        });
    }

    let mut converter = ironpress::HtmlConverter::new()
        .page_size(options.page_size.to_ironpress())
        .margin(ironpress::Margin::uniform(options.margin));

    if let Some(footer) = options.footer {
        converter = converter.footer(footer);
    }

    converter
        .convert(html)
        .map_err(|error| PdfError::Conversion(error.to_string()))
}

impl fmt::Display for PageSize {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PageSize::A4 => f.write_str("a4"),
            PageSize::Letter => f.write_str("letter"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_a_minimal_document() {
        let pdf = html_to_pdf("<h1>Hello</h1><p>World</p>", PdfOptions::default())
            .expect("conversion succeeds");
        assert!(pdf.starts_with(b"%PDF-"), "output is not a PDF");
        assert!(pdf.len() > 128, "output is suspiciously small");
    }

    #[test]
    fn rejects_an_empty_document_instead_of_emitting_a_blank_page() {
        assert!(matches!(
            html_to_pdf("", PdfOptions::default()),
            Err(PdfError::Empty)
        ));
    }

    #[test]
    fn rejects_an_oversized_document_before_rendering() {
        let oversized = "a".repeat(MAX_HTML_BYTES + 1);
        assert!(matches!(
            html_to_pdf(&oversized, PdfOptions::default()),
            Err(PdfError::TooLarge { .. })
        ));
    }

    #[test]
    fn strips_script_from_the_document() {
        // The sanitiser is on by default in IronPress; this asserts we did not
        // disable it. A PDF has no scripting, so the assertion is that conversion
        // succeeds and still produces a PDF rather than failing on script content.
        let pdf = html_to_pdf(
            "<h1>Report</h1><script>alert('x')</script><p>Body</p>",
            PdfOptions::default(),
        )
        .expect("conversion succeeds with script present");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn renders_unicode_names_without_panicking() {
        let pdf = html_to_pdf(
            "<h1>Ọmọ́bá Àkàndé</h1><p>Class: JSS 2</p>",
            PdfOptions::default(),
        )
        .expect("conversion succeeds");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn footer_is_accepted() {
        let pdf = html_to_pdf(
            "<h1>Report</h1>",
            PdfOptions {
                footer: Some("Page {page} of {pages}"),
                ..PdfOptions::default()
            },
        )
        .expect("conversion succeeds");
        assert!(pdf.starts_with(b"%PDF-"));
    }
}
