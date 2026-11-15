import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export { lowlight };

const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

function getLanguageLabel(attrs: Record<string, unknown>): string {
  const lang = (attrs.language as string | null) ?? "";
  if (!lang || lang === "plaintext" || lang === "text") return "text";
  return lang;
}

export const CodeBlockHighlight = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: {
    class: "tiptap-code-block",
  },
}).extend({
  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";

      const header = document.createElement("div");
      header.className = "code-block-header";
      header.contentEditable = "false";

      const langLabel = document.createElement("span");
      langLabel.className = "code-block-language";
      langLabel.textContent = getLanguageLabel(node.attrs);
      header.appendChild(langLabel);

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "code-block-copy";
      copyButton.setAttribute("aria-label", "Copy code");
      copyButton.innerHTML = COPY_ICON_SVG;
      let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
      copyButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = node.textContent;
        navigator.clipboard.writeText(text).then(
          () => {
            copyButton.innerHTML = CHECK_ICON_SVG;
            copyButton.classList.add("code-block-copy--success");
            if (copyResetTimer) clearTimeout(copyResetTimer);
            copyResetTimer = setTimeout(() => {
              copyButton.innerHTML = COPY_ICON_SVG;
              copyButton.classList.remove("code-block-copy--success");
            }, 1500);
          },
          () => {
            /* clipboard blocked — no-op */
          }
        );
      });
      header.appendChild(copyButton);

      wrapper.appendChild(header);

      const pre = document.createElement("pre");
      pre.className = "code-block-pre";
      const code = document.createElement("code");
      pre.appendChild(code);
      wrapper.appendChild(pre);

      return {
        dom: wrapper,
        contentDOM: code,
        update(updatedNode) {
          if (updatedNode.type !== node.type) return false;
          langLabel.textContent = getLanguageLabel(updatedNode.attrs);
          return true;
        },
      };
    };
  },
});
