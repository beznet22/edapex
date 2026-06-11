import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export { lowlight };

export const CodeBlockHighlight = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: {
    class: "tiptap-code-block",
  },
});
