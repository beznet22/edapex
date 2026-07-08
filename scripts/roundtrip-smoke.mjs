// Round-trip smoke test: verify tiptap-markdown round-trips `# Hello\n\n- a\n- b`.
// Run with: node scripts/roundtrip-smoke.mjs
import { JSDOM } from "jsdom";

const dom = new JSDOM(
    "<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>",
);
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

const editor = new Editor({
    element: document.getElementById("root"),
    extensions: [
        StarterKit.configure({ codeBlock: false }),
        Markdown.configure({
            html: false,
            tightLists: true,
            bulletListMarker: "-",
            tightListClass: "tight",
            linkify: false,
            breaks: false,
        }),
    ],
    content: "# Hello\n\n- a\n- b",
});

const result = editor.storage.markdown.getMarkdown();
const expected = "# Hello\n\n- a\n- b";
const normalize = (s) => s.replace(/\n+$/, "");
const match = normalize(result) === normalize(expected);

console.log("Input:   ", JSON.stringify(expected));
console.log("Output:  ", JSON.stringify(result));
console.log("Match (modulo trailing newline):", match);

editor.destroy();
process.exit(match ? 0 : 1);
