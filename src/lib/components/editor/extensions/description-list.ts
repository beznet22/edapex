import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownNodeSpec } from "tiptap-markdown";

/* Description list — mirrors svelte-streamdown shadcnTheme
 * descriptionList / descriptionTerm / descriptionDetail.
 *
 * Markdown syntax (PHP Markdown Extra / Pandoc style):
 *   Term 1
 *   :   Definition 1
 *   :   Definition 2
 *
 *   Term 2
 *   :   Definition 3
 *
 * Renders to <dl><dt>…</dt><dd>…</dd></dl> on output.
 */

export const DescriptionList = Node.create({
  name: "descriptionList",

  group: "block",

  defining: true,

  content: "descriptionTerm descriptionDetail+",

  parseHTML() {
    return [{ tag: "dl" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dl",
      mergeAttributes(HTMLAttributes, { class: "tiptap-description-list" }),
      0,
    ];
  },

  addStorage() {
    const markdown: MarkdownNodeSpec = {
      serialize(state, node) {
        node.forEach((child) => {
          if (child.type.name === "descriptionTerm") {
            state.write(state.esc(child.textContent) + "\n");
          } else if (child.type.name === "descriptionDetail") {
            child.forEach((grandchild, _, i) => {
              state.write(":   ");
              state.renderInline(grandchild);
              if (i < child.childCount - 1) state.write("\n");
            });
            if (child !== node.lastChild) state.write("\n");
          }
        });
        state.closeBlock(node);
      },
      parse: {
        setup(md) {
          md.block.ruler.before(
            "paragraph",
            "description_list",
            (state: any, startLine: number, endLine: number, silent: boolean) => {
              // A definition list starts when a non-blank line is followed by a
              // `: ` line. Scan forward from startLine looking for that pattern.
              const firstLineStart = state.bMarks[startLine] + state.tShift[startLine];
              const firstLineMax = state.eMarks[startLine];
              const firstLineText = state.src.slice(firstLineStart, firstLineMax);
              if (silent) return true;
              if (!firstLineText.startsWith(": ")) return false;

              let line = startLine;
              const groups: { term: string; definitions: string[] }[] = [];
              while (line < endLine) {
                const lineStart = state.bMarks[line] + state.tShift[line];
                const lineEnd = state.eMarks[line];
                const raw = state.src.slice(lineStart, lineEnd);
                if (raw.length === 0) break;
                if (!raw.startsWith(": ")) break;

                // The term is on the previous non-blank line.
                let termLine = line - 1;
                while (termLine >= 0) {
                  const ts = state.bMarks[termLine] + state.tShift[termLine];
                  const te = state.eMarks[termLine];
                  const t = state.src.slice(ts, te);
                  if (t.length > 0) break;
                  termLine--;
                }
                if (termLine < 0) return false;
                const termStart = state.bMarks[termLine] + state.tShift[termLine];
                const termEnd = state.eMarks[termLine];
                const term = state.src.slice(termStart, termEnd);

                // Collect contiguous `: ` definitions for this term.
                const definitions: string[] = [];
                definitions.push(raw.slice(2));
                line++;
                while (line < endLine) {
                  const ds = state.bMarks[line] + state.tShift[line];
                  const de = state.eMarks[line];
                  const dr = state.src.slice(ds, de);
                  if (dr.length === 0 || !dr.startsWith(": ")) break;
                  definitions.push(dr.slice(2));
                  line++;
                }
                groups.push({ term, definitions });
              }
              if (groups.length === 0) return false;

              state.line = line;
              const esc = md.utils.escapeHtml;
              let html = "<dl>";
              for (const g of groups) {
                html += `<dt>${esc(g.term)}</dt>`;
                for (const d of g.definitions) {
                  html += `<dd>${esc(d)}</dd>`;
                }
              }
              html += "</dl>";

              const token = state.push("html_block", "", 0);
              token.content = html;
              token.map = [startLine, line];
              token.markup = "";
              token.block = true;
              return true;
            },
            { alt: ["paragraph", "reference", "blockquote", "list"] }
          );
        },
      },
    };
    return { markdown };
  },
});

export const DescriptionTerm = Node.create({
  name: "descriptionTerm",

  content: "inline*",

  defining: true,

  parseHTML() {
    return [{ tag: "dt" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dt",
      mergeAttributes(HTMLAttributes, { class: "tiptap-description-term" }),
      0,
    ];
  },
});

export const DescriptionDetail = Node.create({
  name: "descriptionDetail",

  content: "block+",

  defining: true,

  parseHTML() {
    return [{ tag: "dd" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dd",
      mergeAttributes(HTMLAttributes, { class: "tiptap-description-detail" }),
      0,
    ];
  },
});
