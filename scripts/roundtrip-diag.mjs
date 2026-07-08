import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.DocumentFragment = dom.window.DocumentFragment;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = clearTimeout;

const { Editor } = await import("@tiptap/core");
const { Markdown } = await import("tiptap-markdown");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const { Table } = await import("@tiptap/extension-table");
const { TableRow } = await import("@tiptap/extension-table-row");
const { TableHeader } = await import("@tiptap/extension-table-header");
const { TableCell } = await import("@tiptap/extension-table-cell");

const brokenOcr = "| Field | Value |\n| --- | --- |\n\n| **Full Name:** | EMMANUEL ADAKOLE RYAN |\n\n| **Term:** | SECOND TERM |\n";
const cleanGfm = "| Field | Value |\n| --- | --- |\n| **Full Name:** | EMMANUEL ADAKOLE RYAN |\n| **Term:** | SECOND TERM |\n";

async function roundTrip(label, content) {
    const editor = new Editor({
        element: document.getElementById("root"),
        extensions: [
            StarterKit.configure({ codeBlock: false }),
            Markdown.configure({ html: false, tightLists: true, bulletListMarker: "-", tightListClass: "tight", linkify: false, breaks: false }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content,
    });
    const result = editor.storage.markdown.getMarkdown();
    console.log("--- " + label + " ---");
    console.log("INPUT  (" + content.length + " bytes):");
    console.log(JSON.stringify(content));
    console.log("OUTPUT (" + result.length + " bytes):");
    console.log(JSON.stringify(result));
    console.log("BYTE-IDENTICAL?", content === result);
    editor.destroy();
    console.log();
}

await roundTrip("BROKEN OCR", brokenOcr);
await roundTrip("CLEAN GFM", cleanGfm);
process.exit(0);
