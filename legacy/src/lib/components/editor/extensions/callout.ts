import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownNodeSpec } from "tiptap-markdown";

export const CALLOUT_TYPES = ["note", "tip", "warning", "caution", "important"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

const DEFAULT_TYPE: CalloutType = "note";

function normalizeType(raw: string | undefined): CalloutType {
  if (!raw) return DEFAULT_TYPE;
  const lower = raw.toLowerCase();
  return (CALLOUT_TYPES as readonly string[]).includes(lower)
    ? (lower as CalloutType)
    : DEFAULT_TYPE;
}

export const Callout = Node.create({
  name: "callout",

  group: "block",

  defining: true,

  content: "block+",

  addAttributes() {
    return {
      type: {
        default: DEFAULT_TYPE,
        parseHTML: (element: HTMLElement) =>
          normalizeType(element.getAttribute("data-type") ?? undefined),
        renderHTML: (attributes: { type: CalloutType }) => ({ "data-type": attributes.type }),
      },
      title: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.querySelector("[data-callout-title]")?.textContent?.trim() ?? "",
        renderHTML: (attributes: { title: string }) =>
          attributes.title ? { "data-callout-title-rendered": attributes.title } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "aside[data-callout]",
        contentElement: "[data-callout-content]",
      },
    ] as const;
  },

  renderHTML({ HTMLAttributes, node }) {
    const type = (node.attrs.type as CalloutType) ?? DEFAULT_TYPE;
    const title = (node.attrs.title as string) || type;
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "",
        class: `tiptap-callout tiptap-callout--${type}`,
      }),
      ["div", { "data-callout-title": "", class: "tiptap-callout-title" }, title],
      ["div", { "data-callout-content": "", class: "tiptap-callout-content" }, 0],
    ];
  },

  addStorage() {
    const markdown: MarkdownNodeSpec = {
      serialize(state, node) {
        const type = (node.attrs.type as CalloutType) ?? DEFAULT_TYPE;
        state.write(`> [!${type.toUpperCase()}]\n`);
        node.content.forEach((child, _, i) => {
          state.write("> ");
          if (child.type.name === "paragraph") {
            state.renderInline(child);
            if (i < node.childCount - 1) state.write("\n");
          } else {
            state.renderContent(child);
            if (i < node.childCount - 1) state.write("\n");
          }
        });
        state.closeBlock(node);
      },
      parse: {
        setup(md) {
          md.block.ruler.before(
            "blockquote",
            "callout",
            (state: any, startLine: number, endLine: number, silent: boolean) => {
              const start = state.bMarks[startLine] + state.tShift[startLine];
              const max = state.eMarks[startLine];
              if (state.src.slice(start, start + 2) !== "> ") return false;
              if (silent) return true;

              const typeMatch = state.src
                .slice(start, max)
                .match(/^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/i);
              if (!typeMatch) return false;

              const type = normalizeType(typeMatch[1]);
              const lines: string[] = [];
              let line = startLine;
              while (line < endLine) {
                const lineStart = state.bMarks[line] + state.tShift[line];
                const lineEnd = state.eMarks[line];
                const raw = state.src.slice(lineStart, lineEnd);
                const stripped = raw.replace(/^>\s?/, "");
                if (line === startLine) {
                  if (!stripped.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/i)) break;
                } else {
                  if (stripped.length === 0 && line !== startLine + 1) break;
                  lines.push(stripped);
                }
                line++;
                if (line >= endLine) break;
                const nextStart = state.bMarks[line] + state.tShift[line];
                const nextMax = state.eMarks[line];
                const nextRaw = state.src.slice(nextStart, nextMax);
                if (!nextRaw.startsWith(">") && nextRaw.length > 0) break;
              }

              state.line = line;
              let content = `<aside data-callout data-type="${type}"><div data-callout-title>${type}</div><div data-callout-content>`;
              const esc = md.utils.escapeHtml;
              for (let i = 0; i < lines.length; i++) {
                const l = lines[i];
                if (l.length === 0) continue;
                if (i > 0) content += "<br>";
                content += esc(l);
              }
              content += `</div></aside>`;

              const token = state.push("html_block", "", 0);
              token.content = content;
              token.map = [startLine, line];
              token.markup = "";
              token.block = true;
              return true;
            },
            { alt: ["paragraph", "blockquote", "reference", "blockquote_or_paragraph"] }
          );
        },
      },
    };
    return { markdown };
  },
});
