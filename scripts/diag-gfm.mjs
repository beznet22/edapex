// Diagnostic: see exactly what tiptap-markdown outputs for our actual file content.
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

const md = readFileSync("/home/beznet/Workspace/edapex/.workspaces/1/AY4-2025/2026/12-c_5-a/marksheets/adakole_jpg-0adbef75.md", "utf-8");

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

console.log("=== editor.getHTML() ===");
console.log(editor.getHTML());
console.log();
console.log("=== editor.storage.markdown.getMarkdown() ===");
console.log(editor.storage.markdown.getMarkdown());
console.log();
console.log("=== md === " + md.length + " bytes");
console.log("=== out === " + editor.getHTML().length + " bytes");

editor.destroy();
process.exit(0);
