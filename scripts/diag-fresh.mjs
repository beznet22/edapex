// Diagnostic: confirm whether tiptap-markdown serializer mangles clean GFM.
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

// Hardcoded clean GFM in memory.
const cleanGfm = `| Field | Value |
| --- | --- |
| **Full Name:** | EMMANUEL ADAKOLE RYAN |
| **Term:** | SECOND TERM |

- A
- B
- C
`;

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
    content: cleanGfm,
});

console.log("=== INPUT (in-memory clean GFM, " + cleanGfm.length + " bytes) ===");
console.log(JSON.stringify(cleanGfm));
console.log();
console.log("=== OUTPUT (tiptap-markdown serialization) ===");
console.log(JSON.stringify(editor.storage.markdown.getMarkdown()));
console.log();
console.log("=== editor.getHTML() ===");
console.log(editor.getHTML());
editor.destroy();
process.exit(0);
