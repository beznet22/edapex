// Diagnostic: see what tiptap-markdown does to my proper GFM.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

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

// Read the CURRENT file (post user edit).
const filePath = "/home/beznet/Workspace/edapex/.workspaces/1/AY4-2025/2026/12-c_5-a/marksheets/adakole_jpg-0adbef75.md";
const md = readFileSync(filePath, "utf-8");

console.log("=== INPUT (file on disk, " + md.length + " bytes) ===");
console.log(md);
console.log("---");

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
    content: md,
});

const out = editor.storage.markdown.getMarkdown();
console.log("=== OUTPUT (tiptap-markdown serialization, " + out.length + " bytes) ===");
console.log(out);

const normalize = (s) => s.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
console.log("=== POST-NORMALIZE MATCH? ===");
console.log("input  normalized:", JSON.stringify(normalize(md)));
console.log("output normalized:", JSON.stringify(normalize(out)));
console.log("EQUAL?", normalize(md) === normalize(out));
editor.destroy();
process.exit(0);
