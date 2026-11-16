/**
 * Shared HTML for PDF templates.
 *
 * The template is TypeScript, not Rust, so web and native render identical markup from
 * one source. That is the whole reason `crates/documents` only takes an HTML string:
 * two template implementations would drift, and a report card that differs between the
 * phone and the browser tab is a support ticket nobody can reproduce.
 *
 * **Colours are hard-coded, never tokens.** A report card is a printed document, so it
 * stays light even when the app is in dark mode. Pulling `--background` here would
 * produce a black page on a school printer.
 */

/** Escapes text for HTML. IronPress sanitises as a backstop; this is the primary guard. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes, and renders a nullish value as an em dash rather than the string "null". */
export function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return escapeHtml(String(value));
}

/**
 * Builds a data URI for an inline image.
 *
 * The archive stores the logo and photo base64-encoded without a MIME prefix, which is
 * why the caller passes the type. Returning null for empty input lets templates omit
 * the element instead of rendering a broken image box.
 */
export function dataUri(value: string | null | undefined, mime: string): string | null {
  if (!value) return null;
  if (value.startsWith("data:")) return value;
  return `data:${mime};base64,${value}`;
}

export interface DocumentShellOptions {
  readonly title: string;
  readonly body: string;
  readonly footerNote: string;
}

/**
 * Wraps a body in the document shell.
 *
 * Fonts are named in a stack rather than embedded: IronPress ships core Latin coverage,
 * and embedding a school's brand font would add hundreds of KB to every export for no
 * legibility gain in a table of marks.
 */
export function documentShell({ title, body, footerNote }: DocumentShellOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 0; }
  :root { color-scheme: light only; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #17150f;
    background: #ffffff;
  }
  .page { padding: 32pt 34pt 40pt; }
  .masthead {
    display: flex;
    align-items: flex-start;
    gap: 14pt;
    padding-bottom: 10pt;
    border-bottom: 1.5pt solid #17150f;
  }
  .masthead .logo { width: 52pt; height: 52pt; object-fit: contain; }
  .masthead .identity { flex: 1; }
  .masthead h1 {
    margin: 0;
    font-size: 15pt;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .masthead .contact { margin-top: 2pt; font-size: 8pt; color: #57534a; }
  .masthead .doc-title {
    text-align: right;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: #57534a;
  }
  .masthead .doc-title strong { display: block; font-size: 12pt; color: #17150f; }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6pt 22pt;
    margin: 14pt 0 4pt;
    padding: 10pt 12pt;
    background: #faf9f6;
    border: 0.5pt solid #e2ded3;
  }
  .fact { min-width: 96pt; }
  .fact dt {
    margin: 0;
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #6b665c;
  }
  .fact dd { margin: 1pt 0 0; font-size: 10pt; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 14pt; }
  thead th {
    padding: 5pt 6pt;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: left;
    color: #57534a;
    border-bottom: 1pt solid #17150f;
  }
  thead th.num, tbody td.num { text-align: right; }
  tbody td { padding: 5pt 6pt; border-bottom: 0.5pt solid #e2ded3; }
  tbody tr:last-child td { border-bottom: 1pt solid #17150f; }
  td.subject { font-weight: 600; }
  td.absent { color: #8a2b1f; font-weight: 600; }
  .grade {
    display: inline-block;
    min-width: 16pt;
    padding: 1pt 4pt;
    border-radius: 2pt;
    font-size: 8pt;
    font-weight: 700;
    text-align: center;
    background: #efece3;
  }
  .summary {
    display: flex;
    justify-content: flex-end;
    gap: 26pt;
    margin-top: 12pt;
    padding-top: 8pt;
  }
  .summary .item { text-align: right; }
  .summary .label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #6b665c;
  }
  .summary .value { font-size: 13pt; font-weight: 700; }
  h2 {
    margin: 20pt 0 0;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: #57534a;
  }
  .ratings { display: flex; flex-wrap: wrap; gap: 6pt 18pt; margin-top: 6pt; }
  .rating { min-width: 120pt; padding: 4pt 0; border-bottom: 0.5pt dotted #cfc9bb; }
  .rating .attr { font-size: 8pt; color: #6b665c; }
  .rating .val { font-weight: 600; }
  .remark {
    margin-top: 6pt;
    padding: 9pt 11pt;
    background: #faf9f6;
    border-left: 2pt solid #17150f;
    font-size: 9.5pt;
  }
  .doc-footer {
    margin-top: 18pt;
    padding-top: 6pt;
    border-top: 0.5pt solid #cfc9bb;
    font-size: 7pt;
    color: #6b665c;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body><div class="page">${body}
<div class="doc-footer"><span>${escapeHtml(footerNote)}</span><span>Generated by EdApex</span></div>
</div></body>
</html>`;
}
